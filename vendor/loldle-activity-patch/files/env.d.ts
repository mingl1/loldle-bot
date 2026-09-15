export {}
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			DISCORD_CLIENT_ID: string
			VITE_DISCORD_CLIENT_ID: string
			VITE_CONVEX_URL: string
			DISCORD_CLIENT_SECRET: string
			NODE_OPTIONS: string
			PORT: string
			DISCORD_TOKEN: string
			SHARE_CHANNEL_ID: string
		}
	}
}
