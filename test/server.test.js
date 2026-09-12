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
import {
  getDailyDateKey,
  progressEmbedTitle,
  findProgressMessage,
  getLaunchPlayer,
  mergeLaunchPlayer,
  sendLoldleProgressFollowup,
} from '../src/progress.js';

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

  describe('POST /sync-progress', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should reject unauthorized requests', async () => {
      const request = {
        method: 'POST',
        url: new URL('/sync-progress', 'http://discordo.example'),
        headers: new Headers({ Authorization: 'Bearer wrong' }),
        json: async () => ({ channelId: 'channel-123' }),
      };
      const env = { PROGRESS_API_SECRET: 'test-secret' };

      const response = await server.fetch(request, env);
      expect(response.status).to.equal(401);
    });

    it('should edit an existing progress message when syncing', async () => {
      const dateKey = getDailyDateKey();
      const title = progressEmbedTitle(dateKey);
      const progressUrl = `https://progress.example/channel-progress?channelId=channel-123&dateKey=${encodeURIComponent(dateKey)}`;
      const messagesUrl =
        'https://discord.com/api/v10/channels/channel-123/messages?limit=50';
      const editUrl =
        'https://discord.com/api/v10/channels/channel-123/messages/msg-1';

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
                  username: 'bming',
                  guessCount: 15,
                  solved: false,
                },
              ],
            }),
            text: async () => '',
          };
        }
        if (url === messagesUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => [
              {
                id: 'msg-1',
                author: { id: 'app-1' },
                embeds: [{ title }],
              },
            ],
            text: async () => '',
          };
        }
        if (url === editUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ id: 'msg-1' }),
            text: async () => '',
          };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const request = {
        method: 'POST',
        url: new URL('/sync-progress', 'http://discordo.example'),
        headers: new Headers({ Authorization: 'Bearer test-secret' }),
        json: async () => ({ channelId: 'channel-123' }),
      };
      const env = {
        PROGRESS_API_SECRET: 'test-secret',
        PROGRESS_API_BASE_URL: 'https://progress.example',
        DISCORD_APPLICATION_ID: 'app-1',
        DISCORD_TOKEN: 'bot-token',
      };

      const response = await server.fetch(request, env);
      const body = await response.json();

      expect(response.status).to.equal(200);
      expect(body).to.deep.equal({
        ok: true,
        action: 'edited',
        messageId: 'msg-1',
      });
      expect(fetchStub.calledWith(editUrl)).to.equal(true);
      const editCall = fetchStub.getCalls().find((c) => c.args[0] === editUrl);
      expect(editCall.args[1].method).to.equal('PATCH');
      const payload = JSON.parse(editCall.args[1].body);
      expect(payload.embeds[0].description).to.include('bming');
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

    it('should launch Loldle and create a progress message when none exists', async () => {
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
        DISCORD_TOKEN: 'bot-token',
        DISCORD_APPLICATION_ID: '123456789',
        PROGRESS_LAUNCH_REFRESH_DELAYS_MS: '[]',
      };

      const dateKey = getDailyDateKey();
      const progressUrl = `https://progress.example/channel-progress?channelId=channel-123&dateKey=${encodeURIComponent(dateKey)}`;
      const messagesUrl =
        'https://discord.com/api/v10/channels/channel-123/messages?limit=50';
      const createUrl =
        'https://discord.com/api/v10/channels/channel-123/messages';

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
        if (url === messagesUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => [],
            text: async () => '',
          };
        }
        if (url === createUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ id: 'new-msg' }),
            text: async () => JSON.stringify({ id: 'new-msg' }),
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

      expect(fetchStub.calledThrice).to.equal(true);
      const createCall = fetchStub
        .getCalls()
        .find((c) => c.args[0] === createUrl);
      expect(createCall.args[1].method).to.equal('POST');
      const payload = JSON.parse(createCall.args[1].body);
      expect(payload.embeds[0].title).to.equal(`Loldle — ${dateKey}`);
      expect(payload.embeds[0].description).to.include('Alice');
      expect(payload.embeds[0].description).to.include('Bob');
    });

    it("should launch Loldle and edit today's existing progress message", async () => {
      const dateKey = getDailyDateKey();
      const title = progressEmbedTitle(dateKey);
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
        DISCORD_TOKEN: 'bot-token',
        DISCORD_APPLICATION_ID: '123456789',
        PROGRESS_LAUNCH_REFRESH_DELAYS_MS: '[]',
      };

      const progressUrl = `https://progress.example/channel-progress?channelId=channel-123&dateKey=${encodeURIComponent(dateKey)}`;
      const messagesUrl =
        'https://discord.com/api/v10/channels/channel-123/messages?limit=50';
      const editUrl =
        'https://discord.com/api/v10/channels/channel-123/messages/existing-msg';

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
                  userId: '2',
                  username: 'bming',
                  guessCount: 15,
                  solved: false,
                },
              ],
            }),
            text: async () => '',
          };
        }
        if (url === messagesUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => [
              {
                id: 'existing-msg',
                author: { id: '123456789' },
                embeds: [{ title }],
              },
            ],
            text: async () => '',
          };
        }
        if (url === editUrl) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ id: 'existing-msg' }),
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

      const editCall = fetchStub.getCalls().find((c) => c.args[0] === editUrl);
      expect(editCall).to.exist;
      expect(editCall.args[1].method).to.equal('PATCH');
      const payload = JSON.parse(editCall.args[1].body);
      expect(payload.embeds[0].description).to.include('bming');
      expect(payload.embeds[0].description).to.include('15');
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

  describe('progress helpers', () => {
    it('findProgressMessage matches bot embed by title', () => {
      const dateKey = '2026-09-11';
      const messages = [
        {
          id: '1',
          author: { id: 'other' },
          embeds: [{ title: progressEmbedTitle(dateKey) }],
        },
        {
          id: '2',
          author: { id: 'app' },
          embeds: [{ title: progressEmbedTitle(dateKey) }],
        },
      ];
      const found = findProgressMessage(messages, {
        dateKey,
        applicationId: 'app',
      });
      expect(found.id).to.equal('2');
    });

    it('seeds the /loldle launcher when progress is still empty', () => {
      const launchPlayer = getLaunchPlayer({
        user: { id: 'u1', username: 'bming' },
      });
      const players = mergeLaunchPlayer([], launchPlayer);
      expect(players).to.deep.equal([
        {
          userId: 'u1',
          username: 'bming',
          guessCount: 0,
          solved: false,
        },
      ]);
    });

    it('re-syncs the board after launch delays without another /loldle', async () => {
      const dateKey = getDailyDateKey();
      const title = progressEmbedTitle(dateKey);
      const progressUrl = `https://progress.example/channel-progress?channelId=channel-123&dateKey=${encodeURIComponent(dateKey)}`;
      const messagesUrl =
        'https://discord.com/api/v10/channels/channel-123/messages?limit=50';
      const editUrl =
        'https://discord.com/api/v10/channels/channel-123/messages/msg-1';
      const createUrl =
        'https://discord.com/api/v10/channels/channel-123/messages';

      let progressCalls = 0;
      const fetchStub = sinon
        .stub(globalThis, 'fetch')
        .callsFake(async (url) => {
          if (url === progressUrl) {
            progressCalls += 1;
            const players =
              progressCalls === 1
                ? []
                : [
                    {
                      userId: 'u1',
                      username: 'bming',
                      guessCount: 2,
                      solved: false,
                    },
                  ];
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => ({
                channelId: 'channel-123',
                dateKey,
                players,
              }),
              text: async () => '',
            };
          }
          if (url === messagesUrl) {
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () =>
                progressCalls === 1
                  ? []
                  : [
                      {
                        id: 'msg-1',
                        author: { id: 'app-1' },
                        embeds: [{ title }],
                      },
                    ],
              text: async () => '',
            };
          }
          if (url === createUrl) {
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => ({ id: 'msg-1' }),
              text: async () => '',
            };
          }
          if (url === editUrl) {
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => ({ id: 'msg-1' }),
              text: async () => '',
            };
          }
          throw new Error(`Unexpected fetch URL: ${url}`);
        });

      const sleeps = [];
      try {
        await sendLoldleProgressFollowup(
          {
            application_id: 'app-1',
            token: 'interaction-token',
            channel_id: 'channel-123',
            user: { id: 'u1', username: 'bming' },
          },
          {
            PROGRESS_API_BASE_URL: 'https://progress.example',
            PROGRESS_API_SECRET: 'test-secret',
            DISCORD_TOKEN: 'bot-token',
            DISCORD_APPLICATION_ID: 'app-1',
          },
          fetchStub,
          {
            refreshDelaysMs: [1, 1],
            sleepFn: async (ms) => {
              sleeps.push(ms);
            },
          },
        );

        expect(sleeps).to.deep.equal([1, 1]);
        expect(progressCalls).to.equal(3);
        const editCall = fetchStub
          .getCalls()
          .find((call) => call.args[0] === editUrl);
        expect(editCall).to.exist;
        const payload = JSON.parse(editCall.args[1].body);
        expect(payload.embeds[0].description).to.include('bming');
        expect(payload.embeds[0].description).to.include('2');
      } finally {
        fetchStub.restore();
      }
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
