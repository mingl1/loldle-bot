import type { RoboRequest } from '@robojs/server'

/**
 * Host a share PNG on Discord CDN by posting it to a private bot channel.
 * Returns the attachment URL for board links / share-moment dialogs.
 * Does not DM the user.
 */
export default async (req: RoboRequest) => {
	const formData = await req.formData()
	const image = formData.get('image') as File | null
	// Optional — used only for logging / filename context
	const userId = formData.get('userId') as string | null

	if (!image) {
		return new Response(JSON.stringify({ error: 'Missing image' }), { status: 400 })
	}

	const botToken = process.env.DISCORD_TOKEN
	if (!botToken) {
		return new Response(JSON.stringify({ error: 'DISCORD_TOKEN not configured' }), { status: 500 })
	}

	const shareChannelId = process.env.SHARE_CHANNEL_ID
	if (!shareChannelId) {
		return new Response(JSON.stringify({ error: 'SHARE_CHANNEL_ID not configured' }), { status: 500 })
	}

	const filename = userId ? `loldle-result-${userId}.png` : 'loldle-result.png'
	const msgForm = new FormData()
	msgForm.append(
		'payload_json',
		JSON.stringify({
			content: userId ? `Share image for <@${userId}>` : '',
		}),
	)
	msgForm.append('files[0]', image, filename)

	const msgRes = await fetch(`https://discord.com/api/v10/channels/${shareChannelId}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bot ${botToken}` },
		body: msgForm,
	})

	if (!msgRes.ok) {
		const err = await msgRes.text()
		return new Response(JSON.stringify({ error: `Message error: ${err}` }), { status: 500 })
	}

	const msg = (await msgRes.json()) as { attachments?: Array<{ url: string }> }
	const url = msg.attachments?.[0]?.url

	if (!url) {
		return new Response(JSON.stringify({ error: 'No attachment URL in response' }), { status: 500 })
	}

	return { url }
}
