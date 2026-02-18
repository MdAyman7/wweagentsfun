import type { ComponentData } from '../../ecs/Component';
import type { Vec3, Quat } from '../../utils/types';

export interface Transform extends ComponentData {
	readonly _type: 'Transform';
	position: Vec3;
	rotation: Quat;
	scale: Vec3;
}

export function createTransform(overrides: Partial<Omit<Transform, '_type'>> = {}): Transform {
	return {
		_type: 'Transform',
		position: [0, 0, 0],
		rotation: [0, 0, 0, 1],
		scale: [1, 1, 1],
		...overrides
	};
}
