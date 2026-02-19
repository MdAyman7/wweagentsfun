export { MatchLoop, type MatchLoopConfig, type WrestlerInput, type HitImpactEvent, type MatchDebugger, type DebugPhase } from './MatchLoop';
export { matchReducer } from './MatchReducer';
export { Agent, type AgentAction, type DecisionContext } from './Agent';
export { CombatResolver, type CombatResult } from './CombatResolver';
export { ComebackSystem } from './ComebackSystem';
export { EmotionMachine } from './EmotionMachine';
export { computeEffectiveModifiers, type EffectiveModifiers } from './TraitFormulas';
export { PSYCH_PROFILES, validateProfile } from './BalanceConfig';
export type {
	MatchState,
	AgentState,
	AgentPhase,
	AgentStats,
	AgentPersonality,
	MatchAction,
	MatchResult,
	MatchLogEntry
} from './MatchState';
export type {
	EmotionalState,
	EmotionModifiers,
	PsychProfile,
	AgentPsychState
} from './PsychologyTypes';
export {
	EMOTION_MODIFIERS,
	EMOTION_MIN_DURATION,
	PSYCHOLOGY_EVAL_INTERVAL,
	createDefaultPsychState
} from './PsychologyTypes';

// ── Fighter State Machine ──
export { FighterStateMachine } from './fsm';
export type { FighterStateId, FighterContext, FSMAction, FSMEvent } from './fsm';

// ── Movement ──
export { MovementController } from './movement';
export type { MovementConfig } from './movement';
export {
	MAX_MOVE_SPEED,
	STOP_THRESHOLD,
	RING_HALF_X,
	MIN_SEPARATION,
	KNOCKBACK_DECAY,
	DEFAULT_ATTACK_RANGE,
	RING_Y
} from './movement';

// ── Combo System ──
export { ComboTracker, type ComboHitResult, type ComboBreakReason } from './ComboTracker';

// ── Debug ──
export { ConsoleMatchDebugger, BufferMatchDebugger, type DebugVerbosity } from './MatchDebugLogger';
