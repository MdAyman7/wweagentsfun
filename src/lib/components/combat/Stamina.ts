import type { ComponentData } from '../../ecs/Component';

export interface Stamina extends ComponentData {
	readonly _type: 'Stamina';
	current: number;
	max: number;
	regenRate: number;
	/** Below this threshold, moves are slower and weaker. */
	exhaustionThreshold: number;
}

export function createStamina(overrides: Partial<Omit<Stamina, '_type'>> = {}): Stamina {
	return {
		_type: 'Stamina',
		current: 100,
		max: 100,
		regenRate: 0.3,
		exhaustionThreshold: 20,
		...overrides
	};
}
