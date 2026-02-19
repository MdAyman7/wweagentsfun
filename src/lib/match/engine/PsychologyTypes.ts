/**
 * PsychologyTypes — the emotional and trait system for WWEAgents.
 *
 * EMOTIONAL STATE MACHINE (7 states):
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │                    CALM                          │
 *   │  (default start, neutral modifiers)              │
 *   └──────┬───────┬────────┬───────┬────────┬────────┘
 *          │       │        │       │        │
 *     ┌────▼──┐ ┌──▼────┐ ┌▼─────┐ ├────────▼───┐
 *     │DOMINAT│ │FRUST- │ │OVER- │ │  CLUTCH    │
 *     │-ING   │ │RATED  │ │CONF. │ │            │
 *     └───┬───┘ └───┬───┘ └──┬───┘ └────┬───────┘
 *         │         │        │           │
 *         │    ┌────▼────┐ ┌─▼──────┐    │
 *         │    │PANICKING│ │DESPERAT│    │
 *         │    └─────────┘ └────────┘    │
 *         └──────────────────────────────┘
 *
 * Transitions are driven by health differential, momentum, damage
 * streaks, combo chains, crowd heat, time remaining, and near-knockdown
 * events. The state machine is evaluated every PSYCHOLOGY_EVAL_INTERVAL
 * ticks (10 ticks = 6× per second).
 */

// ─── Emotional States ───────────────────────────────────────────────

export type EmotionalState =
	| 'calm'
	| 'dominating'
	| 'frustrated'
	| 'panicking'
	| 'desperate'
	| 'overconfident'
	| 'clutch';

/**
 * Modifiers applied by each emotional state.
 * These multiply into the Agent's decision weights and the
 * CombatResolver's damage pipeline.
 */
export interface EmotionModifiers {
	/** Multiplier on attack action weight (>1 = more aggressive) */
	aggressionMod: number;
	/** Multiplier on block/defensive action weight */
	defenseMod: number;
	/** Multiplier on signature/finisher move weight */
	specialMoveMod: number;
	/** Additive chance of making a mistake (whiff, wrong move) */
	mistakeChance: number;
	/** Multiplier on damage dealt */
	damageMod: number;
	/** Multiplier on reversal chance when defending */
	reversalMod: number;
	/** Multiplier on critical hit chance */
	critMod: number;
	/** Speed modifier — affects decision interval and windup frames (0.8–1.3) */
	speedMod: number;
}

/**
 * Emotion → modifier lookup table.
 *
 * These are the core balance levers. Each emotional state creates
 * a distinct "feel" that the audience can recognize:
 *
 * CALM:          Balanced, no bonuses or penalties. Baseline play.
 * DOMINATING:    High damage, high special move chance, but slightly
 *                lower defense (getting cocky, leaving openings).
 * FRUSTRATED:    Erratic. Moderate aggression spike but sloppy execution.
 *                This is the "losing composure" state — the wrestler
 *                starts telegraphing and making mistakes from anger.
 * PANICKING:     High defense, low offense, high mistake chance.
 *                Scrambling to survive.
 * DESPERATE:     Very high aggression and special moves, but very
 *                high mistakes. Throwing haymakers.
 * OVERCONFIDENT: Big damage bonuses but high mistake rate and low
 *                defense. Showboating gets you caught.
 * CLUTCH:        The money state. Boosted everything, low mistakes.
 *                This is the "he's in the zone" moment.
 */
export const EMOTION_MODIFIERS: Record<EmotionalState, EmotionModifiers> = {
	calm: {
		aggressionMod: 1.0,
		defenseMod: 1.0,
		specialMoveMod: 1.0,
		mistakeChance: 0.01,    // calm = very few mistakes
		damageMod: 1.0,
		reversalMod: 1.0,
		critMod: 1.0,
		speedMod: 1.0
	},
	dominating: {
		aggressionMod: 1.3,
		defenseMod: 0.7,
		specialMoveMod: 1.4,
		mistakeChance: 0.03,    // slightly careless when dominating
		damageMod: 1.15,
		reversalMod: 0.8,
		critMod: 1.2,
		speedMod: 1.1   // momentum-fueled speed boost
	},
	frustrated: {
		aggressionMod: 1.4,     // angry = more aggressive
		defenseMod: 0.6,        // too angry to defend properly
		specialMoveMod: 0.5,    // too erratic for technical moves
		mistakeChance: 0.06,    // sloppy from anger
		damageMod: 1.05,        // hits slightly harder (adrenaline)
		reversalMod: 0.6,       // too emotional for clean reversals
		critMod: 0.8,           // less precise
		speedMod: 1.05          // jittery, marginally faster
	},
	panicking: {
		aggressionMod: 0.6,
		defenseMod: 1.6,
		specialMoveMod: 0.3,
		mistakeChance: 0.08,    // fear causes errors
		damageMod: 0.85,
		reversalMod: 1.3,
		critMod: 0.6,
		speedMod: 0.85  // fear slows reactions
	},
	desperate: {
		aggressionMod: 1.8,
		defenseMod: 0.3,
		specialMoveMod: 2.0,
		mistakeChance: 0.10,    // reckless = more mistakes
		damageMod: 1.1,
		reversalMod: 0.5,
		critMod: 1.4,
		speedMod: 1.15  // adrenaline dump — faster but reckless
	},
	overconfident: {
		aggressionMod: 1.5,
		defenseMod: 0.4,
		specialMoveMod: 1.8,
		mistakeChance: 0.08,    // showing off leads to sloppiness
		damageMod: 1.2,
		reversalMod: 0.4,
		critMod: 1.3,
		speedMod: 0.9   // lazy, showing off
	},
	clutch: {
		aggressionMod: 1.4,
		defenseMod: 1.3,
		specialMoveMod: 1.6,
		mistakeChance: 0.02,
		damageMod: 1.25,
		reversalMod: 1.5,
		critMod: 1.5,
		speedMod: 1.2   // "in the zone" — everything flows faster
	}
};

// ─── Psychology Traits ──────────────────────────────────────────────

/**
 * PsychProfile — the 7 psychological trait axes.
 * These are STATIC per wrestler (set at match start from roster data).
 * They influence HOW the emotional state machine transitions and
 * how strongly emotional modifiers apply.
 *
 * All values are 0.0 – 1.0.
 */
export interface PsychProfile {
	/** Base aggression — tendency to attack vs defend.
	 *  High: attacks more, blocks less.
	 *  Low: more calculated, waits for openings. */
	aggression: number;

	/** Dynamic confidence — starts at a base, moves with match flow.
	 *  This is the INITIAL value; the live value is on AgentPsychState.
	 *  High: more likely to attempt big moves.
	 *  Low: plays safe, avoids risk. */
	baseConfidence: number;

	/** Ego — how much success inflates self-assessment.
	 *  High ego: transitions to Overconfident faster, harder to Panic.
	 *  Low ego: stays grounded, transitions to Dominating slower. */
	ego: number;

	/** Fear threshold — how low health must drop before Panicking.
	 *  High threshold (0.8): panics easily (starts panicking at 80% health gap).
	 *  Low threshold (0.2): ice cold (only panics when nearly dead). */
	fearThreshold: number;

	/** Crowd sensitivity — how much crowd heat affects emotions.
	 *  High: crowd boos cause Panic faster, crowd pops boost Clutch.
	 *  Low: stoic, unaffected by crowd (heel psychology). */
	crowdSensitivity: number;

	/** Momentum influence — how much momentum meter affects decisions.
	 *  High: very momentum-dependent, big swings in behavior.
	 *  Low: consistent regardless of momentum. */
	momentumInfluence: number;

	/** Adaptability — how quickly the wrestler adjusts strategy mid-match.
	 *  High: faster emotion transitions, quicker response to opponent patterns.
	 *  Low: stubborn, sticks to gameplan regardless of results.
	 *  Affects hysteresis duration and pattern recognition bonus. */
	adaptability: number;
}

// ─── Live Psychology State (mutable per-tick) ───────────────────────

/**
 * AgentPsychState — the live psychological state that changes every tick.
 * Stored on AgentState and updated by the psychology system.
 */
export interface AgentPsychState {
	/** Current emotional state */
	emotion: EmotionalState;
	/** Live confidence level (0-1), drifts from baseConfidence */
	confidence: number;
	/** Ticks since last emotional state change (for hysteresis) */
	emotionDuration: number;
	/** Consecutive hits landed (resets on miss/reversal) */
	hitStreak: number;
	/** Consecutive hits taken (resets on landing a hit) */
	takenStreak: number;
	/** Simulated crowd heat for this agent (-1 to 1, negative=boos) */
	crowdHeat: number;
	/** Momentum trend: positive = building, negative = losing */
	momentumTrend: number;
	/** Near-knockdown events this match (health dropped below 15% threshold) */
	nearKnockdowns: number;
	/** Best combo chain landed this match (for frustration tracking) */
	bestComboLanded: number;
	/** Best combo chain received this match (opponent's longest combo on us) */
	worstComboReceived: number;
}

/**
 * Default psychology state at match start.
 */
export function createDefaultPsychState(profile: PsychProfile): AgentPsychState {
	return {
		emotion: 'calm',
		confidence: profile.baseConfidence,
		emotionDuration: 0,
		hitStreak: 0,
		takenStreak: 0,
		crowdHeat: 0,
		momentumTrend: 0,
		nearKnockdowns: 0,
		bestComboLanded: 0,
		worstComboReceived: 0
	};
}

// ─── Transition Thresholds ──────────────────────────────────────────

/** Minimum ticks in an emotion before a transition can occur (hysteresis). */
export const EMOTION_MIN_DURATION = 60; // 1 second

/** How often the emotion state machine is evaluated (ticks). */
export const PSYCHOLOGY_EVAL_INTERVAL = 10; // 6× per second
