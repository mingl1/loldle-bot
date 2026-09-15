import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
	gameStates: defineTable({
		userId: v.string(),
		targetId: v.string(),
		guessIds: v.array(v.string()),
		updatedAt: v.number()
	}).index('by_user', ['userId']),
	dailyTargets: defineTable({
		dateKey: v.string(),
		targetId: v.string(),
		foundCount: v.number(),
		createdAt: v.number()
	}).index('by_date', ['dateKey']),
	dailyTargetFinds: defineTable({
		dateKey: v.string(),
		userId: v.string(),
		createdAt: v.number()
	})
		.index('by_date', ['dateKey'])
		.index('by_date_user', ['dateKey', 'userId']),
	channelProgress: defineTable({
		channelId: v.string(),
		dateKey: v.string(),
		userId: v.string(),
		username: v.string(),
		guessCount: v.number(),
		solved: v.boolean(),
		updatedAt: v.number(),
		/** Display name used as the clickable board label */
		stringName: v.optional(v.string()),
		/** Discord username handle shown as (@discordName) */
		discordName: v.optional(v.string()),
		/** CDN URL for the player's share PNG (grid only, no champ names) */
		shareImageUrl: v.optional(v.string())
	})
		.index('by_channel_date', ['channelId', 'dateKey'])
		.index('by_channel_date_user', ['channelId', 'dateKey', 'userId'])
})
