# loldle-activity companion patch (clickable share links)

The bot board renders `stringName (@discordName)` and links `stringName` to
`shareImageUrl`. Those fields come from the Activity/Convex side.

## Apply in `loldle-activity`

1. Copy files from `files/` onto the matching paths, **or**
   `git apply vendor/loldle-activity-patch/clickable-share-links.patch`
2. Set Activity/Robo env: `SHARE_CHANNEL_ID` = private Discord channel ID the
   bot can post attachments into (required for links; names still sync without it)
3. Deploy Convex so schema/mutations include the new fields:
   `npx convex deploy`
4. Redeploy the Activity (Robo/hosting)

## Behavior

- `/api/share` posts the PNG to `SHARE_CHANNEL_ID` (no user DM) and returns the CDN URL
- On guess/finish, Activity upserts `stringName` / `discordName` / guess state
  immediately, then uploads the share image and patches `shareImageUrl`
- `GET /channel-progress` returns those fields for the bot worker
