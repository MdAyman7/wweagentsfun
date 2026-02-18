import type { ComponentData } from '../../ecs/Component';

export interface Momentum extends ComponentData {
	readonly _type: 'Momentum';
	/** Current momentum value 0–100. */
	value: number;
	/** Momentum needed to unlock finisher. */
	finisherThreshold: number;
	/** Per-tick decay rate when idle. */
	decayRate: number;
}

export function createMomentum(overrides: Partial<Omit<Momentum, '_type'>> = {}): Momentum {
	return {
		_type: 'Momentum',
		value: 0,
		finisherThreshold: 80,
		decayRate: 0.1,
		...overrides
	};
}
