/**
 * Movement Controller — Barrel Export
 *
 * Kinematic movement system for fighters.
 * Handles approach/retreat, knockback, facing, boundary clamping.
 */

export {
	MovementController,
	type MovementConfig,
	MAX_MOVE_SPEED,
	STOP_THRESHOLD,
	RING_HALF_X,
	MIN_SEPARATION,
	KNOCKBACK_DECAY,
	DEFAULT_ATTACK_RANGE,
	RING_Y
} from './MovementController';
