import * as THREE from 'three';

/**
 * Parameters for the analytic two-bone IK solver.
 */
export interface TwoBoneIKParams {
	/** World-space target position for the end effector (hand). */
	target: THREE.Vector3;
	/** World-space pole vector hint (elbow direction). */
	poleHint: THREE.Vector3;
	/** Length of bone A (upper arm). */
	lengthA: number;
	/** Length of bone B (forearm + hand). */
	lengthB: number;
	/** Blend weight 0-1 (0 = FK only, 1 = full IK). */
	weight: number;
}

/**
 * Result of the two-bone IK solve.
 */
export interface TwoBoneIKResult {
	/** Rotation angle for the shoulder joint (radians). */
	shoulderAngleX: number;
	shoulderAngleZ: number;
	/** Rotation angle for the elbow joint (radians). */
	elbowAngleX: number;
}

/**
 * Analytic two-bone IK solver using the law of cosines.
 *
 * Solves for the shoulder and elbow angles given a target position
 * for the hand (end effector). Single-frame, deterministic — no iteration.
 *
 * The solver works in the shoulder-local coordinate space:
 *   - X: forward (toward target)
 *   - Y: up
 *   - Z: lateral
 */
export function solveTwoBoneIK(
	shoulderWorldPos: THREE.Vector3,
	params: TwoBoneIKParams
): TwoBoneIKResult {
	const { target, lengthA, lengthB, weight } = params;

	if (weight < 0.001) {
		return { shoulderAngleX: 0, shoulderAngleZ: 0, elbowAngleX: 0 };
	}

	// Vector from shoulder to target
	const toTarget = new THREE.Vector3().subVectors(target, shoulderWorldPos);
	const distance = toTarget.length();

	// Clamp distance to reachable range
	const maxReach = lengthA + lengthB - 0.01;
	const minReach = Math.abs(lengthA - lengthB) + 0.01;
	const clampedDist = THREE.MathUtils.clamp(distance, minReach, maxReach);

	// Law of cosines: find elbow angle
	const cosElbow = (lengthA * lengthA + lengthB * lengthB - clampedDist * clampedDist)
		/ (2 * lengthA * lengthB);
	const elbowAngle = Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));

	// Shoulder-to-target angle
	const cosShoulderOffset = (lengthA * lengthA + clampedDist * clampedDist - lengthB * lengthB)
		/ (2 * lengthA * clampedDist);
	const shoulderOffset = Math.acos(THREE.MathUtils.clamp(cosShoulderOffset, -1, 1));

	// Direction to target in world space
	const dirNorm = toTarget.clone().normalize();

	// Shoulder angles (approximate — Y rotation for facing, X for elevation)
	const shoulderAngleX = -(Math.asin(THREE.MathUtils.clamp(dirNorm.y, -1, 1)) + shoulderOffset);
	const shoulderAngleZ = Math.atan2(dirNorm.x, -dirNorm.z);

	// Elbow flexion (negative = bending inward)
	const elbowAngleX = -(Math.PI - elbowAngle);

	// Apply weight blending
	return {
		shoulderAngleX: shoulderAngleX * weight,
		shoulderAngleZ: shoulderAngleZ * weight,
		elbowAngleX: elbowAngleX * weight
	};
}
