import type { ComponentData } from '../../ecs/Component';

export type ColliderShape = 'capsule' | 'box' | 'sphere' | 'plane';

export interface Collider extends ComponentData {
	readonly _type: 'Collider';
	shape: ColliderShape;
	dimensions: { width: number; height: number; depth: number; radius?: number };
	layerMask: number;
	restitution: number;
	friction: number;
	isTrigger: boolean;
}

export function createCollider(overrides: Partial<Omit<Collider, '_type'>> = {}): Collider {
	return {
		_type: 'Collider',
		shape: 'capsule',
		dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
		layerMask: 1,
		restitution: 0.2,
		friction: 0.5,
		isTrigger: false,
		...overrides
	};
}
