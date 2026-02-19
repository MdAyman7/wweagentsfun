import type { Seed } from '../../utils/types';
import type { PsychProfile, AgentPsychState, EmotionalState } from './PsychologyTypes';

// ─── Core State Types ───────────────────────────────────────────────

export interface AgentState {
	id: string;
	name: string;
	health: number;
	maxHealth: number;
	stamina: number;
	maxStamina: number;
	momentum: number;
	/** Accumulated region damage: higher = more vulnerable */
	regionDamage: { head: number; body: number; legs: number };
	/** Current combat phase determines what actions are available */
	phase: AgentPhase;
	/** Frames remaining in current phase (windup/active/recovery/stun) */
	phaseFrames: number;
	/** Active move being executed (null when idle) */
	activeMove: string | null;
	/** Target of the current move */
	targetId: string | null;
	/** Position on the ring mat (-3 to 3 on X axis) */
	positionX: number;
	/** Whether this agent is knocked down (health reached 0 at some point) */
	knockdowns: number;
	/** Stats accumulated during the match */
	stats: AgentStats;
	/** Personality-driven weight biases */
	personality: AgentPersonality;
	/** Psychology profile (static traits, set at match start) */
	psychProfile: PsychProfile;
	/** Live psychological state (updated every tick) */
	psych: AgentPsychState;
	/** Whether a comeback is currently active */
	comebackActive: boolean;
	/** Color for rendering */
	color: string;
	/** Height for rendering */
	height: number;
	/** Build for rendering */
	build: 'light' | 'medium' | 'heavy';
}

export type AgentPhase =
	| 'idle'
	| 'moving'
	| 'windup'
	| 'active'
	| 'recovery'
	| 'combo_window'
	| 'blocking'
	| 'stun'
	| 'knockdown'
	| 'getting_up'
	| 'taunting'
	| 'finisher_setup'
	| 'finisher_impact'
	| 'finisher_locked';

export interface AgentStats {
	movesHit: number;
	movesMissed: number;
	damageDealt: number;
	damageTaken: number;
	reversals: number;
	knockdowns: number;
	/** Total combos started. */
	combosStarted: number;
	/** Total combos completed (all steps landed). */
	combosCompleted: number;
	/** Total combo hits (including combo openers). */
	comboHits: number;
	/** Longest combo chain achieved (max consecutive combo hits). */
	longestCombo: number;
	/** Total finishers landed successfully. */
	finishersLanded: number;
	/** Total finishers caught (counter-finishers). */
	finishersCaught: number;
}

export interface AgentPersonality {
	/** Bias toward strikes vs grapples (0 = all grapple, 1 = all strike) */
	strikePreference: number;
	/** Aggression: higher = more attacks, fewer blocks (0-1) */
	aggression: number;
	/** Risk tolerance: higher = more aerial/signature moves (0-1) */
	riskTolerance: number;
	/** Reversal skill: chance multiplier for reversals (0-1) */
	reversalSkill: number;
}

export interface MatchState {
	/** Deterministic seed for the match */
	seed: Seed;
	/** Current tick (60 ticks per second) */
	tick: number;
	/** Match duration in seconds (tick / 60) */
	elapsed: number;
	/** Max match duration in seconds */
	timeLimit: number;
	/** The two agents fighting */
	agents: [AgentState, AgentState];
	/** Is the match currently running? */
	running: boolean;
	/** Match result (null until finished) */
	result: MatchResult | null;
	/** Ordered log of all match events */
	log: MatchLogEntry[];
	/** Comeback cooldown (ticks until another comeback can trigger) */
	comebackCooldown: number;
}

export interface MatchResult {
	winnerId: string;
	loserId: string;
	method: 'knockout' | 'tko' | 'timeout' | 'pinfall';
	duration: number;
	rating: number;
}

// ─── Actions (Events that drive state transitions) ──────────────────

export type MatchAction =
	| { type: 'TICK' }
	| { type: 'AGENT_ATTACK'; agentId: string; moveId: string }
	| { type: 'AGENT_BLOCK'; agentId: string }
	| { type: 'AGENT_IDLE'; agentId: string }
	| { type: 'AGENT_MOVE'; agentId: string; targetX: number }
	| { type: 'AGENT_TAUNT'; agentId: string; durationFrames: number }
	| { type: 'MOVE_HIT'; attackerId: string; defenderId: string; moveId: string; damage: number; reversed: boolean }
	| { type: 'MOVE_MISS'; attackerId: string; moveId: string }
	| { type: 'KNOCKDOWN'; agentId: string }
	| { type: 'RECOVERY'; agentId: string }
	| { type: 'FSM_SYNC'; agentId: string; phase: AgentPhase; phaseFrames: number; activeMove: string | null; positionX: number }
	| { type: 'COMEBACK_TRIGGER'; agentId: string }
	| { type: 'COMEBACK_END'; agentId: string }
	| { type: 'EMOTION_CHANGE'; agentId: string; from: EmotionalState; to: EmotionalState }
	| { type: 'MISTAKE'; agentId: string; moveId: string }
	| { type: 'COMBO_START'; agentId: string; comboId: string; comboName: string }
	| { type: 'COMBO_HIT'; agentId: string; comboId: string; comboName: string; step: number; totalSteps: number; hitCount: number }
	| { type: 'COMBO_COMPLETE'; agentId: string; comboId: string; comboName: string; totalHits: number; totalDamage: number; finisherUnlocked: boolean }
	| { type: 'COMBO_BREAK'; agentId: string; comboId: string; reason: string; hitsLanded: number }
	| { type: 'FINISHER_START'; attackerId: string; defenderId: string; moveId: string; moveName: string }
	| { type: 'FINISHER_IMPACT'; attackerId: string; defenderId: string; moveId: string; damage: number; knockdownForced: boolean }
	| { type: 'FINISHER_COUNTER'; attackerId: string; defenderId: string; moveId: string }
	| { type: 'MATCH_END'; result: MatchResult };

// ─── Log Schema ─────────────────────────────────────────────────────

export interface MatchLogEntry {
	tick: number;
	elapsed: number;
	type: string;
	detail: string;
	data: Record<string, unknown>;
}
