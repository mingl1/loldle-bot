import { type CSSProperties, type UIEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Events } from '@discord/embedded-app-sdk'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useDiscordSdk } from '../hooks/useDiscordSdk'
import championsData from '../data/champions.json'
import { generateShareImage } from '../utils/generateShareImage'
import './Activity4.css'

type Champion = {
	id: string
	name: string
	title: string
	resource: string
	genre: string
	skinCount: number
	key?: number
	image: { full: string; sprite: string; group: string; x: number; y: number; w: number; h: number }
	gender: string
	attackType: string
	releaseDate: number
	region?: string
	lane?: string
}

type Status = 'correct' | 'partial' | 'wrong' | 'higher' | 'lower'
type ColumnKey = 'champion' | 'gender' | 'lane' | 'genre' | 'resource' | 'attackType' | 'region' | 'releaseDate'
type GuessRow = { id: string; champion: Champion; status: Record<ColumnKey, Status> }
type IconSpec = { label: string; svg?: JSX.Element; emoji?: string; src?: string; fallbackSrc?: string }
type ActivityParticipant = {
	id: string
	username: string
	global_name?: string | null
	avatar?: string | null
	nickname?: string
}
type PeerProgressRow = {
	userId: string
	username: string
	avatar?: string | null
	guessCount: number
	solved: boolean
	isYou: boolean
}

const champions = championsData as Champion[]

const makeSvgIcon = (children: JSX.Element | JSX.Element[], viewBox = '0 0 24 24') => (
	<svg
		viewBox={viewBox}
		className="icon-svg4"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		{children}
	</svg>
)
const svgIcons = {
	calendar: makeSvgIcon(
		<>
			<rect x="4" y="6" width="16" height="14" rx="2" />
			<path d="M8 2v4M16 2v4M4 10h16" />
		</>
	),
	unknown: makeSvgIcon(
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.7.7-1.5 1-1.5 2.5" />
			<circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
		</>
	)
}
const imgIcon = (label: string, src: string, fallbackSrc: string): IconSpec => ({ label, src, fallbackSrc })
const renderIcon = (icon: IconSpec) => {
	if (icon.emoji) return icon.emoji
	if (icon.svg) return icon.svg
	if (icon.src)
		return (
			<img
				src={icon.src}
				alt={icon.label}
				loading="lazy"
				onError={(e) => {
					const t = e.currentTarget
					if (icon.fallbackSrc && t.src !== icon.fallbackSrc) {
						t.src = icon.fallbackSrc
						return
					}
					t.style.display = 'none'
				}}
			/>
		)
	return svgIcons.unknown
}

const laneIcons: Record<string, IconSpec> = {
	top: imgIcon(
		'Top',
		'/role-icons/lane-top.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/e/ef/Top_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143602'
	),
	jungle: imgIcon(
		'Jungle',
		'/role-icons/lane-jungle.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/1/1b/Jungle_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143559'
	),
	mid: imgIcon(
		'Mid',
		'/role-icons/lane-middle.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/9/98/Middle_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143644'
	),
	middle: imgIcon(
		'Middle',
		'/role-icons/lane-middle.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/9/98/Middle_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143644'
	),
	bottom: imgIcon(
		'Bottom',
		'/role-icons/lane-bottom.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/9/97/Bottom_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143632'
	),
	support: imgIcon(
		'Support',
		'/role-icons/lane-support.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/e/e0/Support_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143601'
	)
}
const laneFillIcon = imgIcon(
	'Unplayed',
	'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-fill-disabled.png',
	'/role-icons/lane-unplayed.png'
)
const classIcons: Record<string, IconSpec> = {
	assassin: imgIcon(
		'Assassin',
		'/role-icons/class-slayer.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/2/28/Slayer_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143556'
	),
	fighter: imgIcon(
		'Fighter',
		'/role-icons/class-fighter.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/8/8f/Fighter_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143554'
	),
	mage: imgIcon(
		'Mage',
		'/role-icons/class-mage.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/2/28/Mage_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143555'
	),
	marksman: imgIcon(
		'Marksman',
		'/role-icons/class-marksman.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/7/7f/Marksman_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143555'
	),
	support: imgIcon(
		'Support',
		'/role-icons/class-controller.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/5/58/Controller_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143552'
	),
	tank: imgIcon(
		'Tank',
		'/role-icons/class-tank.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/5/5a/Tank_icon.png/revision/latest/scale-to-width-down/64?cb=20181117143558'
	)
}
const resourceIcons: Record<string, IconSpec> = {
	mana: imgIcon(
		'Mana',
		'/role-icons/resource-mana.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/d/d2/Mana_resource.png/revision/latest/scale-to-width-down/64?cb=20170518230506'
	),
	energy: imgIcon(
		'Energy',
		'/role-icons/resource-energy.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/e/ea/Energy_resource.png/revision/latest/scale-to-width-down/64?cb=20170518230503'
	),
	fury: imgIcon(
		'Fury',
		'/role-icons/resource-fury.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/d/d7/Fury_resource.png/revision/latest/scale-to-width-down/64?cb=20170518230505'
	),
	rage: { label: 'Rage', emoji: '🔥' },
	heat: imgIcon(
		'Heat',
		'/role-icons/resource-heat.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/f/f1/Heat_resource.png/revision/latest/scale-to-width-down/64?cb=20170518230507'
	),
	flow: imgIcon(
		'Flow',
		'/role-icons/resource-flow.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/4/42/Flow_resource.png/revision/latest/scale-to-width-down/64?cb=20170519003743'
	),
	none: imgIcon(
		'Manaless',
		'/role-icons/resource-manaless.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/c/cd/Manaless_resource.png/revision/latest/scale-to-width-down/64?cb=20170606135842'
	),
	health: imgIcon(
		'Health',
		'/role-icons/resource-manaless.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/c/cd/Manaless_resource.png/revision/latest/scale-to-width-down/64?cb=20170606135842'
	),
	frenzy: imgIcon(
		'Frenzy',
		'/role-icons/resource-fury.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/d/d7/Fury_resource.png/revision/latest/scale-to-width-down/64?cb=20170518230505'
	),
	'blood well': { label: 'Blood Well', emoji: '🩸' },
	courage: { label: 'Courage', emoji: '🛡️' },
	shield: { label: 'Shield', emoji: '🛡️' },
	ferocity: imgIcon(
		'Ferocity',
		'/role-icons/resource-fury.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/d/d7/Fury_resource.png/revision/latest/scale-to-width-down/64?cb=20170518230505'
	),
	grit: { label: 'Grit', emoji: '💪' },
	'crimson rush': { label: 'Crimson Rush', emoji: '🩸' }
}
const attackIcons: Record<string, IconSpec> = {
	close: imgIcon(
		'Melee',
		'/role-icons/attack-melee.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/2/2d/Melee_role.png/revision/latest/scale-to-width-down/64?cb=20170624104045'
	),
	range: imgIcon(
		'Ranged',
		'/role-icons/attack-ranged.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/4/4a/Ranged_role.png/revision/latest/scale-to-width-down/64?cb=20170624104039'
	),
	ranged: imgIcon(
		'Ranged',
		'/role-icons/attack-ranged.png',
		'https://static.wikia.nocookie.net/leagueoflegends/images/4/4a/Ranged_role.png/revision/latest/scale-to-width-down/64?cb=20170624104039'
	)
}
const regionIcons: Record<string, IconSpec> = {
	demacia: { label: 'Demacia', emoji: '🛡️' },
	noxus: { label: 'Noxus', emoji: '🦅' },
	freljord: { label: 'Freljord', emoji: '❄️' },
	ionia: { label: 'Ionia', emoji: '🪷' },
	shurima: { label: 'Shurima', emoji: '🏜️' },
	shadowisles: { label: 'Shadow Isles', emoji: '👻' },
	bilgewater: { label: 'Bilgewater', emoji: '⚓' },
	zaun: { label: 'Zaun', emoji: '☣️' },
	piltover: { label: 'Piltover', emoji: '⚙️' },
	mounttargon: { label: 'Mount Targon', emoji: '⛰️' },
	ixtal: { label: 'Ixtal', emoji: '🌿' },
	bandlecity: { label: 'Bandle City', emoji: '🍄' },
	runeterra: { label: 'Runeterra', emoji: '🌍' },
	void: { label: 'Void', emoji: '👁️' }
}
const genderIcons: Record<string, IconSpec> = {
	male: imgIcon('Male', '/male.svg', ''),
	female: imgIcon('Female', '/female.svg', ''),
	other: { label: 'Other', emoji: '⚧️' },
	// legacy value from older champion dumps
	divers: { label: 'Other', emoji: '⚧️' }
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const titleCase = (value?: string) => {
	if (!value) return '—'
	return value
		.replace(/-/g, ' ')
		.split(',')
		.map((part) =>
			part
				.trim()
				.split(' ')
				.map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
				.join(' ')
		)
		.filter(Boolean)
		.join(', ')
}
const mapIconValues = (rawValue: string | undefined, iconMap: Record<string, IconSpec>) => {
	if (!rawValue) return [{ label: '—', svg: svgIcons.unknown }]
	return rawValue
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const key = normalize(part)
			const icon = iconMap[key] ?? { label: titleCase(part), svg: svgIcons.unknown }
			return {
				...icon,
				label: icon.label.replace(/-/g, ' ')
			}
		})
}

const getIconSpecs = (columnKey: ColumnKey, champion: Champion): IconSpec[] => {
	switch (columnKey) {
		case 'gender':
			return mapIconValues(champion.gender, genderIcons)
		case 'lane':
			return mapIconValues(champion.lane, laneIcons)
		case 'genre':
			return mapIconValues(champion.genre, classIcons)
		case 'resource':
			return mapIconValues(champion.resource, resourceIcons)
		case 'attackType':
			return mapIconValues(champion.attackType, attackIcons)
		case 'region':
			return mapIconValues(champion.region, regionIcons)
		case 'releaseDate':
			return [{ label: String(champion.releaseDate), svg: svgIcons.calendar }]
		default:
			return [{ label: '—', svg: svgIcons.unknown }]
	}
}

const DDRAGON_VERSION = '16.18.1'
const getChampionIconUrl = (champion: Champion) => {
	if (champion.key !== undefined) return `/champion-icons/${champion.key}.png`
	return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champion.image.full}`
}
const DAILY_TIME_ZONE = 'America/New_York'
const getDailyDateKey = (date = new Date()) => {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: DAILY_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	})
	const parts = formatter.formatToParts(date)
	return `${parts.find((part) => part.type === 'year')?.value ?? '0000'}-${parts.find((part) => part.type === 'month')?.value ?? '00'}-${parts.find((part) => part.type === 'day')?.value ?? '00'}`
}
const hashString = (value: string) => {
	let hash = 0
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash * 31 + value.charCodeAt(i)) | 0
	}
	return Math.abs(hash)
}
const pickDailyTargetId = (dateKey: string) => {
	if (champions.length === 0) return null
	const index = hashString(dateKey) % champions.length
	return champions[index]?.id ?? champions[0]?.id ?? null
}
const fuzzyScore = (query: string, target: string) => {
	if (!query) return 0
	let score = 0,
		qi = 0,
		streak = 0,
		lastMatch = -1
	for (let i = 0; i < target.length && qi < query.length; i += 1) {
		if (target[i] === query[qi]) {
			score += 5
			if (lastMatch + 1 === i) {
				streak += 1
				score += streak * 2
			} else {
				streak = 1
			}
			lastMatch = i
			qi += 1
		}
	}
	if (qi < query.length) return null
	score += Math.max(0, 10 - lastMatch)
	score -= Math.min(8, target.length * 0.1)
	return score
}
const splitSet = (value?: string) => {
	if (!value) return new Set<string>()
	return new Set(
		value
			.split(',')
			.map((part) => normalize(part))
			.filter(Boolean)
	)
}
const compareSets = (guess?: string, target?: string): Status => {
	const guessSet = splitSet(guess),
		targetSet = splitSet(target)
	if (guessSet.size === 0 && targetSet.size === 0) return 'correct'
	if (guessSet.size === 0 || targetSet.size === 0) return 'wrong'
	const intersection = [...guessSet].some((value) => targetSet.has(value))
	if (!intersection) return 'wrong'
	if (guessSet.size === targetSet.size && [...guessSet].every((value) => targetSet.has(value))) return 'correct'
	return 'partial'
}
const evaluateGuess = (guess: Champion, target: Champion): GuessRow => ({
	id: `guess-${guess.id}-${Date.now()}`,
	champion: guess,
	status: {
		champion: guess.id === target.id ? 'correct' : 'wrong',
		gender: normalize(guess.gender) === normalize(target.gender) ? 'correct' : 'wrong',
		lane: compareSets(guess.lane, target.lane),
		genre: compareSets(guess.genre, target.genre),
		resource: normalize(guess.resource) === normalize(target.resource) ? 'correct' : 'wrong',
		attackType: normalize(guess.attackType) === normalize(target.attackType) ? 'correct' : 'wrong',
		region: compareSets(guess.region, target.region),
		releaseDate:
			guess.releaseDate === target.releaseDate ? 'correct' : guess.releaseDate < target.releaseDate ? 'higher' : 'lower'
	}
})

// Collapse only after a deliberate scroll; expand nearer to top (hysteresis)
// so compact chrome does not oscillate when the freed header height clamps scrollTop.
const HEADER_COLLAPSE_THRESHOLD = 48
const HEADER_EXPAND_THRESHOLD = 8
const HEADER_HEIGHT_FALLBACK = 160
const participantLabel = (participant: ActivityParticipant) =>
	participant.nickname || participant.global_name || participant.username
const discordAvatarUrl = (userId: string, avatar?: string | null) =>
	avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64` : null
const sortPeerRows = (a: PeerProgressRow, b: PeerProgressRow) => {
	if (a.solved !== b.solved) return a.solved ? -1 : 1
	if (a.guessCount !== b.guessCount) return a.guessCount - b.guessCount
	if (a.isYou !== b.isYou) return a.isYou ? -1 : 1
	return a.username.localeCompare(b.username)
}

export const Activity4 = () => {
	const [query, setQuery] = useState('')
	const [guesses, setGuesses] = useState<GuessRow[]>([])
	const [showVictory, setShowVictory] = useState(false)
	const [victoryClosing, setVictoryClosing] = useState(false)
	const [guessPulse, setGuessPulse] = useState(false)
	const [pulseId, setPulseId] = useState(0)
	const [headerCollapsed, setHeaderCollapsed] = useState(false)
	const [shareStatus, setShareStatus] = useState<'idle' | 'loading'>('idle')
	const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle')
	const [participants, setParticipants] = useState<ActivityParticipant[]>([])
	const targetRef = useRef<Champion | null>(null)
	const initRef = useRef(false)
	const victoryCloseTimer = useRef<number | null>(null)
	const guessPulseTimer = useRef<number | null>(null)
	const headerRef = useRef<HTMLElement | null>(null)
	const headerHeightRef = useRef(HEADER_HEIGHT_FALLBACK)
	const lastShareSyncRef = useRef<string | null>(null)
	const { authenticated, session, discordSdk } = useDiscordSdk()
	const userId = authenticated ? (session?.user?.id ?? null) : null
	const discordName = authenticated ? (session?.user?.username ?? 'Unknown') : null
	const stringName = authenticated
		? (session?.user?.global_name || session?.user?.username || 'Unknown')
		: null
	/** @deprecated peer rail / legacy progress field — prefer stringName */
	const username = stringName
	const channelId = discordSdk.channelId
	const dateKey = getDailyDateKey()
	const dailyTarget = useQuery(api.dailyTarget.getByDate, { dateKey })
	const ensureDailyTarget = useMutation(api.dailyTarget.ensure)
	const recordDailyFound = useMutation(api.dailyTarget.recordFound)
	const saveState = useMutation(api.gameState.setState)
	const upsertChannelProgress = useMutation(api.channelProgress.upsert)
	const gameState = useQuery(api.gameState.getByUser, userId ? { userId } : 'skip')
	const channelPeers = useQuery(
		api.channelProgress.listByChannelDate,
		channelId ? { channelId, dateKey } : 'skip'
	)
	const [historyLoaded, setHistoryLoaded] = useState(false)
	const isLoadingHistory = userId !== null && !historyLoaded
	const normalizedQuery = normalize(query)
	const computedTargetId = useMemo(() => pickDailyTargetId(dateKey), [dateKey])
	const activeTargetId = dailyTarget?.targetId ?? computedTargetId
	const guessedIdSet = useMemo(() => new Set(guesses.map((row) => row.champion.id)), [guesses])

	const filteredChampions = useMemo(() => {
		if (!normalizedQuery) return champions
		const scored = champions
			.map((champion) => {
				const name = normalize(champion.name),
					id = normalize(champion.id)
				const score = Math.max(fuzzyScore(normalizedQuery, name) ?? -1, fuzzyScore(normalizedQuery, id) ?? -1)
				if (score < 0) return null
				return { champion, score }
			})
			.filter((entry): entry is { champion: Champion; score: number } => entry !== null)
			.sort((a, b) => b.score - a.score || a.champion.name.localeCompare(b.champion.name))
		return scored.map((entry) => entry.champion)
	}, [normalizedQuery])

	const suggestions = useMemo(() => {
		if (!normalizedQuery) return []
		return filteredChampions.filter((champion) => !guessedIdSet.has(champion.id)).slice(0, 5)
	}, [filteredChampions, guessedIdSet, normalizedQuery])

	useEffect(() => {
		if (dailyTarget === undefined || dailyTarget !== null || !computedTargetId) return
		void ensureDailyTarget({ dateKey, targetId: computedTargetId })
	}, [computedTargetId, dailyTarget, dateKey, ensureDailyTarget])
	useEffect(() => {
		if (userId !== null && gameState !== undefined) setHistoryLoaded(true)
	}, [userId, gameState])
	useEffect(() => {
		initRef.current = false
	}, [activeTargetId])
	useEffect(() => {
		if (!activeTargetId) {
			if (!userId && !targetRef.current && champions.length > 0) {
				targetRef.current = champions[Math.floor(Math.random() * champions.length)]
			}
			return
		}
		const target = champions.find((champion) => champion.id === activeTargetId) ?? champions[0]
		targetRef.current = target
		if (!userId || gameState === undefined) return
		if (gameState === null || gameState.targetId !== activeTargetId) {
			if (initRef.current) return
			initRef.current = true
			setGuesses([])
			void saveState({ userId, targetId: activeTargetId, guessIds: [] })
			return
		}
		initRef.current = false
		const restoredGuesses = gameState.guessIds
			.map((id) => champions.find((champion) => champion.id === id))
			.filter((champion): champion is Champion => Boolean(champion))
			.map((champion) => evaluateGuess(champion, target))
		setGuesses(restoredGuesses)
	}, [activeTargetId, gameState, saveState, userId])

	const isWin = guesses.some((row) => row.champion.id === targetRef.current?.id)
	const isGameOver = isWin
	const compactChrome = headerCollapsed && !isGameOver

	useEffect(() => {
		if (!isWin) return
		const timer = setTimeout(() => {
			setVictoryClosing(false)
			setShowVictory(true)
		}, 500)
		return () => clearTimeout(timer)
	}, [isWin])

	useEffect(() => {
		if (isGameOver) setHeaderCollapsed(false)
	}, [isGameOver])

	const triggerGuessPulse = () => {
		if (guessPulseTimer.current) window.clearTimeout(guessPulseTimer.current)
		// New key remounts the counter so CSS animations always start, including Windows Chromium.
		setPulseId((id) => id + 1)
		setGuessPulse(true)
		guessPulseTimer.current = window.setTimeout(() => setGuessPulse(false), 650)
	}

	const uploadShareImage = async (rows: GuessRow[]): Promise<string | null> => {
		if (!rows.length) return null
		try {
			const blob = await generateShareImage({ guesses: rows })
			const form = new FormData()
			form.append('image', blob, 'loldle-result.png')
			if (userId) form.append('userId', userId)
			const res = await fetch('/.proxy/api/share', { method: 'POST', body: form })
			if (!res.ok) throw new Error(await res.text())
			const { url } = (await res.json()) as { url: string }
			return url || null
		} catch (err) {
			console.error('Share image upload failed:', err)
			return null
		}
	}

	const syncChannelProgress = (
		guessCount: number,
		solved: boolean,
		rows: GuessRow[] = guesses,
	) => {
		if (!userId || !stringName || !discordName || !channelId) return
		const signature = `${guessCount}:${solved}:${rows.map((row) => row.champion.id).join(',')}`
		if (lastShareSyncRef.current === signature) return
		lastShareSyncRef.current = signature
		void (async () => {
			const shareImageUrl = guessCount > 0 ? await uploadShareImage(rows) : null
			void upsertChannelProgress({
				channelId,
				dateKey,
				userId,
				username: stringName,
				stringName,
				discordName,
				guessCount,
				solved,
				...(shareImageUrl ? { shareImageUrl } : {}),
			})
		})()
	}

	useEffect(() => {
		if (!authenticated) return

		let cancelled = false
		const applyParticipants = (next: ActivityParticipant[]) => {
			if (!cancelled) setParticipants(next)
		}

		void discordSdk.commands
			.getInstanceConnectedParticipants()
			.then((result) => applyParticipants(result.participants))
			.catch(() => {
				/* Mock / older clients may not support this command. */
			})

		const onParticipantsUpdate = (event: { participants: ActivityParticipant[] }) => {
			applyParticipants(event.participants)
		}
		void discordSdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, onParticipantsUpdate)

		return () => {
			cancelled = true
			void discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, onParticipantsUpdate)
		}
	}, [authenticated, discordSdk])

	useEffect(() => {
		if (!isWin || !userId || !activeTargetId) return
		void recordDailyFound({ dateKey, userId, targetId: activeTargetId })
		syncChannelProgress(guesses.length, true)
	}, [activeTargetId, channelId, dateKey, guesses.length, isWin, recordDailyFound, upsertChannelProgress, userId, username])

	useEffect(() => {
		if (!historyLoaded || !userId || !username || !channelId) return
		syncChannelProgress(
			guesses.length,
			guesses.some((row) => row.champion.id === targetRef.current?.id)
		)
	}, [channelId, dateKey, guesses, historyLoaded, upsertChannelProgress, userId, username])

	const peerRows = useMemo((): PeerProgressRow[] => {
		const progressByUser = new Map((channelPeers ?? []).map((row) => [row.userId, row]))

		if (participants.length > 0) {
			return participants
				.map((participant) => {
					const progress = progressByUser.get(participant.id)
					const isYou = participant.id === userId
					return {
						userId: participant.id,
						username: progress?.username || participantLabel(participant),
						avatar: participant.avatar,
						// Local guesses are authoritative for you; Convex drives everyone else.
						guessCount: isYou ? guesses.length : (progress?.guessCount ?? 0),
						solved: isYou ? isWin : (progress?.solved ?? false),
						isYou
					}
				})
				.sort(sortPeerRows)
		}

		return (channelPeers ?? [])
			.map((row) => {
				const isYou = row.userId === userId
				return {
					userId: row.userId,
					username: row.username,
					avatar: null,
					guessCount: isYou ? guesses.length : row.guessCount,
					solved: isYou ? isWin || row.solved : row.solved,
					isYou
				}
			})
			.sort(sortPeerRows)
	}, [channelPeers, guesses.length, isWin, participants, userId])

	const otherPeerCount = peerRows.filter((row) => !row.isYou).length
	const showPeerRail = Boolean(channelId) && otherPeerCount > 0

	const submitGuess = (champion: Champion) => {
		if (!targetRef.current || isGameOver || guesses.some((row) => row.champion.id === champion.id)) return
		const next = evaluateGuess(champion, targetRef.current)
		const nextGuesses = [...guesses, next]
		setGuesses(nextGuesses)
		triggerGuessPulse()
		if (userId)
			void saveState({ userId, targetId: targetRef.current.id, guessIds: nextGuesses.map((row) => row.champion.id) })
		syncChannelProgress(
			nextGuesses.length,
			nextGuesses.some((row) => row.champion.id === targetRef.current?.id),
			nextGuesses,
		)
		setQuery('')
	}

	const handleVictoryClose = () => {
		if (victoryCloseTimer.current) window.clearTimeout(victoryCloseTimer.current)
		setVictoryClosing(true)
		victoryCloseTimer.current = window.setTimeout(() => {
			setShowVictory(false)
			setVictoryClosing(false)
		}, 380)
	}

	const handleCopyImage = async () => {
		if (copyStatus !== 'idle') return
		setCopyStatus('copying')
		try {
			const blob = await generateShareImage({ guesses })
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
			setCopyStatus('copied')
			setTimeout(() => setCopyStatus('idle'), 2000)
		} catch (err) {
			console.error('Copy image failed:', err)
			setCopyStatus('idle')
		}
	}

	const handleShare = async () => {
		if (!targetRef.current || !userId || shareStatus === 'loading') return
		setShareStatus('loading')
		try {
			const blob = await generateShareImage({ guesses })
			const form = new FormData()
			form.append('image', blob, 'loldle-result.png')
			form.append('userId', userId)
			const res = await fetch('/.proxy/api/share', { method: 'POST', body: form })
			if (!res.ok) throw new Error(await res.text())
			const { url } = (await res.json()) as { url: string }
			await discordSdk.commands.openShareMomentDialog({ mediaUrl: url })
			setShareStatus('idle')
		} catch (err) {
			console.error('Share failed:', err)
			setShareStatus('idle')
		}
	}

	useEffect(() => {
		return () => {
			if (victoryCloseTimer.current) window.clearTimeout(victoryCloseTimer.current)
			if (guessPulseTimer.current) window.clearTimeout(guessPulseTimer.current)
		}
	}, [])

	const handleSubmit = () => {
		if (isGameOver) return
		const exact = champions.find(
			(champion) => normalize(champion.name) === normalizedQuery || normalize(champion.id) === normalizedQuery
		)
		if (exact) {
			submitGuess(exact)
			return
		}
		if (suggestions.length > 0) {
			submitGuess(suggestions[0])
			return
		}
	}

	const handleTimelineScroll = (event: UIEvent<HTMLDivElement>) => {
		if (isGameOver) return
		const timeline = event.currentTarget
		const { scrollTop, scrollHeight, clientHeight } = timeline
		const overflow = scrollHeight - clientHeight

		setHeaderCollapsed((prev) => {
			if (prev) {
				const nextCollapsed = scrollTop > HEADER_EXPAND_THRESHOLD
				return nextCollapsed === prev ? prev : nextCollapsed
			}

			if (headerRef.current) {
				headerHeightRef.current = headerRef.current.offsetHeight
			}

			// Collapsing frees ~header height into the timeline. If that would wipe
			// remaining overflow, the browser clamps scrollTop to 0 and the header
			// snaps open again — skip collapse until there are enough guesses.
			const canCollapse =
				scrollTop > HEADER_COLLAPSE_THRESHOLD &&
				overflow - headerHeightRef.current > HEADER_EXPAND_THRESHOLD
			return canCollapse === prev ? prev : canCollapse
		})
	}

	const attributeItems = [
		{ key: 'genre' as ColumnKey, label: 'Role' },
		{ key: 'attackType' as ColumnKey, label: 'Range' },
		{ key: 'region' as ColumnKey, label: 'Region' }
	]
	const guessDigits = useMemo(() => String(guesses.length).split(''), [guesses.length])
	const digitStepMs = guessDigits.length > 1 ? 150 / (guessDigits.length - 1) : 0
	const guessCountLabel = guesses.length === 1 ? 'GUESS' : 'GUESSES'

	const renderGuessDigits = (className = 'subtitle-number4') => (
		<span className={`subtitle-word4 ${className}`}>
			{guessDigits.map((digit, index) => (
				<span
					key={`${digit}-${index}`}
					className="subtitle-digit4"
					style={{ '--digit-delay': `${index * digitStepMs}ms` } as CSSProperties}
				>
					{digit}
				</span>
			))}
		</span>
	)

	return (
		<div className={`activity4 ${compactChrome ? 'activity4--compact' : ''} ${showPeerRail ? 'activity4--with-peers' : ''}`}>
			<div className="layout4">
			<div className="container4">
				<div className="chrome4">
					<header
						ref={headerRef}
						className={`header4 ${compactChrome ? 'header4--collapsed' : ''}`}
						aria-hidden={compactChrome}
					>
						<h1 className="title4">
							{['LoLdle', 'Classic'].map((word) => (
								<span key={word} className="title-word4">
									{word}
								</span>
							))}
						</h1>
						<p key={`guess-subtitle-${pulseId}`} className={`subtitle4 ${guessPulse ? 'subtitle4--pulse' : ''}`}>
							{isWin ? (
								<>
									<span className="subtitle-word4">GUESSED</span>
									<span className="subtitle-word4">IN</span>
									{renderGuessDigits()}
								</>
							) : (
								<>
									{renderGuessDigits()}
									<span className="subtitle-word4">{guessCountLabel}</span>
								</>
							)}
						</p>
						{isWin && (
							<button
								type="button"
								className="victory-reopen4"
								onClick={() => {
									setVictoryClosing(false)
									setShowVictory(true)
								}}
							>
								View Results
							</button>
						)}
					</header>

					{!isGameOver && (
						<div className={`search-row4 ${compactChrome ? 'search-row4--compact' : ''}`}>
							<div className="search4">
								<input
									className="input4"
									placeholder="Seek champion identity..."
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault()
											handleSubmit()
										}
									}}
									autoFocus
								/>
								{suggestions.length > 0 && (
									<div className="dropdown4">
										{suggestions.map((champion) => (
											<button
												key={champion.id}
												type="button"
												className="drop-item4"
												onClick={() => submitGuess(champion)}
											>
												<img
													src={getChampionIconUrl(champion)}
													alt={champion.name}
													className="drop-portrait4"
													onError={(e) => {
														e.currentTarget.style.display = 'none'
													}}
												/>
												<span className="drop-text4">
													<span className="drop-name4">{champion.name}</span>
													<span className="drop-title4">· {champion.title}</span>
												</span>
											</button>
										))}
									</div>
								)}
							</div>
							<p
								key={`guess-chip-${pulseId}`}
								className={`guess-chip4 ${compactChrome ? 'guess-chip4--visible' : ''} ${guessPulse ? 'subtitle4--pulse' : ''}`}
								aria-hidden={!compactChrome}
							>
								{renderGuessDigits('guess-chip-number4')}
								<span className="subtitle-word4 guess-chip-label4">{guessCountLabel}</span>
							</p>
						</div>
					)}
				</div>

				{isLoadingHistory ? (
					<div className="runic-loader4">
						<div className="runic-rings4">
							<div className="runic-outer4" />
							<div className="runic-inner4" />
						</div>
						<p className="runic-label4">Consulting the archives…</p>
					</div>
				) : (
					<div className="timeline4" onScroll={handleTimelineScroll}>
						{[...guesses].reverse().map((row) => {
							const lanes = getIconSpecs('lane', row.champion)
							const laneTwo = lanes[1] ?? laneFillIcon
							const genderIcons = getIconSpecs('gender', row.champion)
							const resourceIcons = getIconSpecs('resource', row.champion)
							const yearStatus = row.status.releaseDate
							return (
								<div key={row.id} className="timeline-card4">
									{/* 1. Hero Information */}
									<div className="hero-info-block">
										<div className="portrait-wrapper">
											<img
												src={getChampionIconUrl(row.champion)}
												alt={row.champion.name}
												className="champ-img4"
												onError={(e) => {
													e.currentTarget.style.display = 'none'
												}}
											/>
											<div className={`year-indicator year-${yearStatus === 'correct' ? 'correct' : 'wrong'}`}>
												{yearStatus === 'higher' && '↑'}
												{yearStatus === 'lower' && '↓'}
												{row.champion.releaseDate}
											</div>
										</div>
										<div className="lanes-stack">
											<div className={`lane-slot st-${row.status.lane}`} title={lanes[0]?.label}>
												{lanes[0] && <span className="ic4">{renderIcon(lanes[0])}</span>}
											</div>
											<div className={`lane-slot st-${row.status.lane}`} title={laneTwo.label}>
												<span className="ic4">{renderIcon(laneTwo)}</span>
											</div>
										</div>
										<div className="meta-stack4">
											<div
												className={`lane-slot lane-slot--mini st-${row.status.gender}`}
												title={genderIcons.map((i) => i.label).join(', ')}
											>
												<div className="ic4-wrap">
													{genderIcons.map((icon, i) => (
														<span key={i} className={`ic4 ${icon.emoji ? 'emoji' : ''}`}>
															{renderIcon(icon)}
														</span>
													))}
												</div>
											</div>
											<div
												className={`lane-slot lane-slot--mini st-${row.status.resource}`}
												title={resourceIcons.map((i) => i.label).join(', ')}
											>
												<div className="ic4-wrap">
													{resourceIcons.map((icon, i) => (
														<span key={i} className={`ic4 ${icon.emoji ? 'emoji' : ''}`}>
															{renderIcon(icon)}
														</span>
													))}
												</div>
											</div>
										</div>
									</div>

									{/* 2. Attributes Bar */}
									<div className="attributes-bar">
										{attributeItems.map((attr) => {
											const status = row.status[attr.key]
											const icons = getIconSpecs(attr.key, row.champion)
											const isRole = attr.key === 'genre'
											const labels = icons.map((icon) => icon.label)
											return (
												<div
													key={attr.key}
													className={`attr-slot ${isRole ? 'attr-slot--role' : ''} st-${status}`}
													title={icons.map((i) => i.label).join(', ')}
												>
													<span className="attr-label-mini">{attr.label}</span>
													<div className="role-text-stack">
														{labels.map((label, i) => (
															<span key={`${attr.key}-${i}`} className="role-text-item">
																{label.replace(/\s+/g, '\n')}
															</span>
														))}
													</div>
													{status === 'higher' && <span className="arr-mini">▲</span>}
													{status === 'lower' && <span className="arr-mini">▼</span>}
												</div>
											)
										})}
									</div>
								</div>
							)
						})}
					</div>
				)}

				{showVictory && targetRef.current && (
					<div
						className={`victory4 ${victoryClosing ? 'victory4--closing' : 'victory4--open'}`}
						onClick={handleVictoryClose}
					>
						<div className="victory-card4" onClick={(e) => e.stopPropagation()}>
							<div className="victory-title4">FOUND</div>
							<div className="victory-champion4">
								<img
									src={getChampionIconUrl(targetRef.current)}
									alt={targetRef.current.name}
									className="victory-img4"
									onError={(e) => {
										e.currentTarget.style.display = 'none'
									}}
								/>
								<div className="victory-champion-meta4">
									<div className="victory-name4">{targetRef.current.name}</div>
									<div className="victory-title-name4">{targetRef.current.title}</div>
								</div>
							</div>
							<div className="victory-stat4">
								GUESSED IN <span>{guesses.length}</span> {guesses.length === 1 ? 'ATTEMPT' : 'ATTEMPTS'}
							</div>
							<div className="victory-list4">
								<div className="victory-list-title4">CHAMPIONS GUESSED</div>
								<div className="victory-pill-list4">
									{guesses.map((row) => (
										<span key={row.id} className="victory-pill4">
											{row.champion.name}
										</span>
									))}
								</div>
							</div>
							<button
								type="button"
								className="victory-copy4"
								onClick={handleCopyImage}
								disabled={copyStatus !== 'idle'}
							>
								{copyStatus === 'copying' ? 'Copying…' : copyStatus === 'copied' ? 'Copied!' : 'Copy Image'}
							</button>
							{userId && (
								<button
									type="button"
									className="victory-share4"
									onClick={handleShare}
									disabled={shareStatus === 'loading'}
								>
									{shareStatus === 'loading' ? 'Sharing…' : 'Share Result'}
								</button>
							)}
						</div>
					</div>
				)}
			</div>

			{showPeerRail && (
				<aside className="peers4" aria-label="Channel guess progress">
					<div className="peers-head4">
						<span className="peers-kicker4">Channel</span>
						<span className="peers-title4">Progress</span>
					</div>
					<ul className="peers-list4">
						{peerRows.map((peer, index) => {
							const avatarUrl = discordAvatarUrl(peer.userId, peer.avatar)
							const initial = peer.username.trim().charAt(0).toUpperCase() || '?'
							return (
								<li
									key={peer.userId}
									className={`peer-row4 ${peer.isYou ? 'peer-row4--you' : ''} ${peer.solved ? 'peer-row4--solved' : ''}`}
									style={{ '--peer-delay': `${index * 45}ms` } as CSSProperties}
								>
									<span className="peer-avatar4" aria-hidden="true">
										{avatarUrl ? (
											<img
												src={avatarUrl}
												alt=""
												className="peer-avatar-img4"
												onError={(e) => {
													e.currentTarget.style.display = 'none'
													const fallback = e.currentTarget.nextElementSibling
													if (fallback instanceof HTMLElement) fallback.hidden = false
												}}
											/>
										) : null}
										<span className="peer-avatar-fallback4" hidden={Boolean(avatarUrl)}>
											{initial}
										</span>
									</span>
									<span className="peer-meta4">
										<span className="peer-name4">
											{peer.username}
											{peer.isYou ? <span className="peer-you4">you</span> : null}
										</span>
										<span className="peer-stat4">
											{peer.solved ? (
												<span className="peer-found4">Found</span>
											) : (
												<>
													<span className="peer-count4">{peer.guessCount}</span>
													<span className="peer-unit4">
														{peer.guessCount === 1 ? 'guess' : 'guesses'}
													</span>
												</>
											)}
										</span>
									</span>
								</li>
							)
						})}
					</ul>
				</aside>
			)}
			</div>
		</div>
	)
}
