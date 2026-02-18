import type { FighterStateId } from '../fsm/FighterStateId';
import { clamp } from '../../../utils/math';

/**
 * MovementController — kinematic movement for one fighter.
 *
 * Bridges the gap between the FSM (game logic) and the position system.
 * Instead of the FSM directly mutating positionX via MovingState,
 * this controller computes smooth, physics-like movement with:
 *   - Deceleration near target (anti-overshoot)
 *   - Ring boundary clamping
 *   - Minimum fighter separation
 *   - Knockback impulses with exponential decay
 *   - Facing direction tracking
 *
 * Architecture:
 *   AI/MatchLoop decides "move toward opponent"
 *     → MovementController computes velocity + next position
 *       → Position is written back to MatchState via FSM_SYNC
 *
 * Movement model:
 *   - Kinematic velocity control (we SET position, not apply forces)
 *   - Instant acceleration/deceleration (arcade feel, not sim)
 *   - Anti-jitter: velocity snaps to 0 when within stopping distance
 *   - Ring boundary clamping: fighters can't leave the mat
 *   - Facing direction: stored as a signed value, always toward opponent
 *
 * Knockback:
 *   - External systems call applyKnockback(impulse) for hit reactions
 *   - Knockback is additive on top of movement velocity
 *   - Knockback decays over time (friction-like damping)
 */

// ─── Constants ─────────────────────────────────────────────────────

/** Maximum movement speed in units per second (at 60fps). */
const MAX_MOVE_SPEED = 4.8;

/** Stopping distance: snap to target when this close (prevents oscillation). */
const STOP_THRESHOLD = 0.05;

/** Ring mat half-width on X axis. Fighters can't go beyond ±RING_HALF. */
const RING_HALF_X = 2.8;

/** Minimum separation between fighters to prevent overlap. */
const MIN_SEPARATION = 0.6;

/** Knockback decay rate per second (exponential falloff). */
const KNOCKBACK_DECAY = 8.0;

/** Knockback velocity below this is zeroed (anti-jitter). */
const KNOCKBACK_EPSILON = 0.01;

/** Default preferred attack range (approach distance). */
const DEFAULT_ATTACK_RANGE = 1.5;

/** Ring height (Y position on mat). */
const RING_Y = 1.2;

// ─── Movement Config ───────────────────────────────────────────────

export interface MovementConfig {
	/** Maximum movement speed (units/second). Defaults to MAX_MOVE_SPEED. */
	maxSpeed?: number;
	/** Preferred distance from opponent to stop at. Defaults to DEFAULT_ATTACK_RANGE. */
	attackRange?: number;
}

// ─── States that allow voluntary movement ──────────────────────────

/** FSM states where the fighter can actively move toward a target. */
const MOVEMENT_ALLOWED_STATES: ReadonlySet<FighterStateId> = new Set([
	'IDLE',
	'MOVING'
]);

/** FSM states where the fighter's velocity is forced to zero (no sliding). */
const FROZEN_STATES: ReadonlySet<FighterStateId> = new Set([
	'STUNNED',
	'KNOCKED_DOWN',
	'GETTING_UP',
	'ATTACK_WINDUP',
	'ATTACK_ACTIVE',
	'ATTACK_RECOVERY',
	'BLOCKING',
	'TAUNTING'
]);

// ─── Controller ────────────────────────────────────────────────────

export class MovementController {
	private readonly maxSpeed: number;
	private readonly attackRange: number;

	/** Current position (authoritative, synced back to MatchState). */
	private _positionX = 0;
	private _positionZ = 0;

	/** Current movement velocity (X axis, units/second). */
	private _velocityX = 0;

	/** Knockback velocity (decays over time, units/second). */
	private _knockbackX = 0;
	private _knockbackZ = 0;

	/** Facing direction: +1 = facing right, -1 = facing left. */
	private _facingSign = 1;

	/** Whether movement is currently active (controlled by FSM state). */
	private _movementActive = false;

	/** Target position to move toward (set by FSM/AI). */
	private _targetX = 0;

	/** Has a movement target been set? */
	private _hasTarget = false;

	constructor(config?: MovementConfig) {
		this.maxSpeed = config?.maxSpeed ?? MAX_MOVE_SPEED;
		this.attackRange = config?.attackRange ?? DEFAULT_ATTACK_RANGE;
	}

	// ─── Public Getters ──────────────────────────────────────────

	/** Current X position. */
	get positionX(): number { return this._positionX; }

	/** Current Z position. */
	get positionZ(): number { return this._positionZ; }

	/** Current movement velocity on X axis. */
	get velocityX(): number { return this._velocityX; }

	/** Current knockback velocity on X axis. */
	get knockbackX(): number { return this._knockbackX; }

	/** Current knockback velocity on Z axis. */
	get knockbackZ(): number { return this._knockbackZ; }

	/** Facing direction sign: +1 right, -1 left. */
	get facingSign(): number { return this._facingSign; }

	/** Whether the fighter is actively moving toward a target. */
	get isMoving(): boolean { return this._movementActive && this._hasTarget; }

	/** Preferred attack range. */
	get range(): number { return this.attackRange; }

	// ─── Commands ────────────────────────────────────────────────

	/**
	 * Set the target position to move toward.
	 * Called by the MatchLoop when the AI decides to approach/retreat.
	 */
	moveToward(targetX: number): void {
		this._targetX = clamp(targetX, -RING_HALF_X, RING_HALF_X);
		this._hasTarget = true;
	}

	/**
	 * Move toward the opponent, stopping at the configured attack range.
	 * This is the primary movement command — called every tick when
	 * the fighter is idle and outside attack range.
	 *
	 * @param opponentX  The opponent's current X position.
	 */
	moveTowardOpponent(opponentX: number): void {
		const dx = opponentX - this._positionX;
		const sign = dx > 0 ? 1 : -1;
		const desiredX = opponentX - sign * this.attackRange;
		this.moveToward(desiredX);
	}

	/**
	 * Immediately stop all voluntary movement.
	 * Velocity is zeroed. Knockback continues to decay naturally.
	 */
	stopMovement(): void {
		this._velocityX = 0;
		this._hasTarget = false;
		this._movementActive = false;
	}

	/**
	 * Apply a knockback impulse (from combat hit).
	 * Knockback is additive and decays over time.
	 *
	 * @param impulseX  Knockback velocity in X (units/second).
	 * @param impulseZ  Knockback velocity in Z (units/second).
	 */
	applyKnockback(impulseX: number, impulseZ: number = 0): void {
		this._knockbackX += impulseX;
		this._knockbackZ += impulseZ;
	}

	/**
	 * Update facing direction to always face the opponent.
	 *
	 * @param opponentX  The opponent's current X position.
	 */
	updateFacing(opponentX: number): void {
		const dx = opponentX - this._positionX;
		if (Math.abs(dx) > 0.01) {
			this._facingSign = dx > 0 ? 1 : -1;
		}
	}

	/**
	 * Teleport the fighter to a specific position.
	 * Used for initial placement and respawns.
	 */
	teleport(x: number, z: number = 0): void {
		this._positionX = x;
		this._positionZ = z;
		this._velocityX = 0;
		this._knockbackX = 0;
		this._knockbackZ = 0;
		this._hasTarget = false;
	}

	// ─── Core Update ─────────────────────────────────────────────

	/**
	 * Main update method. Called once per simulation tick.
	 *
	 * Execution order:
	 *   1. Determine movement velocity from FSM state + target
	 *   2. Apply knockback decay
	 *   3. Combine movement + knockback velocity
	 *   4. Predict next position and clamp to ring boundaries
	 *   5. Enforce minimum fighter separation
	 *   6. Update cached position
	 *   7. Check if target reached
	 *
	 * @param dt         Delta time in seconds (1/60 at 60Hz).
	 * @param fsmState   Current FSM state ID (determines if movement is allowed).
	 * @param opponentX  Opponent's current X position (for separation enforcement).
	 */
	updateMovement(
		dt: number,
		fsmState: FighterStateId,
		opponentX: number
	): void {
		// 1. Determine voluntary movement velocity
		this._movementActive = MOVEMENT_ALLOWED_STATES.has(fsmState);

		if (FROZEN_STATES.has(fsmState)) {
			// Frozen states: zero voluntary movement, only knockback
			this._velocityX = 0;
		} else if (this._movementActive && this._hasTarget) {
			this._velocityX = this.computeMovementVelocity();
		} else {
			this._velocityX = 0;
		}

		// 2. Decay knockback (exponential falloff)
		if (Math.abs(this._knockbackX) > KNOCKBACK_EPSILON) {
			this._knockbackX *= Math.exp(-KNOCKBACK_DECAY * dt);
		} else {
			this._knockbackX = 0;
		}
		if (Math.abs(this._knockbackZ) > KNOCKBACK_EPSILON) {
			this._knockbackZ *= Math.exp(-KNOCKBACK_DECAY * dt);
		} else {
			this._knockbackZ = 0;
		}

		// 3. Combined velocity = movement + knockback
		const totalVX = this._velocityX + this._knockbackX;
		const totalVZ = this._knockbackZ; // No voluntary Z movement

		// 4. Predict next position and clamp to ring boundaries
		let nextX = this._positionX + totalVX * dt;
		let nextZ = this._positionZ + totalVZ * dt;

		// Ring boundary clamping
		nextX = clamp(nextX, -RING_HALF_X, RING_HALF_X);
		nextZ = clamp(nextZ, -RING_HALF_X, RING_HALF_X); // ring is square

		// 5. Minimum separation enforcement (prevent fighters from overlapping)
		const sepDx = nextX - opponentX;
		if (Math.abs(sepDx) < MIN_SEPARATION) {
			// Push this fighter away from opponent to maintain minimum gap
			const pushDir = sepDx >= 0 ? 1 : -1;
			nextX = opponentX + pushDir * MIN_SEPARATION;
			nextX = clamp(nextX, -RING_HALF_X, RING_HALF_X);
		}

		// 6. Update cached position
		this._positionX = nextX;
		this._positionZ = nextZ;

		// 7. Check if target reached
		if (this._hasTarget) {
			const remaining = Math.abs(this._targetX - this._positionX);
			if (remaining <= STOP_THRESHOLD) {
				this._positionX = this._targetX;
				this._hasTarget = false;
				this._velocityX = 0;
			}
		}
	}

	// ─── Internal ────────────────────────────────────────────────

	/**
	 * Compute movement velocity toward target.
	 * Uses constant speed with smooth deceleration near target.
	 */
	private computeMovementVelocity(): number {
		const dx = this._targetX - this._positionX;
		const absDx = Math.abs(dx);

		if (absDx <= STOP_THRESHOLD) {
			return 0; // Close enough — stop
		}

		const direction = dx > 0 ? 1 : -1;

		// Deceleration zone: ramp down speed when close to target
		// to prevent overshoot and oscillation
		const decelDist = this.maxSpeed * 0.1; // ~0.48 units
		let speed: number;
		if (absDx < decelDist) {
			// Linear ramp down
			speed = this.maxSpeed * (absDx / decelDist);
			speed = Math.max(speed, 0.5); // minimum crawl speed
		} else {
			speed = this.maxSpeed;
		}

		return direction * speed;
	}

	// ─── Disposal ────────────────────────────────────────────────

	/**
	 * Reset all movement state. Called on match end.
	 */
	reset(): void {
		this._velocityX = 0;
		this._knockbackX = 0;
		this._knockbackZ = 0;
		this._hasTarget = false;
		this._movementActive = false;
		this._facingSign = 1;
	}
}

// ─── Exports ──────────────────────────────────────────────────────

export {
	MAX_MOVE_SPEED,
	STOP_THRESHOLD,
	RING_HALF_X,
	MIN_SEPARATION,
	KNOCKBACK_DECAY,
	DEFAULT_ATTACK_RANGE,
	RING_Y
};
