import type { ComponentData } from '../../ecs/Component';

export interface Fatigue extends ComponentData {
	readonly _type: 'Fatigue';
	/** Physical exhaustion (0–100). Affects move speed and damage. */
	physical: number;
	/** Mental fatigue (0–100). Affects decision quality and reversal windows. */
	mental: number;
	/** Tendency to oversell (0–1). Higher = more dramatic selling. */
	oversellTendency: number;
}

export function createFatigue(overrides: Partial<Omit<Fatigue, '_type'>> = {}): Fatigue {
	return {
		_type: 'Fatigue',
		physical: 0,
		mental: 0,
		oversellTendency: 0.3,
		...overrides
	};
}
