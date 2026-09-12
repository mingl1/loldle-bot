/**
 * Helpers for today's NY-date channel progress and Discord progress embeds.
 *
 * Wordle-style board: keep one channel message per day and edit it in place
 * (via Bot token / interaction webhook) instead of posting a new follow-up
 * on every /loldle.
 */

export const DAILY_TIME_ZONE = 'America/New_York';

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

export function formatProgressLines(players = []) {
  if (!players.length) {
    return ["No one in this channel has started today's Loldle yet."];
  }

  return players.map((player) => {
    const name = player.username || 'Unknown';
    if (player.solved) {
      const guesses = player.guessCount ?? '?';
      return `✅ **${name}** — ${guesses}/∞`;
    }
    const guesses = player.guessCount ?? 0;
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
  fetchImpl = fetch,
}) {
  const body = { embeds: [embed] };

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
  fetchImpl = fetch,
}) {
  let players = [];
  let descriptionExtra = '';

  if (!channelId) {
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
      players = payload.players ?? [];
    } catch (error) {
      console.error('Failed to fetch channel progress:', error);
      descriptionExtra = '\n_Could not load channel progress right now._';
    }
  }

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
) {
  const applicationId = interaction.application_id;
  const interactionToken = interaction.token;
  const channelId = interaction.channel_id;

  if (!applicationId || !interactionToken) {
    throw new Error(
      'Missing application_id or interaction token for follow-up',
    );
  }

  const { embed, dateKey } = await loadProgressEmbed({
    env,
    channelId,
    fetchImpl,
  });

  return upsertChannelProgressMessage({
    channelId,
    applicationId,
    botToken: env.DISCORD_TOKEN,
    interactionToken,
    dateKey,
    embed,
    fetchImpl,
  });
}

/**
 * Refresh today's progress board for a channel (e.g. Convex calls this
 * after a guess so the board edits live, Wordle-style).
 */
export async function syncChannelProgress(
  { channelId, dateKey },
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
    fetchImpl,
  });

  return upsertChannelProgressMessage({
    channelId,
    applicationId,
    botToken,
    dateKey: resolvedDateKey,
    embed,
    fetchImpl,
  });
}
