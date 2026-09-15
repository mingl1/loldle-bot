import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { api } from './_generated/api'

const http = httpRouter()

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Content-Type': 'application/json'
}

http.route({
	path: '/channel-progress',
	method: 'OPTIONS',
	handler: httpAction(async () => {
		return new Response(null, { status: 204, headers: corsHeaders })
	})
})

http.route({
	path: '/channel-progress',
	method: 'GET',
	handler: httpAction(async (ctx, request) => {
		const secret = process.env.PROGRESS_API_SECRET
		if (!secret) {
			return new Response(JSON.stringify({ error: 'PROGRESS_API_SECRET not configured' }), {
				status: 500,
				headers: corsHeaders
			})
		}

		const authHeader = request.headers.get('authorization') ?? ''
		const provided = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
		if (!provided || provided !== secret) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: corsHeaders
			})
		}

		const url = new URL(request.url)
		const channelId = url.searchParams.get('channelId')?.trim() ?? ''
		const dateKey = url.searchParams.get('dateKey')?.trim() ?? ''
		if (!channelId || !dateKey) {
			return new Response(JSON.stringify({ error: 'channelId and dateKey are required' }), {
				status: 400,
				headers: corsHeaders
			})
		}

		const players = await ctx.runQuery(api.channelProgress.listByChannelDate, {
			channelId,
			dateKey
		})

		return new Response(
			JSON.stringify({
				channelId,
				dateKey,
				players: players.map((player) => ({
					userId: player.userId,
					username: player.username,
					guessCount: player.guessCount,
					solved: player.solved,
					updatedAt: player.updatedAt,
					stringName: player.stringName ?? player.username,
					discordName: player.discordName,
					shareImageUrl: player.shareImageUrl
				}))
			}),
			{ status: 200, headers: corsHeaders }
		)
	})
})

export default http
