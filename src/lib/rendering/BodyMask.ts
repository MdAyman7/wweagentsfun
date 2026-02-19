/**
 * Body region mask — controls per-channel influence for layer blending.
 * Each field is 0-1, where 0 = no influence and 1 = full influence.
 */
export interface BodyMask {
	leftArm: number;
	rightArm: number;
	leftLeg: number;
	rightLeg: number;
	torso: number;
	hips: number;
	head: number;
}

/** Full body — all channels at full influence. */
export const FULL_BODY: BodyMask = {
	leftArm: 1, rightArm: 1,
	leftLeg: 1, rightLeg: 1,
	torso: 1, hips: 1, head: 1
};

/** Upper body — arms + torso dominant, partial hip influence. */
export const UPPER_BODY: BodyMask = {
	leftArm: 1, rightArm: 1,
	leftLeg: 0, rightLeg: 0,
	torso: 0.8, hips: 0.3, head: 1
};

/** Lower body — legs + hips dominant, partial torso influence. */
export const LOWER_BODY: BodyMask = {
	leftArm: 0, rightArm: 0,
	leftLeg: 1, rightLeg: 1,
	torso: 0.2, hips: 0.7, head: 0
};
