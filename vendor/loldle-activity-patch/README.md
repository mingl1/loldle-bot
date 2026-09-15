# loldle-activity companion patch (clickable share links)

This agent could not push to `mingl1/loldle-activity` (no write permission). Apply these changes there:

1. From a checkout of `loldle-activity`:
   `git apply /path/to/loldle-bot/vendor/loldle-activity-patch/clickable-share-links.patch`
2. Or copy files from `files/` over the matching paths.
3. Set Convex/Activity env `SHARE_CHANNEL_ID` to a private Discord channel the bot can post in.
4. Redeploy the Activity + Convex (`npx convex deploy`).

## What it does

- `/api/share` uploads PNGs to `SHARE_CHANNEL_ID` (no user DM) and returns the CDN URL.
- On guess/finish, Activity generates the existing grid share image, hosts it, and stores `shareImageUrl`, `stringName`, `discordName` on `channelProgress`.
- `GET /channel-progress` exposes those fields for the bot board.
