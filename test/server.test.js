import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  InteractionResponseType,
  InteractionType,
  InteractionResponseFlags,
} from 'discord-interactions';
import {
  AWW_COMMAND,
  INVITE_COMMAND,
  LOLDLE_COMMAND,
} from '../src/commands.js';
import sinon from 'sinon';
import server from '../src/server.js';
import { redditUrl } from '../src/reddit.js';
import { getDailyDateKey } from '../src/progress.js';

describe('Server', () => {
  describe('GET /', () => {
    it('should return a greeting message with the Discord application ID', async () => {
      const request = {
        method: 'GET',
        url: new URL('/', 'http://discordo.example'),
      };
      const env = { DISCORD_APPLICATION_ID: '123456789' };

      const response = await server.fetch(request, env);
      const body = await response.text();

      expect(body).to.equal('👋 123456789');
    });
  });

  describe('POST /', () => {
    let sandbox;
    let verifyDiscordRequestStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      verifyDiscordRequestStub = sandbox.stub(server, 'verifyDiscordRequest');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should handle a PING interaction', async () => {
      const interaction = {
        type: InteractionType.PING,
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {};

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, env);
      const body = await response.json();
      expect(body.type).to.equal(InteractionResponseType.PONG);
    });

    it('should handle an AWW command interaction', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: AWW_COMMAND.name,
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {};

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      // mock the fetch call to reddit
      const result = sandbox
        .stub(globalThis, 'fetch')
        .withArgs(redditUrl)
        .resolves({
          status: 200,
          ok: true,
          json: sinon.fake.resolves({ data: { children: [] } }),
        });

      const response = await server.fetch(request, env);
      const body = await response.json();
      expect(body.type).to.equal(
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      expect(result.calledOnce);
    });

    it('should launch Loldle and follow up with channel progress', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        application_id: '123456789',
        token: 'interaction-token',
        channel_id: 'channel-123',
        data: {
          name: LOLDLE_COMMAND.name,
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {
        PROGRESS_API_BASE_URL: 'https://progress.example',
        PROGRESS_API_SECRET: 'test-secret',
      };

      const dateKey = getDailyDateKey();
      const followupUrl =
        'https://discord.com/api/v10/webhooks/123456789/interaction-token';
      const progressUrl = `https://progress.example/channel-progress?channelId=channel-123&dateKey=${encodeURIComponent(dateKey)}`;

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction,
      });

      const fetchStub = sandbox.stub(globalThis, 'fetch');
      fetchStub.callsFake(async (url) => {
        if (url === progressUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              channelId: 'channel-123',
              dateKey,
              players: [
                {
                  userId: '1',
                  username: 'Alice',
                  guessCount: 3,
                  solved: true,
                },
                {
                  userId: '2',
                  username: 'Bob',
                  guessCount: 2,
                  solved: false,
                },
              ],
            }),
            text: async () => '',
          };
        }
        if (url === followupUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => '',
          };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const pending = [];
      const context = {
        waitUntil(promise) {
          pending.push(promise);
        },
      };

      const response = await server.fetch(request, env, context);
      const body = await response.json();
      expect(body.type).to.equal(InteractionResponseType.LAUNCH_ACTIVITY);

      await Promise.all(pending);

      expect(fetchStub.calledTwice).to.equal(true);
      expect(fetchStub.firstCall.args[0]).to.equal(progressUrl);
      expect(fetchStub.secondCall.args[0]).to.equal(followupUrl);

      const payload = JSON.parse(fetchStub.secondCall.args[1].body);
      expect(payload.embeds[0].title).to.equal(`Loldle — ${dateKey}`);
      expect(payload.embeds[0].description).to.include('Alice');
      expect(payload.embeds[0].description).to.include('Bob');
    });

    it('should handle an invite command interaction', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: INVITE_COMMAND.name,
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {
        DISCORD_APPLICATION_ID: '123456789',
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, env);
      const body = await response.json();
      expect(body.type).to.equal(
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      expect(body.data.content).to.include(
        'https://discord.com/oauth2/authorize?client_id=123456789&scope=applications.commands',
      );
      expect(body.data.flags).to.equal(InteractionResponseFlags.EPHEMERAL);
    });

    it('should handle an unknown command interaction', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: 'unknown',
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, {});
      const body = await response.json();
      expect(response.status).to.equal(400);
      expect(body.error).to.equal('Unknown Type');
    });
  });

  describe('All other routes', () => {
    it('should return a "Not Found" response', async () => {
      const request = {
        method: 'GET',
        url: new URL('/unknown', 'http://discordo.example'),
      };
      const response = await server.fetch(request, {});
      expect(response.status).to.equal(404);
      const body = await response.text();
      expect(body).to.equal('Not Found.');
    });
  });
});
