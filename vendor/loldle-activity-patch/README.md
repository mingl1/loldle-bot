# loldle-activity companion patch (emoji guess rows)

This agent cannot push to `mingl1/loldle-activity`. Apply these changes there so the
Progress API sends Classic attribute statuses the bot can render as emoji rows.

## Why

The Discord board no longer uses share PNGs. Instead it shows a **dropdown per
player**; each option is one guess row of colored emojis:

- 🟩 correct · 🟨 partial · ⬛ wrong · 🔼 / 🔽 release year

## Apply

1. Copy/merge `files/` into a `loldle-activity` checkout (or port the diffs).
2. Deploy Convex so `channelProgress.guessRows` is available.
3. Redeploy the Activity.

## What changes

- Persist `guessRows` (array of 8 statuses per guess) on `channelProgress`.
- Expose `guessRows` from `GET /channel-progress`.
- On guess/finish, Activity upserts status rows **instead of uploading a share image** for the board.
- In-Activity share/copy buttons can keep using `generateShareImage` locally; that is unrelated to the channel board.
