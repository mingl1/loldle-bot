/**
 * Snippet for Activity4.tsx — replace board sync that uploaded share PNGs
 * with guessRows persistence for the Discord emoji dropdown board.
 *
 * Column order must match loldle-bot GUESS_STATUS_COLUMNS:
 * champion, gender, lane, genre, resource, attackType, region, releaseDate
 */

const BOARD_STATUS_COLUMNS = [
	'champion',
	'gender',
	'lane',
	'genre',
	'resource',
	'attackType',
	'region',
	'releaseDate',
] as const

type BoardStatus = 'correct' | 'partial' | 'wrong' | 'higher' | 'lower'

function guessRowsForBoard(
	rows: Array<{ status: Record<(typeof BOARD_STATUS_COLUMNS)[number], BoardStatus> }>,
): BoardStatus[][] {
	return rows.map((row) => BOARD_STATUS_COLUMNS.map((key) => row.status[key]))
}

/**
 * Drop-in replacement body for syncChannelProgress in Activity4.tsx:
 *
 * ```ts
 * const syncChannelProgress = (
 *   guessCount: number,
 *   solved: boolean,
 *   rows: GuessRow[] = guesses,
 * ) => {
 *   if (!userId || !stringName || !discordName || !channelId) return
 *   const signature = `${guessCount}:${solved}:${rows.map((row) => row.champion.id).join(',')}`
 *   if (lastShareSyncRef.current === signature) return
 *   lastShareSyncRef.current = signature
 *   void upsertChannelProgress({
 *     channelId,
 *     dateKey,
 *     userId,
 *     username: stringName,
 *     stringName,
 *     discordName,
 *     guessCount,
 *     solved,
 *     guessRows: guessRowsForBoard(rows),
 *   })
 * }
 * ```
 *
 * Keep generateShareImage only for the in-Activity Share/Copy buttons.
 * Do not upload share images for channelProgress / the Discord board.
 */

export { BOARD_STATUS_COLUMNS, guessRowsForBoard }
