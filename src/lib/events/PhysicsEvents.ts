import type { EntityId, Vec3 } from '../utils/types';

export interface Collision {
	entityA: EntityId;
	entityB: EntityId;
	point: Vec3;
	normal: Vec3;
	force: number;
}

export interface RingExit {
	entity: EntityId;
	side: 'north' | 'south' | 'east' | 'west';
}

export interface Grounded {
	entity: EntityId;
}
