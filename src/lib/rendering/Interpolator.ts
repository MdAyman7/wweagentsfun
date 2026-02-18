import type { EntityId, Vec3, Quat } from '../utils/types';
import { vec3Lerp, quatSlerp } from '../utils/math';

interface TransformSnapshot {
	position: Vec3;
	rotation: Quat;
}

/**
 * Stores two consecutive physics-tick snapshots and provides interpolated
 * transforms for smooth rendering between fixed-rate simulation steps.
 *
 * Usage:
 *   1. After each physics tick, call `captureState()` with the current
 *      positions/rotations for all rendered entities.
 *   2. Each render frame, call `getInterpolated(entityId, alpha)` where
 *      alpha = (time since last physics tick) / (physics timestep).
 */
export class Interpolator {
	private previousState: Map<EntityId, TransformSnapshot> = new Map();
	private currentState: Map<EntityId, TransformSnapshot> = new Map();

	/**
	 * Push the latest simulation state. The existing current state
	 * becomes the previous state, and the incoming data becomes current.
	 *
	 * @param renderState Map of entity IDs to their latest transform.
	 *   Keys are EntityId (number).
	 */
	captureState(renderState: Map<number, { position: Vec3; rotation: Quat }>): void {
		// Shift current -> previous
		this.previousState = this.currentState;

		// Store new current
		this.currentState = new Map();
		for (const [id, snap] of renderState) {
			this.currentState.set(id, {
				position: [snap.position[0], snap.position[1], snap.position[2]],
				rotation: [snap.rotation[0], snap.rotation[1], snap.rotation[2], snap.rotation[3]]
			});
		}
	}

	/**
	 * Get the interpolated transform for an entity.
	 *
	 * @param entityId  The entity to look up.
	 * @param alpha     Interpolation factor in [0, 1].
	 *                  0 = previous state, 1 = current state.
	 * @returns Interpolated position and rotation, or the latest known
	 *          state if only one snapshot is available, or null if the
	 *          entity has never been captured.
	 */
	getInterpolated(entityId: EntityId, alpha: number): { position: Vec3; rotation: Quat } | null {
		const cur = this.currentState.get(entityId);
		const prev = this.previousState.get(entityId);

		if (!cur && !prev) {
			return null;
		}

		// If we only have one snapshot, return it directly
		if (!prev && cur) {
			return { position: [...cur.position], rotation: [...cur.rotation] };
		}
		if (prev && !cur) {
			return { position: [...prev.position], rotation: [...prev.rotation] };
		}

		// Both snapshots available -- interpolate
		const p = prev!;
		const c = cur!;
		return {
			position: vec3Lerp(p.position, c.position, alpha),
			rotation: quatSlerp(p.rotation, c.rotation, alpha)
		};
	}

	/**
	 * Remove an entity from both snapshots (e.g. when it's despawned).
	 */
	remove(entityId: EntityId): void {
		this.previousState.delete(entityId);
		this.currentState.delete(entityId);
	}

	/**
	 * Clear all stored state.
	 */
	clear(): void {
		this.previousState.clear();
		this.currentState.clear();
	}
}
