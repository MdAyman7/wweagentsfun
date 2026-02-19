import * as THREE from 'three';
import type { AnimationCommand } from './AnimationCommand';
import { solveTwoBoneIK, type TwoBoneIKResult } from './IKSolver';

/**
 * IK target offsets for different body regions.
 * Values are offsets from the opponent's group position.
 */
const REGION_TARGETS: Record<string, { leftY: number; rightY: number; spreadX: number }> = {
	head:  { leftY: 1.7, rightY: 1.7, spreadX: 0.12 },  // hands on sides of head
	body:  { leftY: 1.2, rightY: 1.2, spreadX: 0.25 },  // hands around waist
	legs:  { leftY: 0.7, rightY: 0.7, spreadX: 0.15 },  // hands on thighs
};

/**
 * GrappleIKController — manages IK weight ramping and target computation
 * for grapple/submission/finisher moves.
 *
 * The controller:
 *   1. Determines whether IK should be active (based on move category + phase)
 *   2. Ramps IK weight smoothly (0→1 during windup, hold during active, 1→0 during recovery)
 *   3. Computes hand target positions from opponent position + target region
 *   4. Runs the two-bone IK solver for each arm
 */
export class GrappleIKController {
	private _weight = 0;
	private _targetWeight = 0;
	private _rampSpeed = 8; // weight units per second

	/** Cached arm bone lengths (set during init). */
	private _upperArmLength = 0.27;
	private _forearmLength = 0.25;

	/** Set arm bone lengths (called once during createWrestler). */
	setArmLengths(upperArm: number, forearm: number): void {
		this._upperArmLength = upperArm;
		this._forearmLength = forearm;
	}

	/** Current IK weight (0-1). */
	get weight(): number {
		return this._weight;
	}

	/**
	 * Update IK state based on the current animation command.
	 * @param dt Delta time in seconds.
	 * @param cmd Current animation command.
	 */
	update(dt: number, cmd: AnimationCommand): void {
		// Determine target weight based on phase + move category
		this._targetWeight = this.computeTargetWeight(cmd);

		// Smooth ramp toward target
		if (this._weight < this._targetWeight) {
			this._weight = Math.min(this._weight + this._rampSpeed * dt, this._targetWeight);
		} else if (this._weight > this._targetWeight) {
			this._weight = Math.max(this._weight - this._rampSpeed * dt, this._targetWeight);
		}
	}

	/**
	 * Solve IK for both arms.
	 * @param shoulderLPos World-space left shoulder position.
	 * @param shoulderRPos World-space right shoulder position.
	 * @param opponentPos World-space opponent group position.
	 * @param targetRegion Body region being targeted.
	 */
	solve(
		shoulderLPos: THREE.Vector3,
		shoulderRPos: THREE.Vector3,
		opponentPos: THREE.Vector3,
		targetRegion: string | null
	): { left: TwoBoneIKResult; right: TwoBoneIKResult } {
		if (this._weight < 0.001) {
			const zero = { shoulderAngleX: 0, shoulderAngleZ: 0, elbowAngleX: 0 };
			return { left: zero, right: zero };
		}

		const region = REGION_TARGETS[targetRegion ?? 'body'] ?? REGION_TARGETS.body;

		const leftTarget = new THREE.Vector3(
			opponentPos.x - region.spreadX,
			opponentPos.y + region.leftY,
			opponentPos.z
		);

		const rightTarget = new THREE.Vector3(
			opponentPos.x + region.spreadX,
			opponentPos.y + region.rightY,
			opponentPos.z
		);

		const poleHint = new THREE.Vector3(0, 1, -1).normalize();

		const left = solveTwoBoneIK(shoulderLPos, {
			target: leftTarget,
			poleHint,
			lengthA: this._upperArmLength,
			lengthB: this._forearmLength,
			weight: this._weight
		});

		const right = solveTwoBoneIK(shoulderRPos, {
			target: rightTarget,
			poleHint,
			lengthA: this._upperArmLength,
			lengthB: this._forearmLength,
			weight: this._weight
		});

		return { left, right };
	}

	/**
	 * Compute the target IK weight based on phase and move category.
	 */
	private computeTargetWeight(cmd: AnimationCommand): number {
		const cat = cmd.moveCategory;
		const isGrapple = cat === 'grapple' || cat === 'submission';
		const isFinisher = cmd.finisherRole === 'attacker';

		if (!isGrapple && !isFinisher) return 0;

		switch (cmd.phase) {
			case 'windup':         return isGrapple ? 1.0 : 0;
			case 'active':         return isGrapple ? 1.0 : 0;
			case 'recovery':       return isGrapple ? 0.3 : 0;  // fade out
			case 'finisher_setup': return isFinisher ? 1.0 : 0;
			case 'finisher_impact':return isFinisher ? 1.0 : 0;
			default:               return 0;
		}
	}
}
