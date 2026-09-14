/**
 * Helpers for today's NY-date channel progress and Discord progress embeds.
 *
 * Wordle-style board: keep one channel message per day and edit it in place
 * (via Bot token / interaction webhook) instead of posting a new follow-up
 * on every /loldle.
 */

import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';

export const DAILY_TIME_ZONE = 'America/New_York';

/** custom_id for the Play button on the daily progress board. */
export const LOLDLE_PLAY_CUSTOM_ID = 'loldle_play';

/**
 * Absolute ms-from-start times to re-sync after /loldle / Play.
 * (Not sequential sleeps — 25s here means ~25s after launch, not 2.5+7+15+25.)
 */
export const DEFAULT_LAUNCH_REFRESH_DELAYS_MS = [
  1500, 3500, 7000, 12000, 20000, 30000,
];

/**
 * Absolute ms-from-start follow-ups after POST /sync-progress.
 * Catches finish writes that land just after Convex fires sync, and keeps the
 * Discord edit work on the worker via waitUntil if the Activity closes quickly.
 */
export const DEFAULT_SYNC_REFRESH_DELAYS_MS = [500, 2000, 5000];

/**
 * Action row with a Play button that launches the Loldle Activity
 * (handled via MESSAGE_COMPONENT → LAUNCH_ACTIVITY).
 */
export function buildProgressMessageComponents() {
  return [
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          style: ButtonStyleTypes.PRIMARY,
          label: 'Play',
          custom_id: LOLDLE_PLAY_CUSTOM_ID,
        },
      ],
    },
  ];
}

export function getDailyDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA yields YYYY-MM-DD
  return formatter.format(date);
}

export function progressEmbedTitle(dateKey) {
  return `Loldle — ${dateKey}`;
}

/**
 * Name other Discord users see in a guild/channel:
 * server nick → display name (global_name) → username.
 */
export function getDiscordVisibleName({ member, user } = {}) {
  const resolvedUser = user ?? member?.user;
  const nick = typeof member?.nick === 'string' ? member.nick.trim() : '';
  if (nick) {
    return nick;
  }
  const globalName =
    typeof resolvedUser?.global_name === 'string'
      ? resolvedUser.global_name.trim()
      : '';
  if (globalName) {
    return globalName;
  }
  const username =
    typeof resolvedUser?.username === 'string'
      ? resolvedUser.username.trim()
      : '';
  return username || 'Unknown';
}

export function normalizePlayer(player = {}) {
  return {
    userId: player.userId ?? player.user_id ?? player.id,
    username: player.username ?? player.name ?? 'Unknown',
    guessCount: player.guessCount ?? player.guess_count ?? player.guesses ?? 0,
    solved: Boolean(player.solved ?? player.isSolved ?? false),
  };
}

/**
 * Prefer a user mention so Discord clients render the server nick / display
 * name others see in the channel. Mentions inside embeds do not ping.
 */
export function formatPlayerDisplayName(player = {}) {
  const normalized = normalizePlayer(player);
  if (normalized.userId) {
    return `<@${normalized.userId}>`;
  }
  return normalized.username || 'Unknown';
}

export function getFewestSolvedGuessCount(players = []) {
  const solvedGuessCounts = players
    .map(normalizePlayer)
    .filter((player) => player.solved)
    .map((player) => Number(player.guessCount))
    .filter((count) => Number.isFinite(count));

  if (!solvedGuessCounts.length) {
    return null;
  }

  return Math.min(...solvedGuessCounts);
}

export function formatProgressLines(players = []) {
  if (!players.length) {
    return ["No one in this channel has started today's Loldle yet."];
  }

  const fewestSolvedGuesses = getFewestSolvedGuessCount(players);

  return players.map((player) => {
    const normalized = normalizePlayer(player);
    const name = formatPlayerDisplayName(normalized);
    if (normalized.solved) {
      const guesses = normalized.guessCount ?? '?';
      const isCrown =
        fewestSolvedGuesses !== null &&
        Number(normalized.guessCount) === fewestSolvedGuesses;
      const prefix = isCrown ? '👑' : '✅';
      return `${prefix} **${name}** — ${guesses}/∞`;
    }
    const guesses = normalized.guessCount ?? 0;
    return `🔄 **${name}** — ${guesses} guess${guesses === 1 ? '' : 'es'}`;
  });
}

export function buildProgressEmbed({ dateKey, players }) {
  const lines = formatProgressLines(players);
  return {
    title: progressEmbedTitle(dateKey),
    description: lines.join('\n'),
    color: 0xc8aa6e,
    footer: {
      text: 'Same-channel progress for today (America/New_York)',
    },
  };
}

export function getLaunchPlayer(interaction) {
  const member = interaction?.member;
  const user = member?.user ?? interaction?.user;
  if (!user?.id) {
    return null;
  }
  return {
    userId: user.id,
    username: getDiscordVisibleName({ member, user }),
    guessCount: 0,
    solved: false,
  };
}

export function mergeLaunchPlayer(players = [], launchPlayer) {
  if (!launchPlayer) {
    return players;
  }
  const alreadyTracked = players.some((player) => {
    const normalized = normalizePlayer(player);
    if (normalized.userId && normalized.userId === launchPlayer.userId) {
      return true;
    }
    return (
      normalized.username &&
      launchPlayer.username &&
      normalized.username.toLowerCase() === launchPlayer.username.toLowerCase()
    );
  });
  if (alreadyTracked) {
    return players;
  }
  return [...players, launchPlayer];
}

export function parseRefreshDelaysMs(
  envValue,
  fallback = DEFAULT_LAUNCH_REFRESH_DELAYS_MS,
) {
  if (envValue === undefined || envValue === null || envValue === '') {
    return fallback;
  }
  if (Array.isArray(envValue)) {
    return envValue.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  }
  try {
    const parsed = JSON.parse(envValue);
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  } catch {
    return fallback;
  }
}

/** @deprecated Prefer parseRefreshDelaysMs */
export function parseLaunchRefreshDelaysMs(
  envValue,
  fallback = DEFAULT_LAUNCH_REFRESH_DELAYS_MS,
) {
  return parseRefreshDelaysMs(envValue, fallback);
}

export function sleep(ms, { setTimeoutFn = setTimeout } = {}) {
  return new Promise((resolve) => setTimeoutFn(resolve, ms));
}

/**
 * Run progress board re-syncs at absolute delays from start (sorted ms).
 * Tracks elapsed so fake/test sleep still advances the schedule correctly.
 */
export async function runDelayedProgressRefreshes({
  channelId,
  dateKey,
  env,
  fetchImpl = fetch,
  refreshDelaysMs = [],
  sleepFn = sleep,
  syncFn = syncChannelProgress,
}) {
  if (!channelId || !refreshDelaysMs.length) {
    return;
  }

  const absoluteDelays = [...refreshDelaysMs]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  let elapsedMs = 0;
  for (const targetMs of absoluteDelays) {
    const waitMs = Math.max(0, targetMs - elapsedMs);
    if (waitMs > 0) {
      await sleepFn(waitMs);
      elapsedMs += waitMs;
    }
    try {
      await syncFn({ channelId, dateKey }, env, fetchImpl);
    } catch (error) {
      console.error('Delayed progress refresh failed:', error);
    }
  }
}

export async function fetchChannelProgress({
  baseUrl,
  secret,
  channelId,
  dateKey,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !secret) {
    throw new Error(
      'PROGRESS_API_BASE_URL and PROGRESS_API_SECRET are required',
    );
  }
  if (!channelId) {
    throw new Error('channelId is required');
  }

  const url = new URL('/channel-progress', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('channelId', channelId);
  url.searchParams.set('dateKey', dateKey);

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Progress API error: ${response.status} ${response.statusText}\n${body}`,
    );
  }

  return response.json();
}

async function readDiscordError(response) {
  const errorBody = await response.text();
  return `${response.status} ${response.statusText}\n${errorBody}`;
}

export async function postInteractionFollowup({
  applicationId,
  interactionToken,
  body,
  fetchImpl = fetch,
}) {
  const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Discord follow-up API error: ${await readDiscordError(response)}`,
    );
  }

  // Interaction follow-ups always wait; body is the created message.
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function editInteractionFollowup({
  applicationId,
  interactionToken,
  messageId,
  body,
  fetchImpl = fetch,
}) {
  const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/${messageId}`;
  const response = await fetchImpl(webhookUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Discord edit follow-up API error: ${await readDiscordError(response)}`,
    );
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchChannelMessages({
  channelId,
  botToken,
  limit = 50,
  fetchImpl = fetch,
}) {
  const url = new URL(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
  );
  url.searchParams.set('limit', String(limit));

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bot ${botToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Discord channel messages API error: ${await readDiscordError(response)}`,
    );
  }

  return response.json();
}

export function findProgressMessage(messages, { dateKey, applicationId }) {
  const title = progressEmbedTitle(dateKey);
  return (
    messages.find(
      (message) =>
        message?.author?.id === applicationId &&
        Array.isArray(message.embeds) &&
        message.embeds.some((embed) => embed?.title === title),
    ) ?? null
  );
}

export async function editChannelMessage({
  channelId,
  messageId,
  botToken,
  body,
  fetchImpl = fetch,
}) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
  const response = await fetchImpl(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Discord edit message API error: ${await readDiscordError(response)}`,
    );
  }

  return response.json();
}

export async function createChannelMessage({
  channelId,
  botToken,
  body,
  fetchImpl = fetch,
}) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Discord create message API error: ${await readDiscordError(response)}`,
    );
  }

  return response.json();
}

/**
 * Keep a single daily progress message in the channel.
 * Prefer Bot-token edit/create so the board stays editable all day
 * (interaction tokens expire after ~15 minutes).
 */
export async function upsertChannelProgressMessage({
  channelId,
  applicationId,
  botToken,
  interactionToken,
  dateKey,
  embed,
  messageId = null,
  fetchImpl = fetch,
}) {
  const body = {
    embeds: [embed],
    components: buildProgressMessageComponents(),
    // Mentions in embeds don't ping, but keep parse empty as a safeguard.
    allowed_mentions: { parse: [] },
  };

  if (botToken && channelId && messageId) {
    try {
      const updated = await editChannelMessage({
        channelId,
        messageId,
        botToken,
        body,
        fetchImpl,
      });
      return { action: 'edited', message: updated };
    } catch (error) {
      console.error(
        'Direct edit by messageId failed; falling back to channel lookup:',
        error,
      );
    }
  }

  if (botToken && channelId && applicationId) {
    try {
      const messages = await fetchChannelMessages({
        channelId,
        botToken,
        fetchImpl,
      });
      const existing = findProgressMessage(messages, {
        dateKey,
        applicationId,
      });
      if (existing) {
        const updated = await editChannelMessage({
          channelId,
          messageId: existing.id,
          botToken,
          body,
          fetchImpl,
        });
        return { action: 'edited', message: updated };
      }
    } catch (error) {
      console.error(
        'Failed to look up existing progress message; will create instead:',
        error,
      );
    }

    try {
      const created = await createChannelMessage({
        channelId,
        botToken,
        body,
        fetchImpl,
      });
      return { action: 'created', message: created };
    } catch (error) {
      console.error(
        'Failed to create progress message with bot token; trying interaction follow-up:',
        error,
      );
    }
  }

  if (applicationId && interactionToken) {
    const created = await postInteractionFollowup({
      applicationId,
      interactionToken,
      body,
      fetchImpl,
    });
    return { action: 'followup', message: created };
  }

  throw new Error(
    'Cannot upsert progress message: need DISCORD_TOKEN (preferred) or an interaction token',
  );
}

export async function loadProgressEmbed({
  env,
  channelId,
  dateKey = getDailyDateKey(),
  launchPlayer = null,
  players: playersOverride = null,
  fetchImpl = fetch,
}) {
  let players = [];
  let descriptionExtra = '';

  if (Array.isArray(playersOverride)) {
    players = playersOverride.map(normalizePlayer);
  } else if (!channelId) {
    descriptionExtra =
      '\n_No channel id on this interaction — progress skipped._';
  } else if (!env.PROGRESS_API_BASE_URL || !env.PROGRESS_API_SECRET) {
    descriptionExtra = '\n_Progress API is not configured on this worker yet._';
  } else {
    try {
      const payload = await fetchChannelProgress({
        baseUrl: env.PROGRESS_API_BASE_URL,
        secret: env.PROGRESS_API_SECRET,
        channelId,
        dateKey,
        fetchImpl,
      });
      players = (payload.players ?? []).map(normalizePlayer);
    } catch (error) {
      console.error('Failed to fetch channel progress:', error);
      descriptionExtra = '\n_Could not load channel progress right now._';
    }
  }

  players = mergeLaunchPlayer(players, launchPlayer);

  const embed = buildProgressEmbed({ dateKey, players });
  if (descriptionExtra) {
    embed.description = `${embed.description}${descriptionExtra}`;
  }
  return { embed, dateKey, players };
}

export async function sendLoldleProgressFollowup(
  interaction,
  env,
  fetchImpl = fetch,
  {
    refreshDelaysMs = parseRefreshDelaysMs(
      env.PROGRESS_LAUNCH_REFRESH_DELAYS_MS,
    ),
    sleepFn = sleep,
  } = {},
) {
  const applicationId = interaction.application_id;
  const interactionToken = interaction.token;
  const channelId = interaction.channel_id;

  if (!applicationId || !interactionToken) {
    throw new Error(
      'Missing application_id or interaction token for follow-up',
    );
  }

  const launchPlayer = getLaunchPlayer(interaction);
  const { embed, dateKey } = await loadProgressEmbed({
    env,
    channelId,
    launchPlayer,
    fetchImpl,
  });

  const firstResult = await upsertChannelProgressMessage({
    channelId,
    applicationId,
    botToken: env.DISCORD_TOKEN,
    interactionToken,
    dateKey,
    embed,
    fetchImpl,
  });

  // /loldle races Activity startup: Progress API often has no row yet on the
  // first paint. Re-fetch/edit a few times (absolute schedule from launch) so
  // the launcher appears without needing another slash. Mid-game / finish
  // updates still need Convex to hit POST /sync-progress.
  if (
    channelId &&
    env.DISCORD_TOKEN &&
    env.DISCORD_APPLICATION_ID &&
    refreshDelaysMs.length
  ) {
    await runDelayedProgressRefreshes({
      channelId,
      dateKey,
      env,
      fetchImpl,
      refreshDelaysMs,
      sleepFn,
    });
  }

  return firstResult;
}

/**
 * Refresh today's progress board for a channel (e.g. Convex calls this
 * after a guess / finish so the board edits live, Wordle-style).
 *
 * Optional `players` paints the board from the POST body (skips Progress GET),
 * useful so a finish always lands even if the Activity closes immediately.
 * Optional `messageId` skips the channel history lookup for a faster edit.
 */
export async function syncChannelProgress(
  { channelId, dateKey, messageId = null, players = null },
  env,
  fetchImpl = fetch,
) {
  if (!channelId) {
    throw new Error('channelId is required');
  }

  const applicationId = env.DISCORD_APPLICATION_ID;
  const botToken = env.DISCORD_TOKEN;
  if (!applicationId || !botToken) {
    throw new Error(
      'DISCORD_APPLICATION_ID and DISCORD_TOKEN are required to sync progress',
    );
  }

  const resolvedDateKey = dateKey || getDailyDateKey();
  const { embed } = await loadProgressEmbed({
    env,
    channelId,
    dateKey: resolvedDateKey,
    players,
    fetchImpl,
  });

  return upsertChannelProgressMessage({
    channelId,
    applicationId,
    botToken,
    dateKey: resolvedDateKey,
    messageId,
    embed,
    fetchImpl,
  });
}

/**
 * Sync now, then re-sync on an absolute follow-up schedule.
 * Used by POST /sync-progress so finishes still update if the caller
 * disconnects quickly (pair with context.waitUntil on the worker).
 */
export async function syncChannelProgressWithFollowups(
  { channelId, dateKey, messageId = null, players = null },
  env,
  fetchImpl = fetch,
  {
    refreshDelaysMs = parseRefreshDelaysMs(
      env.PROGRESS_SYNC_REFRESH_DELAYS_MS,
      DEFAULT_SYNC_REFRESH_DELAYS_MS,
    ),
    sleepFn = sleep,
  } = {},
) {
  const result = await syncChannelProgress(
    { channelId, dateKey, messageId, players },
    env,
    fetchImpl,
  );

  // Follow-ups re-fetch Progress API (ignore one-shot players snapshot) so a
  // finish that commits slightly after the first sync still flips to ✅.
  await runDelayedProgressRefreshes({
    channelId,
    dateKey: dateKey || getDailyDateKey(),
    env,
    fetchImpl,
    refreshDelaysMs,
    sleepFn,
  });

  return result;
}
