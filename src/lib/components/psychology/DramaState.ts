import type { ComponentData } from '../../ecs/Component';

export interface DramaState extends ComponentData {
	readonly _type: 'DramaState';
	/** Tension curve value (0–1). Drives pacing decisions. */
	tension: number;
	/** Number of near-falls in this match. */
	nearFallCount: number;
	/** Whether this wrestler is eligible for a comeback sequence. */
	comebackEligible: boolean;
	/** Number of false finishes (finisher hit but not pinned). */
	falseFinishes: number;
}

export function createDramaState(overrides: Partial<Omit<DramaState, '_type'>> = {}): DramaState {
	return {
		_type: 'DramaState',
		tension: 0,
		nearFallCount: 0,
		comebackEligible: false,
		falseFinishes: 0,
		...overrides
	};
}
