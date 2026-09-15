import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const guessStatus = v.union(
	v.literal('correct'),
	v.literal('partial'),
	v.literal('wrong'),
	v.literal('higher'),
	v.literal('lower')
)

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
		/** Display name used as the board label */
		stringName: v.optional(v.string()),
		/** Discord username handle shown as (@discordName) */
		discordName: v.optional(v.string()),
		/**
		 * Classic attribute statuses per guess, column order:
		 * champion, gender, lane, genre, resource, attackType, region, releaseDate
		 */
		guessRows: v.optional(v.array(v.array(guessStatus)))
	})
		.index('by_channel_date', ['channelId', 'dateKey'])
		.index('by_channel_date_user', ['channelId', 'dateKey', 'userId'])
})
