/**
 * Core type definitions for the ground-up match simulation.
 * Pure data — no THREE, no Svelte. Safe to run in Node.
 */

export type Alignment = 'face' | 'heel' | 'tweener';
export type Build = 'light' | 'medium' | 'heavy' | 'super_heavy';
export type MoveCategory =
	| 'strike'
	| 'grapple'
	| 'aerial'
	| 'signature'
	| 'finisher'
	| 'submission';
export type BodyRegion = 'head' | 'body' | 'legs' | 'arms';

/** Combat archetype — drives AI tendencies. */
export type Archetype =
	| 'powerhouse'
	| 'brawler'
	| 'technician'
	| 'highflyer'
	| 'showman'
	| 'allrounder';

// ─── Static definitions (content) ────────────────────────────────────

export interface WrestlerStats {
	/** Max health / durability. */
	health: number;
	/** Max stamina. */
	stamina: number;
	/** Power — damage, slams, kickout/knockback, clinch overpower. */
	strength: number;
	/** Foot/hand speed — windup speed, dodge, aerial. */
	speed: number;
	/** Technique — reversals, submissions, precision. */
	technique: number;
	/** Charisma — crowd, showmanship, comeback fuel. */
	charisma: number;
	/** Resilience — resists pins/submissions (kickout power). */
	resilience: number;
}

export interface WrestlerDef {
	id: string;
	name: string;
	nickname: string;
	alignment: Alignment;
	archetype: Archetype;
	build: Build;
	stats: WrestlerStats;
	/** Move ids this wrestler can perform (drawn from the move table). */
	moveIds: string[];
	signatureId: string;
	finisherId: string;
	appearance: {
		height: number; // metres
		primaryColor: string; // attire
		secondaryColor: string; // trim/accent
		skinTone: string;
	};
}

export interface MoveDef {
	id: string;
	name: string;
	category: MoveCategory;
	region: BodyRegion;
	/** Base damage before stat/stamina scaling. */
	damage: number;
	/** Stamina spent by the attacker. */
	staminaCost: number;
	/** Momentum awarded on a clean hit. */
	momentum: number;
	/** Preferred engagement distance (world units). */
	range: number;
	/** Windup / active / recovery in ticks (60 = 1s). Scaled by speed/fatigue. */
	windup: number;
	active: number;
	recovery: number;
	/** How hard it is to reverse (0 easy .. 1 nearly impossible). */
	reverseResist: number;
	/** true = a leaping/aerial move (needs a launch). */
	aerial?: boolean;
	/** true = puts the opponent down (sets up covers). */
	knockdown?: boolean;
	/** Submission-specific: base tap pressure per tick while held. */
	submission?: boolean;
}

// ─── Live fighter state ──────────────────────────────────────────────

export type Stance =
	| 'standing'
	| 'groggy' // stunned, staggered
	| 'down' // knocked down on the mat
	| 'getting_up'
	| 'pinned' // being covered
	| 'submission'; // caught in a hold

export type ActionKind =
	| 'idle'
	| 'approach'
	| 'retreat'
	| 'strike'
	| 'grapple'
	| 'aerial'
	| 'signature'
	| 'finisher'
	| 'submit' // apply a submission hold
	| 'block'
	| 'dodge'
	| 'taunt'
	| 'cover' // go for the pin
	| 'kickout'
	| 'escape'; // escape a submission

export interface Fighter {
	def: WrestlerDef;
	slot: 0 | 1;
	health: number;
	maxHealth: number;
	stamina: number;
	maxStamina: number;
	momentum: number; // 0..100
	/** Accumulated damage per region (0..100). */
	limb: { head: number; body: number; legs: number; arms: number };
	posX: number;
	facing: 1 | -1;
	stance: Stance;
	/** Frames left in the current action phase (or stance timer when down). */
	phaseTimer: number;
	/** Ticks until the fighter may make a new decision. */
	decisionCd: number;
	/** Current action being performed (null = neutral). */
	action: ActionKind | null;
	actionPhase: 'windup' | 'active' | 'recovery' | null;
	activeMoveId: string | null;
	/** Consecutive strikes landed in a flurry (combo). */
	comboCount: number;
	/** Signature/finisher availability flags. */
	finisherReady: boolean;
	/** Submission hold pressure (0..100) when caught; tap at 100. */
	submitPressure: number;
	/** Kickouts survived this match (drives near-fall drama + fatigue). */
	kickouts: number;
	/** Ticks of pin vulnerability after taking a finisher (low kickout power). */
	pinVulnerable: number;
	/** Live emotion label for presentation. */
	emotion: string;
	/** Rolling stat totals for the post-match summary. */
	tally: {
		damageDealt: number;
		movesLanded: number;
		movesMissed: number;
		reversals: number;
		signatures: number;
		finishers: number;
		nearFalls: number;
		longestCombo: number;
	};
}

// ─── Events (the play-by-play log) ───────────────────────────────────

export type MatchEventType =
	| 'bell'
	| 'phase' // story-arc phase change
	| 'move_hit'
	| 'move_miss'
	| 'block'
	| 'dodge'
	| 'reversal'
	| 'knockdown'
	| 'signature'
	| 'finisher'
	| 'cover'
	| 'count' // ref count 1/2/3
	| 'kickout'
	| 'near_fall'
	| 'submission_applied'
	| 'submission_escape'
	| 'tap'
	| 'taunt'
	| 'comeback'
	| 'emotion'
	| 'stamina_low'
	| 'win';

export interface MatchEvent {
	tick: number;
	type: MatchEventType;
	/** Who caused it (slot) — may be undefined for neutral events. */
	actor?: 0 | 1;
	target?: 0 | 1;
	/** Human-readable line for logs/commentary. */
	text: string;
	/** Extra structured data (moveId, damage, count, etc). */
	data?: Record<string, number | string | boolean>;
}

export type WinMethod =
	| 'pinfall'
	| 'submission'
	| 'knockout'
	| 'tko'
	| 'countout'
	| 'timeout';

export interface MatchResult {
	winner: 0 | 1 | null;
	method: WinMethod;
	durationTicks: number;
	rating: number; // 0..5 stars
}

/** Immutable-ish snapshot the renderer reads each frame. */
export interface MatchSnapshot {
	tick: number;
	elapsed: number; // seconds
	phase: string; // story-arc phase
	fighters: [Fighter, Fighter];
	/** Ref pin count in progress (0 = none, 1..3). */
	pinCount: number;
	pinAttacker: 0 | 1 | null;
	running: boolean;
	result: MatchResult | null;
	/** Crowd excitement 0..1 (drives audio/crowd). */
	crowd: number;
}
