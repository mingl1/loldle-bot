import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const guessStatus = v.union(
	v.literal('correct'),
	v.literal('partial'),
	v.literal('wrong'),
	v.literal('higher'),
	v.literal('lower')
)

const guessRowsValidator = v.array(v.array(guessStatus))

const channelProgressValidator = v.object({
	_id: v.id('channelProgress'),
	_creationTime: v.number(),
	channelId: v.string(),
	dateKey: v.string(),
	userId: v.string(),
	username: v.string(),
	guessCount: v.number(),
	solved: v.boolean(),
	updatedAt: v.number(),
	stringName: v.optional(v.string()),
	discordName: v.optional(v.string()),
	guessRows: v.optional(guessRowsValidator)
})

export const listByChannelDate = query({
	args: { channelId: v.string(), dateKey: v.string() },
	returns: v.array(channelProgressValidator),
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query('channelProgress')
			.withIndex('by_channel_date', (q) => q.eq('channelId', args.channelId).eq('dateKey', args.dateKey))
			.collect()

		return rows.sort((a, b) => {
			if (a.solved !== b.solved) return a.solved ? -1 : 1
			if (a.guessCount !== b.guessCount) return a.guessCount - b.guessCount
			return a.username.localeCompare(b.username)
		})
	}
})

export const upsert = mutation({
	args: {
		channelId: v.string(),
		dateKey: v.string(),
		userId: v.string(),
		username: v.string(),
		guessCount: v.number(),
		solved: v.boolean(),
		stringName: v.optional(v.string()),
		discordName: v.optional(v.string()),
		guessRows: v.optional(guessRowsValidator)
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (!args.channelId || args.guessCount < 0) {
			return null
		}

		const existing = await ctx.db
			.query('channelProgress')
			.withIndex('by_channel_date_user', (q) =>
				q.eq('channelId', args.channelId).eq('dateKey', args.dateKey).eq('userId', args.userId)
			)
			.first()

		const updatedAt = Date.now()
		const username = args.username.trim() || 'Unknown'
		const stringName = args.stringName?.trim() || username
		const discordName = args.discordName?.trim() || undefined
		const guessRows = args.guessRows

		if (!existing) {
			await ctx.db.insert('channelProgress', {
				channelId: args.channelId,
				dateKey: args.dateKey,
				userId: args.userId,
				username,
				guessCount: args.guessCount,
				solved: args.solved,
				updatedAt,
				stringName,
				...(discordName ? { discordName } : {}),
				...(guessRows ? { guessRows } : {})
			})
			return null
		}

		await ctx.db.patch(existing._id, {
			username,
			guessCount: args.guessCount,
			solved: existing.solved || args.solved,
			updatedAt,
			stringName,
			...(discordName ? { discordName } : {}),
			...(guessRows ? { guessRows } : {})
		})
		return null
	}
})
