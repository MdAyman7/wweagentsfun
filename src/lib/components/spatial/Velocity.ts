import type { ComponentData } from '../../ecs/Component';
import type { Vec3 } from '../../utils/types';

export interface Velocity extends ComponentData {
	readonly _type: 'Velocity';
	linear: Vec3;
	angular: Vec3;
}

export function createVelocity(overrides: Partial<Omit<Velocity, '_type'>> = {}): Velocity {
	return {
		_type: 'Velocity',
		linear: [0, 0, 0],
		angular: [0, 0, 0],
		...overrides
	};
}
