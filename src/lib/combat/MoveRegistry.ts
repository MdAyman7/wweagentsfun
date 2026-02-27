import type { MoveCategory, BodyRegion } from '../utils/types';

/**
 * Hitbox definition for spatial collision during move execution.
 */
export interface MoveHitbox {
	/** Effective range in world units. */
	range: number;
	/** Angle of the hitbox arc in degrees (360 = all-around). */
	angle: number;
}

/**
 * Complete definition of a wrestling move.
 * Immutable after registration — treat as read-only data.
 */
export interface MoveDef {
	/** Unique identifier (e.g., 'ddt', 'suplex', 'dropkick'). */
	id: string;
	/** Human-readable display name. */
	name: string;
	/** Move type classification. */
	category: MoveCategory;
	/** Frames of windup animation before the move becomes active. */
	windupFrames: number;
	/** Frames during which the hitbox is active and can connect. */
	activeFrames: number;
	/** Frames of recovery after the active phase. */
	recoveryFrames: number;
	/** Base damage before modifiers. */
	baseDamage: number;
	/** Stamina cost to the attacker. */
	staminaCost: number;
	/** Body region this move targets for damage accumulation. */
	region: BodyRegion;
	/** Momentum gained by the attacker on hit. */
	momentumGain: number;
	/** Spatial hitbox for collision detection. */
	hitbox: MoveHitbox;
	/** Whether this move can be reversed/countered by the defender. */
	canBeReversed: boolean;
	/** Frame window in which a reversal input is accepted (0 = not reversible). */
	reversalWindow: number;
}

/**
 * Default move database.
 * Each entry is a complete MoveDef with realistic frame data and damage values.
 */
const DEFAULT_MOVES: MoveDef[] = [
	// ── Strikes ──
	// Frame timings scaled 3× for cinematic pacing (jab ~0.45s, superkick ~1.05s)
	{
		id: 'jab',
		name: 'Jab',
		category: 'strike',
		windupFrames: 6,
		activeFrames: 8,
		recoveryFrames: 12,
		baseDamage: 3,
		staminaCost: 2,
		region: 'head',
		momentumGain: 2,
		hitbox: { range: 1.5, angle: 45 },
		canBeReversed: false,
		reversalWindow: 0
	},
	{
		id: 'chop',
		name: 'Knife Edge Chop',
		category: 'strike',
		windupFrames: 12,
		activeFrames: 9,
		recoveryFrames: 18,
		baseDamage: 6,
		staminaCost: 4,
		region: 'body',
		momentumGain: 4,
		hitbox: { range: 1.8, angle: 60 },
		canBeReversed: false,
		reversalWindow: 0
	},
	{
		id: 'forearm_smash',
		name: 'Forearm Smash',
		category: 'strike',
		windupFrames: 15,
		activeFrames: 12,
		recoveryFrames: 21,
		baseDamage: 8,
		staminaCost: 5,
		region: 'head',
		momentumGain: 5,
		hitbox: { range: 1.8, angle: 50 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'kick',
		name: 'Body Kick',
		category: 'strike',
		windupFrames: 12,
		activeFrames: 12,
		recoveryFrames: 18,
		baseDamage: 7,
		staminaCost: 4,
		region: 'body',
		momentumGain: 4,
		hitbox: { range: 2.2, angle: 45 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'superkick',
		name: 'Superkick',
		category: 'strike',
		windupFrames: 24,
		activeFrames: 9,
		recoveryFrames: 30,
		baseDamage: 15,
		staminaCost: 10,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 2.5, angle: 30 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'clothesline',
		name: 'Clothesline',
		category: 'strike',
		windupFrames: 18,
		activeFrames: 12,
		recoveryFrames: 24,
		baseDamage: 10,
		staminaCost: 6,
		region: 'head',
		momentumGain: 7,
		hitbox: { range: 2.0, angle: 90 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'dropkick',
		name: 'Dropkick',
		category: 'strike',
		windupFrames: 21,
		activeFrames: 12,
		recoveryFrames: 36,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 3.0, angle: 40 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'enzuigiri',
		name: 'Enzuigiri',
		category: 'strike',
		windupFrames: 27,
		activeFrames: 9,
		recoveryFrames: 42,
		baseDamage: 14,
		staminaCost: 10,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 2.0, angle: 35 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'superman_punch',
		name: 'Superman Punch',
		category: 'strike',
		windupFrames: 24,
		activeFrames: 9,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 10,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 3.0, angle: 40 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'spear',
		name: 'Spear',
		category: 'strike',
		windupFrames: 21,
		activeFrames: 15,
		recoveryFrames: 36,
		baseDamage: 16,
		staminaCost: 12,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 4.0, angle: 45 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'bicycle_kick',
		name: 'Bicycle Kick',
		category: 'strike',
		windupFrames: 21,
		activeFrames: 9,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 9,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 2.8, angle: 35 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'running_knee',
		name: 'Running Knee Strike',
		category: 'strike',
		windupFrames: 24,
		activeFrames: 9,
		recoveryFrames: 30,
		baseDamage: 15,
		staminaCost: 10,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 3.5, angle: 40 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'discus_clothesline',
		name: 'Discus Clothesline',
		category: 'strike',
		windupFrames: 24,
		activeFrames: 12,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 9,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 2.5, angle: 90 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'big_boot',
		name: 'Big Boot',
		category: 'strike',
		windupFrames: 18,
		activeFrames: 12,
		recoveryFrames: 24,
		baseDamage: 11,
		staminaCost: 7,
		region: 'head',
		momentumGain: 7,
		hitbox: { range: 2.5, angle: 40 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'spinning_heel_kick',
		name: 'Spinning Heel Kick',
		category: 'strike',
		windupFrames: 24,
		activeFrames: 9,
		recoveryFrames: 33,
		baseDamage: 13,
		staminaCost: 9,
		region: 'head',
		momentumGain: 8,
		hitbox: { range: 2.2, angle: 40 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'throat_thrust',
		name: 'Throat Thrust',
		category: 'strike',
		windupFrames: 12,
		activeFrames: 9,
		recoveryFrames: 18,
		baseDamage: 7,
		staminaCost: 4,
		region: 'head',
		momentumGain: 4,
		hitbox: { range: 1.8, angle: 40 },
		canBeReversed: false,
		reversalWindow: 0
	},
	{
		id: 'elbow_smash',
		name: 'Elbow Smash',
		category: 'strike',
		windupFrames: 15,
		activeFrames: 9,
		recoveryFrames: 21,
		baseDamage: 8,
		staminaCost: 5,
		region: 'head',
		momentumGain: 5,
		hitbox: { range: 1.5, angle: 50 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'shoot_kick',
		name: 'Shoot Kick',
		category: 'strike',
		windupFrames: 9,
		activeFrames: 9,
		recoveryFrames: 15,
		baseDamage: 5,
		staminaCost: 3,
		region: 'body',
		momentumGain: 3,
		hitbox: { range: 2.0, angle: 40 },
		canBeReversed: false,
		reversalWindow: 0
	},
	{
		id: 'running_lariat',
		name: 'Running Lariat',
		category: 'strike',
		windupFrames: 21,
		activeFrames: 12,
		recoveryFrames: 30,
		baseDamage: 13,
		staminaCost: 9,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 3.0, angle: 90 },
		canBeReversed: true,
		reversalWindow: 10
	},

	// ── Grapple Moves ──
	{
		id: 'headlock_takeover',
		name: 'Headlock Takeover',
		category: 'grapple',
		windupFrames: 18,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 8,
		staminaCost: 6,
		region: 'head',
		momentumGain: 5,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'snap_suplex',
		name: 'Snap Suplex',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 30,
		recoveryFrames: 36,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'ddt',
		name: 'DDT',
		category: 'grapple',
		windupFrames: 21,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 8,
		region: 'head',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'neckbreaker',
		name: 'Neckbreaker',
		category: 'grapple',
		windupFrames: 21,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 11,
		staminaCost: 7,
		region: 'head',
		momentumGain: 6,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 12
	},
	{
		id: 'body_slam',
		name: 'Body Slam',
		category: 'grapple',
		windupFrames: 30,
		activeFrames: 30,
		recoveryFrames: 24,
		baseDamage: 10,
		staminaCost: 8,
		region: 'body',
		momentumGain: 6,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'vertical_suplex',
		name: 'Vertical Suplex',
		category: 'grapple',
		windupFrames: 36,
		activeFrames: 36,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'german_suplex',
		name: 'German Suplex',
		category: 'grapple',
		windupFrames: 30,
		activeFrames: 36,
		recoveryFrames: 30,
		baseDamage: 16,
		staminaCost: 12,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'powerbomb',
		name: 'Powerbomb',
		category: 'grapple',
		windupFrames: 42,
		activeFrames: 36,
		recoveryFrames: 30,
		baseDamage: 18,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'backbreaker',
		name: 'Backbreaker',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'piledriver',
		name: 'Piledriver',
		category: 'grapple',
		windupFrames: 42,
		activeFrames: 30,
		recoveryFrames: 36,
		baseDamage: 20,
		staminaCost: 14,
		region: 'head',
		momentumGain: 12,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'tombstone_piledriver',
		name: 'Tombstone Piledriver',
		category: 'grapple',
		windupFrames: 48,
		activeFrames: 30,
		recoveryFrames: 36,
		baseDamage: 22,
		staminaCost: 16,
		region: 'head',
		momentumGain: 14,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'chokeslam',
		name: 'Chokeslam',
		category: 'grapple',
		windupFrames: 36,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 17,
		staminaCost: 12,
		region: 'body',
		momentumGain: 11,
		hitbox: { range: 1.2, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'samoan_drop',
		name: 'Samoan Drop',
		category: 'grapple',
		windupFrames: 30,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'fisherman_suplex',
		name: 'Fisherman Suplex',
		category: 'grapple',
		windupFrames: 30,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'belly_to_belly_suplex',
		name: 'Belly-to-Belly Suplex',
		category: 'grapple',
		windupFrames: 27,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 13,
		staminaCost: 9,
		region: 'body',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'sitout_powerbomb',
		name: 'Sit-Out Powerbomb',
		category: 'grapple',
		windupFrames: 42,
		activeFrames: 36,
		recoveryFrames: 36,
		baseDamage: 19,
		staminaCost: 15,
		region: 'body',
		momentumGain: 13,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'spinebuster',
		name: 'Spinebuster',
		category: 'grapple',
		windupFrames: 27,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 9,
		hitbox: { range: 1.5, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 't_bone_suplex',
		name: 'T-Bone Suplex',
		category: 'grapple',
		windupFrames: 30,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 15,
		staminaCost: 11,
		region: 'body',
		momentumGain: 9,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'double_underhook_suplex',
		name: 'Double Underhook Suplex',
		category: 'grapple',
		windupFrames: 30,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'gutwrench_powerbomb',
		name: 'Gutwrench Powerbomb',
		category: 'grapple',
		windupFrames: 42,
		activeFrames: 36,
		recoveryFrames: 30,
		baseDamage: 18,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'uranage',
		name: 'Uranage Slam',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 24,
		recoveryFrames: 24,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 7,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'scoop_slam',
		name: 'Scoop Slam',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 24,
		recoveryFrames: 24,
		baseDamage: 9,
		staminaCost: 7,
		region: 'body',
		momentumGain: 5,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'side_slam',
		name: 'Side Slam',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 24,
		recoveryFrames: 24,
		baseDamage: 11,
		staminaCost: 8,
		region: 'body',
		momentumGain: 6,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'fireman_carry_slam',
		name: "Fireman's Carry Slam",
		category: 'grapple',
		windupFrames: 36,
		activeFrames: 30,
		recoveryFrames: 30,
		baseDamage: 16,
		staminaCost: 12,
		region: 'body',
		momentumGain: 10,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'cutter',
		name: 'Cutter',
		category: 'grapple',
		windupFrames: 15,
		activeFrames: 18,
		recoveryFrames: 30,
		baseDamage: 15,
		staminaCost: 9,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 1.5, angle: 60 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'jawbreaker',
		name: 'Jawbreaker',
		category: 'grapple',
		windupFrames: 15,
		activeFrames: 18,
		recoveryFrames: 24,
		baseDamage: 12,
		staminaCost: 7,
		region: 'head',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'swinging_neckbreaker',
		name: 'Swinging Neckbreaker',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 12,
		staminaCost: 8,
		region: 'head',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'facelock_neckbreaker',
		name: 'Three-Quarter Facelock Neckbreaker',
		category: 'grapple',
		windupFrames: 18,
		activeFrames: 18,
		recoveryFrames: 30,
		baseDamage: 14,
		staminaCost: 9,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 1.5, angle: 60 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'double_underhook_facebuster',
		name: 'Double Underhook Facebuster',
		category: 'grapple',
		windupFrames: 36,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 16,
		staminaCost: 11,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'flapjack',
		name: 'Flapjack',
		category: 'grapple',
		windupFrames: 24,
		activeFrames: 24,
		recoveryFrames: 30,
		baseDamage: 11,
		staminaCost: 8,
		region: 'body',
		momentumGain: 6,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'spinning_fireman_carry',
		name: 'Spinning Fireman Carry Slam',
		category: 'grapple',
		windupFrames: 36,
		activeFrames: 30,
		recoveryFrames: 36,
		baseDamage: 18,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},

	// ── Aerial Moves ──
	{
		id: 'diving_crossbody',
		name: 'Diving Crossbody',
		category: 'aerial',
		windupFrames: 36,
		activeFrames: 15,
		recoveryFrames: 48,
		baseDamage: 14,
		staminaCost: 12,
		region: 'body',
		momentumGain: 10,
		hitbox: { range: 4.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'missile_dropkick',
		name: 'Missile Dropkick',
		category: 'aerial',
		windupFrames: 42,
		activeFrames: 12,
		recoveryFrames: 54,
		baseDamage: 16,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 4.5, angle: 45 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'moonsault',
		name: 'Moonsault',
		category: 'aerial',
		windupFrames: 48,
		activeFrames: 15,
		recoveryFrames: 60,
		baseDamage: 18,
		staminaCost: 16,
		region: 'body',
		momentumGain: 14,
		hitbox: { range: 3.5, angle: 90 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'frog_splash',
		name: 'Frog Splash',
		category: 'aerial',
		windupFrames: 42,
		activeFrames: 12,
		recoveryFrames: 54,
		baseDamage: 17,
		staminaCost: 14,
		region: 'body',
		momentumGain: 13,
		hitbox: { range: 3.0, angle: 70 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'elbow_drop_top',
		name: 'Top Rope Elbow Drop',
		category: 'aerial',
		windupFrames: 36,
		activeFrames: 12,
		recoveryFrames: 42,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 10,
		hitbox: { range: 2.5, angle: 60 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'swanton_bomb',
		name: 'Swanton Bomb',
		category: 'aerial',
		windupFrames: 48,
		activeFrames: 12,
		recoveryFrames: 60,
		baseDamage: 19,
		staminaCost: 16,
		region: 'body',
		momentumGain: 14,
		hitbox: { range: 3.5, angle: 80 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'senton_630',
		name: '630 Senton',
		category: 'aerial',
		windupFrames: 54,
		activeFrames: 12,
		recoveryFrames: 66,
		baseDamage: 22,
		staminaCost: 20,
		region: 'body',
		momentumGain: 16,
		hitbox: { range: 3.0, angle: 70 },
		canBeReversed: true,
		reversalWindow: 6
	},
	{
		id: 'diving_foot_stomp',
		name: 'Diving Double Foot Stomp',
		category: 'aerial',
		windupFrames: 42,
		activeFrames: 9,
		recoveryFrames: 48,
		baseDamage: 18,
		staminaCost: 14,
		region: 'body',
		momentumGain: 13,
		hitbox: { range: 2.5, angle: 50 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'shooting_star_press',
		name: 'Shooting Star Press',
		category: 'aerial',
		windupFrames: 48,
		activeFrames: 12,
		recoveryFrames: 60,
		baseDamage: 20,
		staminaCost: 18,
		region: 'body',
		momentumGain: 15,
		hitbox: { range: 3.5, angle: 80 },
		canBeReversed: true,
		reversalWindow: 7
	},
	{
		id: 'phoenix_splash_aerial',
		name: 'Phoenix Splash',
		category: 'aerial',
		windupFrames: 54,
		activeFrames: 12,
		recoveryFrames: 60,
		baseDamage: 21,
		staminaCost: 18,
		region: 'body',
		momentumGain: 15,
		hitbox: { range: 3.0, angle: 70 },
		canBeReversed: true,
		reversalWindow: 6
	},
	{
		id: 'diving_leg_drop',
		name: 'Diving Leg Drop',
		category: 'aerial',
		windupFrames: 36,
		activeFrames: 12,
		recoveryFrames: 48,
		baseDamage: 14,
		staminaCost: 12,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 3.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'springboard_clothesline',
		name: 'Springboard Clothesline',
		category: 'aerial',
		windupFrames: 30,
		activeFrames: 12,
		recoveryFrames: 36,
		baseDamage: 13,
		staminaCost: 10,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 3.5, angle: 70 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'tiger_feint_kick',
		name: 'Tiger Feint Kick (619)',
		category: 'aerial',
		windupFrames: 36,
		activeFrames: 12,
		recoveryFrames: 42,
		baseDamage: 14,
		staminaCost: 12,
		region: 'head',
		momentumGain: 11,
		hitbox: { range: 4.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'senton_bomb',
		name: 'Senton Bomb',
		category: 'aerial',
		windupFrames: 42,
		activeFrames: 12,
		recoveryFrames: 48,
		baseDamage: 15,
		staminaCost: 12,
		region: 'body',
		momentumGain: 11,
		hitbox: { range: 3.0, angle: 70 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'corkscrew_plancha',
		name: 'Corkscrew Plancha',
		category: 'aerial',
		windupFrames: 42,
		activeFrames: 15,
		recoveryFrames: 54,
		baseDamage: 16,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 5.0, angle: 90 },
		canBeReversed: true,
		reversalWindow: 8
	},

	// ── Submissions ──
	{
		id: 'armbar',
		name: 'Armbar',
		category: 'submission',
		windupFrames: 24,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 2,
		staminaCost: 6,
		region: 'body',
		momentumGain: 3,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'sharpshooter',
		name: 'Sharpshooter',
		category: 'submission',
		windupFrames: 30,
		activeFrames: 120,
		recoveryFrames: 30,
		baseDamage: 3,
		staminaCost: 8,
		region: 'legs',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'sleeper_hold',
		name: 'Sleeper Hold',
		category: 'submission',
		windupFrames: 18,
		activeFrames: 120,
		recoveryFrames: 18,
		baseDamage: 2,
		staminaCost: 4,
		region: 'head',
		momentumGain: 2,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'figure_four',
		name: 'Figure Four Leglock',
		category: 'submission',
		windupFrames: 36,
		activeFrames: 120,
		recoveryFrames: 30,
		baseDamage: 3,
		staminaCost: 10,
		region: 'legs',
		momentumGain: 5,
		hitbox: { range: 1.2, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'crossface',
		name: 'Crossface',
		category: 'submission',
		windupFrames: 24,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 3,
		staminaCost: 7,
		region: 'head',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'ankle_lock',
		name: 'Ankle Lock',
		category: 'submission',
		windupFrames: 24,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 3,
		staminaCost: 7,
		region: 'legs',
		momentumGain: 4,
		hitbox: { range: 1.2, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'boston_crab',
		name: 'Boston Crab',
		category: 'submission',
		windupFrames: 30,
		activeFrames: 120,
		recoveryFrames: 30,
		baseDamage: 3,
		staminaCost: 8,
		region: 'legs',
		momentumGain: 4,
		hitbox: { range: 1.2, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'walls_of_jericho',
		name: 'Walls of Jericho',
		category: 'submission',
		windupFrames: 36,
		activeFrames: 120,
		recoveryFrames: 30,
		baseDamage: 4,
		staminaCost: 10,
		region: 'legs',
		momentumGain: 5,
		hitbox: { range: 1.2, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'stf',
		name: 'STF',
		category: 'submission',
		windupFrames: 30,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 3,
		staminaCost: 8,
		region: 'head',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'camel_clutch',
		name: 'Camel Clutch',
		category: 'submission',
		windupFrames: 30,
		activeFrames: 120,
		recoveryFrames: 30,
		baseDamage: 3,
		staminaCost: 8,
		region: 'body',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 16
	},
	{
		id: 'triangle_choke',
		name: 'Triangle Choke',
		category: 'submission',
		windupFrames: 30,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 3,
		staminaCost: 8,
		region: 'head',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'kimura_lock',
		name: 'Kimura Lock',
		category: 'submission',
		windupFrames: 24,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 3,
		staminaCost: 7,
		region: 'body',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},
	{
		id: 'coquina_clutch',
		name: 'Coquina Clutch',
		category: 'submission',
		windupFrames: 18,
		activeFrames: 120,
		recoveryFrames: 18,
		baseDamage: 3,
		staminaCost: 6,
		region: 'head',
		momentumGain: 3,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 18
	},
	{
		id: 'bank_statement',
		name: 'Bank Statement',
		category: 'submission',
		windupFrames: 30,
		activeFrames: 120,
		recoveryFrames: 24,
		baseDamage: 4,
		staminaCost: 9,
		region: 'head',
		momentumGain: 5,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 14
	},

	// ── Signature/Finisher placeholders ──
	// (Real signature/finisher moves are wrestler-specific and loaded via FinisherTable)
	{
		id: 'generic_signature',
		name: 'Signature Move',
		category: 'signature',
		windupFrames: 30,
		activeFrames: 24,
		recoveryFrames: 36,
		baseDamage: 18,
		staminaCost: 12,
		region: 'head',
		momentumGain: 15,
		hitbox: { range: 2.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 10
	},
	{
		id: 'generic_finisher',
		name: 'Finisher',
		category: 'finisher',
		windupFrames: 36,
		activeFrames: 30,
		recoveryFrames: 42,
		baseDamage: 25,
		staminaCost: 15,
		region: 'head',
		momentumGain: 20,
		hitbox: { range: 2.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 8
	}
];

/**
 * Central registry of all move definitions.
 * Singleton-like: instantiate once and pass by reference.
 * Pre-loaded with the default move set. Additional moves can be
 * registered at runtime (e.g., from JSON data files).
 */
export class MoveRegistry {
	private moves: Map<string, MoveDef> = new Map();
	private byCategory: Map<MoveCategory, MoveDef[]> = new Map();

	constructor(initialMoves?: MoveDef[]) {
		const movesToLoad = initialMoves ?? DEFAULT_MOVES;
		for (const move of movesToLoad) {
			this.register(move);
		}
	}

	/**
	 * Register a new move definition.
	 * Overwrites any existing move with the same ID.
	 */
	register(move: MoveDef): void {
		this.moves.set(move.id, move);

		// Update category index
		const catList = this.byCategory.get(move.category) ?? [];
		// Remove old entry if re-registering
		const existingIdx = catList.findIndex((m) => m.id === move.id);
		if (existingIdx >= 0) {
			catList[existingIdx] = move;
		} else {
			catList.push(move);
		}
		this.byCategory.set(move.category, catList);
	}

	/**
	 * Get a move definition by ID.
	 * Returns undefined if the move is not registered.
	 */
	get(id: string): MoveDef | undefined {
		return this.moves.get(id);
	}

	/**
	 * Get all moves in a given category.
	 */
	getByCategory(category: MoveCategory): MoveDef[] {
		return this.byCategory.get(category) ?? [];
	}

	/**
	 * Get all registered move definitions.
	 */
	getAll(): MoveDef[] {
		return Array.from(this.moves.values());
	}

	/**
	 * Check if a move ID is registered.
	 */
	has(id: string): boolean {
		return this.moves.has(id);
	}

	/**
	 * Get the total number of registered moves.
	 */
	get size(): number {
		return this.moves.size;
	}

	/**
	 * Load moves from a JSON array (e.g., from a data file).
	 * Validates required fields before registration.
	 */
	loadFromJSON(data: unknown[]): number {
		let loaded = 0;
		for (const entry of data) {
			if (this.isValidMoveDef(entry)) {
				this.register(entry);
				loaded++;
			}
		}
		return loaded;
	}

	/**
	 * Type guard to validate a move definition from external data.
	 */
	private isValidMoveDef(data: unknown): data is MoveDef {
		if (typeof data !== 'object' || data === null) return false;
		const obj = data as Record<string, unknown>;
		return (
			typeof obj.id === 'string' &&
			typeof obj.name === 'string' &&
			typeof obj.category === 'string' &&
			typeof obj.windupFrames === 'number' &&
			typeof obj.activeFrames === 'number' &&
			typeof obj.recoveryFrames === 'number' &&
			typeof obj.baseDamage === 'number' &&
			typeof obj.staminaCost === 'number' &&
			typeof obj.region === 'string' &&
			typeof obj.momentumGain === 'number' &&
			typeof obj.hitbox === 'object' &&
			obj.hitbox !== null &&
			typeof (obj.hitbox as Record<string, unknown>).range === 'number' &&
			typeof (obj.hitbox as Record<string, unknown>).angle === 'number' &&
			typeof obj.canBeReversed === 'boolean' &&
			typeof obj.reversalWindow === 'number'
		);
	}
}
