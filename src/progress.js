/**
 * Helpers for today's NY-date channel progress and Discord follow-up embeds.
 */

export const DAILY_TIME_ZONE = 'America/New_York'

export function getDailyDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA yields YYYY-MM-DD
  return formatter.format(date)
}

export function formatProgressLines(players = []) {
  if (!players.length) {
    return ['No one in this channel has started today\'s Loldle yet.']
  }

  return players.map((player) => {
    const name = player.username || 'Unknown'
    if (player.solved) {
      const guesses = player.guessCount ?? '?'
      return `✅ **${name}** — ${guesses}/∞`
    }
    const guesses = player.guessCount ?? 0
    return `🔄 **${name}** — ${guesses} guess${guesses === 1 ? '' : 'es'}`
  })
}

export function buildProgressEmbed({ dateKey, players }) {
  const lines = formatProgressLines(players)
  return {
    title: `Loldle — ${dateKey}`,
    description: lines.join('\n'),
    color: 0xc8aa6e,
    footer: {
      text: 'Same-channel progress for today (America/New_York)',
    },
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
    throw new Error('PROGRESS_API_BASE_URL and PROGRESS_API_SECRET are required')
  }
  if (!channelId) {
    throw new Error('channelId is required')
  }

  const url = new URL('/channel-progress', baseUrl.replace(/\/$/, ''))
  url.searchParams.set('channelId', channelId)
  url.searchParams.set('dateKey', dateKey)

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Progress API error: ${response.status} ${response.statusText}\n${body}`,
    )
  }

  return response.json()
}

export async function postInteractionFollowup({
  applicationId,
  interactionToken,
  body,
  fetchImpl = fetch,
}) {
  const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Discord follow-up API error: ${response.status} ${response.statusText}\n${errorBody}`,
    )
  }

  return response
}

export async function sendLoldleProgressFollowup(interaction, env, fetchImpl = fetch) {
  const applicationId = interaction.application_id
  const interactionToken = interaction.token
  const channelId = interaction.channel_id

  if (!applicationId || !interactionToken) {
    throw new Error('Missing application_id or interaction token for follow-up')
  }

  const dateKey = getDailyDateKey()
  let players = []
  let descriptionExtra = ''

  if (!channelId) {
    descriptionExtra = '\n_No channel id on this interaction — progress skipped._'
  } else if (!env.PROGRESS_API_BASE_URL || !env.PROGRESS_API_SECRET) {
    descriptionExtra =
      '\n_Progress API is not configured on this worker yet._'
  } else {
    try {
      const payload = await fetchChannelProgress({
        baseUrl: env.PROGRESS_API_BASE_URL,
        secret: env.PROGRESS_API_SECRET,
        channelId,
        dateKey,
        fetchImpl,
      })
      players = payload.players ?? []
    } catch (error) {
      console.error('Failed to fetch channel progress:', error)
      descriptionExtra = '\n_Could not load channel progress right now._'
    }
  }

  const embed = buildProgressEmbed({ dateKey, players })
  if (descriptionExtra) {
    embed.description = `${embed.description}${descriptionExtra}`
  }

  await postInteractionFollowup({
    applicationId,
    interactionToken,
    body: { embeds: [embed] },
    fetchImpl,
  })
}
