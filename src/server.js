/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { AWW_COMMAND, INVITE_COMMAND, LOLDLE_COMMAND } from './commands.js';
import { getCuteUrl } from './reddit.js';
import { InteractionResponseFlags } from 'discord-interactions';
import {
  LOLDLE_PLAY_CUSTOM_ID,
  sendLoldleProgressFollowup,
  syncChannelProgressWithFollowups,
  parseRefreshDelaysMs,
  DEFAULT_SYNC_REFRESH_DELAYS_MS,
} from './progress.js';

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    };
    super(jsonBody, init);
  }
}

const router = AutoRouter();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (request, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Progress API (Convex) can POST here after guesses / finishes so the channel
 * board is edited in place instead of stacking new messages.
 *
 * Authorization: Bearer ${PROGRESS_API_SECRET}
 * Body JSON: {
 *   "channelId": "...",
 *   "dateKey": "YYYY-MM-DD",   // optional
 *   "messageId": "...",        // optional — skip channel history lookup
 *   "players": [               // optional — paint board from this snapshot
 *     {
 *       "userId": "...",
 *       "username": "...",            // legacy display fallback
 *       "stringName": "...",          // clickable label (display name)
 *       "discordName": "...",         // shown as (@discordName)
 *       "shareImageUrl": "https://…", // CDN URL for share PNG
 *       "guessCount": 3,
 *       "solved": false
 *     }
 *   ]
 * }
 *
 * Returns quickly (202) when waitUntil is available so a fast Activity exit
 * does not cancel the Discord edit; follow-up re-syncs catch late finishes.
 */
router.post('/sync-progress', async (request, env, context) => {
  const auth = request.headers.get('Authorization') || '';
  const expected = env.PROGRESS_API_SECRET
    ? `Bearer ${env.PROGRESS_API_SECRET}`
    : null;
  if (!expected || auth !== expected) {
    return new JsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new JsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const channelId = payload?.channelId ?? payload?.channel_id;
  if (!channelId || typeof channelId !== 'string') {
    return new JsonResponse(
      { error: 'channelId is required' },
      { status: 400 },
    );
  }

  const messageId =
    typeof payload?.messageId === 'string'
      ? payload.messageId
      : typeof payload?.message_id === 'string'
        ? payload.message_id
        : null;
  const players = Array.isArray(payload?.players) ? payload.players : null;
  const dateKey = payload?.dateKey ?? payload?.date_key ?? null;
  const refreshDelaysMs = parseRefreshDelaysMs(
    env.PROGRESS_SYNC_REFRESH_DELAYS_MS,
    DEFAULT_SYNC_REFRESH_DELAYS_MS,
  );

  const syncArgs = { channelId, dateKey, messageId, players };

  const work = syncChannelProgressWithFollowups(syncArgs, env, fetch, {
    refreshDelaysMs,
  }).catch((error) => {
    console.error('Error syncing channel progress:', error);
    return null;
  });

  // Prefer waitUntil so Discord edits finish even if the Activity / Convex
  // caller disconnects right after solve.
  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(work);
    return new JsonResponse({ ok: true, accepted: true }, { status: 202 });
  }

  try {
    const result = await work;
    if (!result) {
      return new JsonResponse(
        { error: 'Failed to sync progress' },
        { status: 500 },
      );
    }
    return new JsonResponse({
      ok: true,
      accepted: false,
      action: result.action,
      messageId: result.message?.id ?? null,
    });
  } catch (error) {
    console.error('Error syncing channel progress:', error);
    return new JsonResponse(
      { error: 'Failed to sync progress' },
      { status: 500 },
    );
  }
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env, context) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the Discord developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // Most user commands will come as `APPLICATION_COMMAND`.
    switch (interaction.data.name.toLowerCase()) {
      case AWW_COMMAND.name.toLowerCase(): {
        const cuteUrl = await getCuteUrl();
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: cuteUrl,
          },
        });
      }
      case INVITE_COMMAND.name.toLowerCase(): {
        const applicationId = env.DISCORD_APPLICATION_ID;
        const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands`;
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: INVITE_URL,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      case LOLDLE_COMMAND.name.toLowerCase(): {
        // Launch the Activity immediately. Progress is upserted (edit-or-create)
        // against today's single channel board — same idea as Wordle editing
        // the interaction/channel message instead of spamming new ones.
        // Entry Point stays handler:2 (Discord-native Launch) so App Launcher
        // never depends on this worker; only CHAT_INPUT /loldle hits this branch.
        return launchLoldleActivity(interaction, env, context);
      }
      default:
        return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
    }
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id;
    if (customId === LOLDLE_PLAY_CUSTOM_ID) {
      // Play button on the daily progress board — same launch path as /loldle.
      return launchLoldleActivity(interaction, env, context);
    }
    return new JsonResponse({ error: 'Unknown component' }, { status: 400 });
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});

function launchLoldleActivity(interaction, env, context) {
  const followupPromise = sendLoldleProgressFollowup(interaction, env).catch(
    (error) => {
      console.error('Error upserting Loldle progress message:', error);
    },
  );

  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(followupPromise);
  }

  return new JsonResponse({
    type: InteractionResponseType.LAUNCH_ACTIVITY,
  });
}
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

const server = {
  verifyDiscordRequest,
  fetch(request, env, context) {
    return router.fetch(request, env, context);
  },
};

export default server;
