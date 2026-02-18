import type { EntityId, Vec3 } from '../utils/types';
import type { PhysicsAdapter } from './PhysicsAdapter';
import { vec3Sub, vec3Normalize, vec3Length } from '../utils/math';

/** Axis-aligned bounding rectangle of the ring surface (XZ plane). */
export interface RingBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

/** Default ring bounds matching the 6x6 ring at the origin. */
export const DEFAULT_RING_BOUNDS: RingBounds = {
	minX: -3,
	maxX: 3,
	minZ: -3,
	maxZ: 3
};

/**
 * Utility service wrapping common raycast queries used by the
 * simulation and AI systems (ground detection, line-of-sight,
 * proximity to ropes, in-ring checks).
 */
export class RaycastService {
	constructor(private adapter: PhysicsAdapter) {}

	/**
	 * Check whether the entity is standing on solid ground.
	 * Casts a short ray downward from the given position and returns
	 * true if a surface is found within the threshold.
	 *
	 * @param entityId  The entity to ignore in the cast (self-filter).
	 * @param position  Current world position (feet level).
	 * @param threshold Maximum distance below feet to count as grounded.
	 */
	isGrounded(entityId: EntityId, position: Vec3, threshold: number = 0.15): boolean {
		const origin: Vec3 = [position[0], position[1] + 0.05, position[2]];
		const direction: Vec3 = [0, -1, 0];
		const hit = this.adapter.raycast(origin, direction, threshold + 0.1);

		if (!hit) return false;
		// Ignore self-collision
		if (hit.entityId === entityId) return false;
		return hit.distance <= threshold + 0.05;
	}

	/**
	 * Determine whether there is a clear line of sight between two
	 * world-space points (no obstructing geometry in between).
	 */
	canSeeOpponent(from: Vec3, to: Vec3): boolean {
		const diff = vec3Sub(to, from);
		const dist = vec3Length(diff);
		if (dist < 0.001) return true;

		const dir = vec3Normalize(diff);
		const hit = this.adapter.raycast(from, dir, dist);

		// If no hit, line is clear
		if (!hit) return true;
		// If the hit distance is approximately the target distance, we
		// hit the target itself -- still counts as visible.
		return hit.distance >= dist - 0.1;
	}

	/**
	 * Calculate the minimum distance from a position to the nearest
	 * ring edge / rope line.
	 *
	 * @param position   World position to measure from.
	 * @param ringBounds The ring's XZ extents.
	 */
	distanceToRopes(position: Vec3, ringBounds: RingBounds = DEFAULT_RING_BOUNDS): number {
		const x = position[0];
		const z = position[2];

		const dMinX = Math.abs(x - ringBounds.minX);
		const dMaxX = Math.abs(x - ringBounds.maxX);
		const dMinZ = Math.abs(z - ringBounds.minZ);
		const dMaxZ = Math.abs(z - ringBounds.maxZ);

		return Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
	}

	/**
	 * Check whether a world position lies within the ring mat area.
	 * Only considers the XZ plane (horizontal extent).
	 *
	 * @param position   World position to test.
	 * @param ringBounds The ring's XZ extents.
	 */
	isInRing(position: Vec3, ringBounds: RingBounds = DEFAULT_RING_BOUNDS): boolean {
		return (
			position[0] >= ringBounds.minX &&
			position[0] <= ringBounds.maxX &&
			position[2] >= ringBounds.minZ &&
			position[2] <= ringBounds.maxZ
		);
	}
}
