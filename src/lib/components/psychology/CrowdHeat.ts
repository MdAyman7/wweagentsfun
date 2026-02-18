import type { ComponentData } from '../../ecs/Component';

export interface CrowdHeat extends ComponentData {
	readonly _type: 'CrowdHeat';
	/** Overall crowd engagement (0–100). */
	pop: number;
	/** Individual wrestler heat (positive = cheers, negative = boos). */
	heat: number;
	/** Boo/cheer ratio (-1 = full boo, +1 = full cheer). */
	sentiment: number;
}

export function createCrowdHeat(overrides: Partial<Omit<CrowdHeat, '_type'>> = {}): CrowdHeat {
	return {
		_type: 'CrowdHeat',
		pop: 50,
		heat: 0,
		sentiment: 0,
		...overrides
	};
}
