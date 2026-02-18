import type { ComponentData } from '../../ecs/Component';
import type { CombatPhase } from '../../utils/types';

export interface CombatState extends ComponentData {
	readonly _type: 'CombatState';
	phase: CombatPhase;
	/** Frames remaining in current phase (windup, recovery, stun). */
	phaseFramesLeft: number;
	/** Whether this entity can be hit (false during iframes). */
	vulnerable: boolean;
	/** Whether currently blocking. */
	blocking: boolean;
}

export function createCombatState(overrides: Partial<Omit<CombatState, '_type'>> = {}): CombatState {
	return {
		_type: 'CombatState',
		phase: 'idle',
		phaseFramesLeft: 0,
		vulnerable: true,
		blocking: false,
		...overrides
	};
}
