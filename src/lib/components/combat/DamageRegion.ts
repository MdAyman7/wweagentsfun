import type { ComponentData } from '../../ecs/Component';

/**
 * Accumulated damage per body region.
 * Used for limb targeting strategy and submission vulnerability.
 */
export interface DamageRegion extends ComponentData {
	readonly _type: 'DamageRegion';
	head: number;
	body: number;
	legs: number;
}

export function createDamageRegion(overrides: Partial<Omit<DamageRegion, '_type'>> = {}): DamageRegion {
	return {
		_type: 'DamageRegion',
		head: 0,
		body: 0,
		legs: 0,
		...overrides
	};
}
