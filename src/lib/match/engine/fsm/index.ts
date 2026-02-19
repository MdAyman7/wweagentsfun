/**
 * Fighter State Machine — Barrel Export
 *
 * 14-state deterministic FSM for combat control (includes COMBO_WINDOW and FINISHER states).
 * Each fighter gets one FighterStateMachine instance.
 *
 * Usage:
 *   const fsm = new FighterStateMachine('wrestler_1', -2);
 *
 *   // Each tick:
 *   fsm.pushEvent({ type: 'REQUEST_ATTACK', moveId: 'ddt', windupFrames: 7, activeFrames: 8, recoveryFrames: 10 });
 *   fsm.update();
 *   const actions = fsm.drainActions();
 *   // process actions in match loop...
 */

// Core
export { FighterStateMachine } from './FighterStateMachine';
export { FighterState } from './FighterState';

// Types
export type {
	FighterStateId,
	FighterContext,
	FSMAction,
	FSMEvent
} from './FighterStateId';

// States (for testing/extension)
export { IdleState, ATTACK_COOLDOWN_FRAMES } from './states/IdleState';
export { MovingState } from './states/MovingState';
export { AttackWindupState } from './states/AttackWindupState';
export { AttackActiveState } from './states/AttackActiveState';
export { AttackRecoveryState } from './states/AttackRecoveryState';
export { BlockingState, MAX_BLOCK_FRAMES, BLOCK_STAMINA_DRAIN } from './states/BlockingState';
export { StunnedState } from './states/StunnedState';
export { KnockedDownState, DEFAULT_KNOCKDOWN_FRAMES, GETTING_UP_FRAMES } from './states/KnockedDownState';
export { GettingUpState } from './states/GettingUpState';
export { TauntingState, TAUNT_MOMENTUM_GAIN, TAUNT_STUN_MULTIPLIER } from './states/TauntingState';
export { ComboWindowState } from './states/ComboWindowState';
export { FinisherSetupState } from './states/FinisherSetupState';
export { FinisherImpactState } from './states/FinisherImpactState';
export { FinisherLockedState } from './states/FinisherLockedState';
