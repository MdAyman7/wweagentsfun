import { writable, derived, type Readable } from 'svelte/store';

export interface WrestlerUIState {
	entityId: number;
	name: string;
	health: number;
	healthMax: number;
	stamina: number;
	staminaMax: number;
	momentum: number;
	currentMove: string | null;
	combatPhase: string;
	alignment: string;
	eliminated: boolean;
	/** Current emotional state from psychology system */
	emotion?: string;
	/** Current confidence level (0-1) */
	confidence?: number;
}

export interface MatchUIState {
	phase: 'pre' | 'live' | 'post';
	matchType: string;
	elapsed: number;
	wrestlers: WrestlerUIState[];
	recentEvents: Array<{ frame: number; type: string; detail: string }>;
	winner: number | null;
	winMethod: string | null;
	matchRating: number;
}

const DEFAULT_STATE: MatchUIState = {
	phase: 'pre',
	matchType: 'singles',
	elapsed: 0,
	wrestlers: [],
	recentEvents: [],
	winner: null,
	winMethod: null,
	matchRating: 0
};

/** Writable match state — updated by syncEngine at end of each tick. */
export const matchState = writable<MatchUIState>(DEFAULT_STATE);

/** Derived: is the match currently live? */
export const isMatchLive: Readable<boolean> = derived(matchState, ($s) => $s.phase === 'live');

/** Derived: leading wrestler (highest health). */
export const leadingWrestler: Readable<WrestlerUIState | null> = derived(matchState, ($s) => {
	if ($s.wrestlers.length === 0) return null;
	return $s.wrestlers.reduce((a, b) => (a.health > b.health ? a : b));
});

/** Reset to default state. */
export function resetMatchStore(): void {
	matchState.set(DEFAULT_STATE);
}
