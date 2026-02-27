import type { MoveDef } from './MoveRegistry';
import type { MoveCategory, BodyRegion } from '../utils/types';

/**
 * A wrestler's signature or finisher move definition.
 * Extends the base MoveDef with additional wrestler-specific metadata.
 */
export interface SpecialMoveDef extends MoveDef {
	/** The moveset ID this special move belongs to. */
	movesetId: string;
	/** Whether this is a signature or finisher. */
	specialType: 'signature' | 'finisher';
	/** Setup description for commentary/animation. */
	setupDescription: string;
}

/**
 * A wrestler's moveset entry: links a moveset ID to their special moves.
 */
export interface MovesetEntry {
	/** Unique moveset identifier (matches wrestler data). */
	movesetId: string;
	/** Wrestler name for display. */
	wrestlerName: string;
	/** The signature move(s). */
	signatures: SpecialMoveDef[];
	/** The finisher move(s). */
	finishers: SpecialMoveDef[];
}

/**
 * Helper to create a SpecialMoveDef with common defaults.
 */
function makeSpecial(
	movesetId: string,
	specialType: 'signature' | 'finisher',
	id: string,
	name: string,
	category: MoveCategory,
	baseDamage: number,
	region: BodyRegion,
	setupDescription: string,
	overrides: Partial<MoveDef> = {}
): SpecialMoveDef {
	return {
		id,
		name,
		category,
		windupFrames: specialType === 'finisher' ? 42 : 30,
		activeFrames: specialType === 'finisher' ? 30 : 24,
		recoveryFrames: specialType === 'finisher' ? 42 : 30,
		baseDamage,
		staminaCost: specialType === 'finisher' ? 18 : 12,
		region,
		momentumGain: specialType === 'finisher' ? 20 : 15,
		hitbox: { range: 2.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: specialType === 'finisher' ? 3 : 4,
		movesetId,
		specialType,
		setupDescription,
		...overrides
	};
}

/**
 * Default moveset definitions.
 * Each entry represents a wrestler archetype with their special moves.
 */
const DEFAULT_MOVESETS: MovesetEntry[] = [
	{
		movesetId: 'powerhouse_a',
		wrestlerName: 'The Titan',
		signatures: [
			makeSpecial('powerhouse_a', 'signature', 'titan_press', 'Titan Press', 'signature', 20, 'body',
				'Lifts opponent overhead', {
					windupFrames: 42,
					staminaCost: 14,
					hitbox: { range: 1.5, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('powerhouse_a', 'finisher', 'titan_bomb', 'Titan Bomb', 'finisher', 30, 'body',
				'Lifts opponent for devastating powerbomb', {
					windupFrames: 48,
					activeFrames: 36,
					staminaCost: 20,
					hitbox: { range: 1.5, angle: 360 }
				})
		]
	},
	{
		movesetId: 'technician_a',
		wrestlerName: 'The Architect',
		signatures: [
			makeSpecial('technician_a', 'signature', 'architect_lock', 'Architect Lock', 'signature', 4, 'legs',
				'Locks in a complex leg submission', {
					category: 'submission',
					windupFrames: 30,
					activeFrames: 120,
					recoveryFrames: 24,
					staminaCost: 10,
					hitbox: { range: 1.0, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('technician_a', 'finisher', 'blueprint_driver', 'Blueprint Driver', 'finisher', 28, 'head',
				'Hooks the arm and drives opponent into the mat', {
					windupFrames: 36,
					staminaCost: 18
				})
		]
	},
	{
		movesetId: 'highflyer_a',
		wrestlerName: 'Phoenix',
		signatures: [
			makeSpecial('highflyer_a', 'signature', 'phoenix_kick', 'Phoenix Kick', 'signature', 18, 'head',
				'Springboard spinning heel kick', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					staminaCost: 14,
					hitbox: { range: 3.5, angle: 45 }
				})
		],
		finishers: [
			makeSpecial('highflyer_a', 'finisher', 'phoenix_splash', 'Phoenix Splash', 'finisher', 32, 'body',
				'Corkscrew shooting star press from the top rope', {
					category: 'aerial' as MoveCategory,
					windupFrames: 54,
					activeFrames: 15,
					recoveryFrames: 60,
					staminaCost: 22,
					hitbox: { range: 4.0, angle: 90 },
					reversalWindow: 5
				})
		]
	},
	{
		movesetId: 'brawler_a',
		wrestlerName: 'Bonebreaker',
		signatures: [
			makeSpecial('brawler_a', 'signature', 'bone_lariat', 'Bone Lariat', 'signature', 22, 'head',
				'Running lariat with devastating impact', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 2.5, angle: 90 }
				})
		],
		finishers: [
			makeSpecial('brawler_a', 'finisher', 'skull_crusher', 'Skull Crusher', 'finisher', 28, 'head',
				'Short-arm clothesline into a sit-out piledriver', {
					windupFrames: 36,
					staminaCost: 16
				})
		]
	},
	{
		movesetId: 'psychologist_a',
		wrestlerName: 'The Mastermind',
		signatures: [
			makeSpecial('psychologist_a', 'signature', 'mind_game', 'Mind Game', 'signature', 16, 'head',
				'Calculated strike combination targeting a weakened area', {
					windupFrames: 24,
					activeFrames: 30,
					staminaCost: 10
				})
		],
		finishers: [
			makeSpecial('psychologist_a', 'finisher', 'checkmate', 'Checkmate', 'finisher', 26, 'head',
				'Methodical setup into a devastating finishing blow', {
					windupFrames: 42,
					activeFrames: 24,
					staminaCost: 16
				})
		]
	},
	{
		movesetId: 'allrounder_a',
		wrestlerName: 'The Prodigy',
		signatures: [
			makeSpecial('allrounder_a', 'signature', 'prodigy_cutter', 'Prodigy Cutter', 'signature', 20, 'head',
				'Leaping cutter out of nowhere', {
					windupFrames: 18,
					staminaCost: 12,
					hitbox: { range: 2.5, angle: 60 },
					reversalWindow: 5
				})
		],
		finishers: [
			makeSpecial('allrounder_a', 'finisher', 'prodigy_slam', 'Prodigy Slam', 'finisher', 28, 'body',
				'Spinning uranage slam', {
					windupFrames: 30,
					staminaCost: 16,
					hitbox: { range: 1.5, angle: 360 }
				})
		]
	},

	// ── Iconic WWE Wrestler Movesets ──

	{
		movesetId: 'stone_cold',
		wrestlerName: 'Stone Cold Steve Austin',
		signatures: [
			makeSpecial('stone_cold', 'signature', 'lou_thesz_press', 'Lou Thesz Press', 'signature', 16, 'head',
				'Leaping mounted punches', {
					windupFrames: 21,
					staminaCost: 10,
					hitbox: { range: 3.0, angle: 60 }
				}),
			makeSpecial('stone_cold', 'signature', 'mudhole_stomps', 'Mudhole Stomps', 'signature', 14, 'body',
				'Repeated corner stomps', {
					windupFrames: 18,
					activeFrames: 36,
					staminaCost: 8,
					hitbox: { range: 1.2, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('stone_cold', 'finisher', 'stone_cold_stunner', 'Stone Cold Stunner', 'finisher', 30, 'head',
				'Kick to the gut followed by a sit-out jawbreaker', {
					windupFrames: 24,
					activeFrames: 24,
					staminaCost: 16,
					hitbox: { range: 1.5, angle: 60 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'undertaker',
		wrestlerName: 'The Undertaker',
		signatures: [
			makeSpecial('undertaker', 'signature', 'old_school', 'Old School', 'signature', 16, 'body',
				'Arm twist ropewalk chop from the top rope', {
					category: 'aerial' as MoveCategory,
					windupFrames: 42,
					staminaCost: 12,
					hitbox: { range: 2.0, angle: 60 }
				}),
			makeSpecial('undertaker', 'signature', 'taker_chokeslam', 'Chokeslam', 'signature', 20, 'body',
				'One-handed throat lift into a devastating slam', {
					windupFrames: 36,
					activeFrames: 30,
					staminaCost: 14,
					hitbox: { range: 1.2, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('undertaker', 'finisher', 'tombstone', 'Tombstone Piledriver', 'finisher', 32, 'head',
				'Inverted piledriver dropping the opponent on their head', {
					windupFrames: 48,
					activeFrames: 30,
					staminaCost: 20,
					hitbox: { range: 0.8, angle: 360 },
					reversalWindow: 3
				}),
			makeSpecial('undertaker', 'finisher', 'last_ride', 'Last Ride', 'finisher', 30, 'body',
				'Elevated sit-out powerbomb', {
					windupFrames: 48,
					activeFrames: 36,
					staminaCost: 22,
					hitbox: { range: 0.8, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'randy_orton',
		wrestlerName: 'Randy Orton',
		signatures: [
			makeSpecial('randy_orton', 'signature', 'garvin_stomp', 'Garvin Stomp', 'signature', 14, 'body',
				'Methodical stomps to every limb', {
					windupFrames: 18,
					activeFrames: 36,
					staminaCost: 8,
					hitbox: { range: 1.2, angle: 360 }
				}),
			makeSpecial('randy_orton', 'signature', 'draping_ddt', 'Draping DDT', 'signature', 18, 'head',
				'DDT from the second rope through the ropes', {
					windupFrames: 36,
					staminaCost: 12,
					hitbox: { range: 1.5, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('randy_orton', 'finisher', 'rko', 'RKO', 'finisher', 30, 'head',
				'Jumping three-quarter facelock neckbreaker out of nowhere', {
					windupFrames: 12,
					activeFrames: 18,
					recoveryFrames: 36,
					staminaCost: 14,
					hitbox: { range: 2.5, angle: 60 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'shawn_michaels',
		wrestlerName: 'Shawn Michaels',
		signatures: [
			makeSpecial('shawn_michaels', 'signature', 'flying_forearm', 'Flying Forearm', 'signature', 16, 'head',
				'Leaping forearm smash followed by a kip-up', {
					category: 'aerial' as MoveCategory,
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 3.0, angle: 50 }
				}),
			makeSpecial('shawn_michaels', 'signature', 'hbk_elbow_drop', 'Diving Elbow Drop', 'signature', 18, 'body',
				'Top rope elbow drop with theatrics', {
					category: 'aerial' as MoveCategory,
					windupFrames: 42,
					staminaCost: 14,
					hitbox: { range: 3.0, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('shawn_michaels', 'finisher', 'sweet_chin_music', 'Sweet Chin Music', 'finisher', 30, 'head',
				'Devastating superkick preceded by tuning up the band', {
					windupFrames: 30,
					activeFrames: 9,
					recoveryFrames: 30,
					staminaCost: 14,
					hitbox: { range: 2.5, angle: 30 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'triple_h',
		wrestlerName: 'Triple H',
		signatures: [
			makeSpecial('triple_h', 'signature', 'hhh_spinebuster', 'Spinebuster', 'signature', 18, 'body',
				'Running spinebuster slam', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 2.0, angle: 360 }
				}),
			makeSpecial('triple_h', 'signature', 'hhh_knee_facebuster', 'Knee Facebuster', 'signature', 16, 'head',
				'Running knee to the face of a bent opponent', {
					windupFrames: 21,
					staminaCost: 10,
					hitbox: { range: 2.0, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('triple_h', 'finisher', 'pedigree', 'Pedigree', 'finisher', 30, 'head',
				'Double underhook kneeling facebuster', {
					windupFrames: 36,
					activeFrames: 24,
					staminaCost: 18,
					hitbox: { range: 0.8, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'john_cena',
		wrestlerName: 'John Cena',
		signatures: [
			makeSpecial('john_cena', 'signature', 'five_knuckle_shuffle', 'Five Knuckle Shuffle', 'signature', 16, 'head',
				'Running fist drop with showmanship', {
					windupFrames: 36,
					staminaCost: 10,
					hitbox: { range: 2.0, angle: 60 }
				}),
			makeSpecial('john_cena', 'signature', 'proto_bomb', 'Proto-Bomb', 'signature', 16, 'body',
				'Spinning side slam', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('john_cena', 'finisher', 'attitude_adjustment', 'Attitude Adjustment', 'finisher', 28, 'body',
				"Fireman's carry powerslam", {
					windupFrames: 36,
					activeFrames: 30,
					staminaCost: 18,
					hitbox: { range: 0.8, angle: 360 },
					reversalWindow: 4
				}),
			makeSpecial('john_cena', 'finisher', 'stfu', 'STF-U', 'finisher', 5, 'legs',
				'Modified STF submission hold', {
					category: 'submission' as MoveCategory,
					windupFrames: 30,
					activeFrames: 120,
					recoveryFrames: 24,
					staminaCost: 12,
					hitbox: { range: 1.0, angle: 360 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'brock_lesnar',
		wrestlerName: 'Brock Lesnar',
		signatures: [
			makeSpecial('brock_lesnar', 'signature', 'lesnar_german', 'German Suplex (Suplex City)', 'signature', 18, 'head',
				'Repeated German suplexes with bridge', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 0.8, angle: 360 }
				}),
			makeSpecial('brock_lesnar', 'signature', 'lesnar_belly_to_belly', 'Belly-to-Belly Overhead', 'signature', 16, 'body',
				'Overhead belly-to-belly suplex launching opponent across the ring', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('brock_lesnar', 'finisher', 'f5', 'F-5', 'finisher', 32, 'head',
				"Spinning fireman's carry facebuster", {
					windupFrames: 36,
					activeFrames: 30,
					staminaCost: 18,
					hitbox: { range: 0.8, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'rey_mysterio',
		wrestlerName: 'Rey Mysterio',
		signatures: [
			makeSpecial('rey_mysterio', 'signature', 'seated_senton', 'Seated Senton', 'signature', 14, 'body',
				'Springboard seated senton', {
					category: 'aerial' as MoveCategory,
					windupFrames: 30,
					staminaCost: 10,
					hitbox: { range: 3.5, angle: 60 }
				}),
			makeSpecial('rey_mysterio', 'signature', 'headscissors', 'Headscissors Takedown', 'signature', 14, 'head',
				'Springboard headscissors', {
					category: 'aerial' as MoveCategory,
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 3.0, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('rey_mysterio', 'finisher', 'six_one_nine', '619', 'finisher', 28, 'head',
				'Tiger feint kick through the ropes followed by a splash', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					activeFrames: 18,
					staminaCost: 16,
					hitbox: { range: 4.0, angle: 60 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'roman_reigns',
		wrestlerName: 'Roman Reigns',
		signatures: [
			makeSpecial('roman_reigns', 'signature', 'reigns_superman_punch', 'Superman Punch', 'signature', 18, 'head',
				'Cocked fist leaping punch', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 3.0, angle: 40 }
				}),
			makeSpecial('roman_reigns', 'signature', 'samoan_drop_sig', 'Samoan Drop', 'signature', 16, 'body',
				'Falling fireman carry drop', {
					windupFrames: 30,
					staminaCost: 10,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('roman_reigns', 'finisher', 'reigns_spear', 'Spear', 'finisher', 30, 'body',
				'Devastating running spear to the midsection', {
					windupFrames: 21,
					activeFrames: 15,
					recoveryFrames: 36,
					staminaCost: 16,
					hitbox: { range: 4.0, angle: 45 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'cody_rhodes',
		wrestlerName: 'Cody Rhodes',
		signatures: [
			makeSpecial('cody_rhodes', 'signature', 'cody_cutter', 'Cody Cutter', 'signature', 18, 'head',
				'Springboard cutter', {
					windupFrames: 21,
					staminaCost: 12,
					hitbox: { range: 2.5, angle: 60 }
				}),
			makeSpecial('cody_rhodes', 'signature', 'disaster_kick', 'Disaster Kick', 'signature', 16, 'head',
				'Springboard roundhouse kick', {
					category: 'aerial' as MoveCategory,
					windupFrames: 30,
					staminaCost: 12,
					hitbox: { range: 3.0, angle: 45 }
				})
		],
		finishers: [
			makeSpecial('cody_rhodes', 'finisher', 'cross_rhodes', 'Cross Rhodes', 'finisher', 30, 'head',
				'Rolling cutter dropping opponent face-first', {
					windupFrames: 24,
					activeFrames: 24,
					staminaCost: 16,
					hitbox: { range: 1.5, angle: 60 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'drew_mcintyre',
		wrestlerName: 'Drew McIntyre',
		signatures: [
			makeSpecial('drew_mcintyre', 'signature', 'glasgow_kiss', 'Glasgow Kiss', 'signature', 14, 'head',
				'Running headbutt', {
					windupFrames: 18,
					staminaCost: 8,
					hitbox: { range: 2.5, angle: 50 }
				}),
			makeSpecial('drew_mcintyre', 'signature', 'future_shock_ddt', 'Future Shock DDT', 'signature', 18, 'head',
				'Double arm DDT', {
					windupFrames: 27,
					staminaCost: 12,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('drew_mcintyre', 'finisher', 'claymore', 'Claymore', 'finisher', 30, 'head',
				'Running bicycle kick to the face', {
					windupFrames: 21,
					activeFrames: 12,
					recoveryFrames: 36,
					staminaCost: 16,
					hitbox: { range: 3.5, angle: 40 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'the_rock',
		wrestlerName: 'The Rock',
		signatures: [
			makeSpecial('the_rock', 'signature', 'peoples_elbow', "People's Elbow", 'signature', 18, 'body',
				'Theatrical running elbow drop with crowd showmanship', {
					windupFrames: 48,
					activeFrames: 12,
					staminaCost: 10,
					hitbox: { range: 2.0, angle: 60 }
				}),
			makeSpecial('the_rock', 'signature', 'spine_on_pine', 'Spinebuster', 'signature', 16, 'body',
				'Running spinebuster slam', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 2.0, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('the_rock', 'finisher', 'rock_bottom', 'Rock Bottom', 'finisher', 28, 'body',
				'Uranage side slam', {
					windupFrames: 30,
					activeFrames: 24,
					staminaCost: 16,
					hitbox: { range: 1.0, angle: 360 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'bret_hart',
		wrestlerName: 'Bret Hart',
		signatures: [
			makeSpecial('bret_hart', 'signature', 'hart_backbreaker', 'Backbreaker', 'signature', 14, 'body',
				'Pendulum backbreaker across the knee', {
					windupFrames: 24,
					staminaCost: 8,
					hitbox: { range: 0.8, angle: 360 }
				}),
			makeSpecial('bret_hart', 'signature', 'russian_legsweep', 'Russian Legsweep', 'signature', 12, 'legs',
				'Side sweeping leg trip', {
					windupFrames: 18,
					staminaCost: 8,
					hitbox: { range: 1.5, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('bret_hart', 'finisher', 'hart_sharpshooter', 'Sharpshooter', 'finisher', 5, 'legs',
				'Standing inverted figure-four leglock', {
					category: 'submission' as MoveCategory,
					windupFrames: 30,
					activeFrames: 120,
					recoveryFrames: 30,
					staminaCost: 14,
					hitbox: { range: 1.2, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'kurt_angle',
		wrestlerName: 'Kurt Angle',
		signatures: [
			makeSpecial('kurt_angle', 'signature', 'angle_slam', 'Angle Slam', 'signature', 18, 'body',
				'Overhead belly-to-belly into a slam', {
					windupFrames: 27,
					staminaCost: 12,
					hitbox: { range: 0.8, angle: 360 }
				}),
			makeSpecial('kurt_angle', 'signature', 'triple_german', 'Triple German Suplexes', 'signature', 20, 'head',
				'Three consecutive German suplexes', {
					windupFrames: 24,
					activeFrames: 48,
					staminaCost: 14,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('kurt_angle', 'finisher', 'angle_ankle_lock', 'Ankle Lock', 'finisher', 5, 'legs',
				'Grapevine ankle lock submission', {
					category: 'submission' as MoveCategory,
					windupFrames: 24,
					activeFrames: 120,
					recoveryFrames: 24,
					staminaCost: 14,
					hitbox: { range: 1.2, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'chris_jericho',
		wrestlerName: 'Chris Jericho',
		signatures: [
			makeSpecial('chris_jericho', 'signature', 'lionsault', 'Lionsault', 'signature', 18, 'body',
				'Springboard moonsault', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					staminaCost: 14,
					hitbox: { range: 3.0, angle: 70 }
				}),
			makeSpecial('chris_jericho', 'signature', 'codebreaker', 'Codebreaker', 'signature', 18, 'head',
				'Running double knee facebreaker', {
					windupFrames: 21,
					staminaCost: 12,
					hitbox: { range: 2.0, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('chris_jericho', 'finisher', 'jericho_walls', 'Walls of Jericho', 'finisher', 5, 'legs',
				'Elevated Boston crab submission', {
					category: 'submission' as MoveCategory,
					windupFrames: 36,
					activeFrames: 120,
					recoveryFrames: 30,
					staminaCost: 14,
					hitbox: { range: 1.2, angle: 360 },
					reversalWindow: 3
				}),
			makeSpecial('chris_jericho', 'finisher', 'judas_effect', 'Judas Effect', 'finisher', 28, 'head',
				'Spinning back elbow strike', {
					windupFrames: 24,
					activeFrames: 9,
					recoveryFrames: 30,
					staminaCost: 14,
					hitbox: { range: 2.0, angle: 45 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'charlotte_flair',
		wrestlerName: 'Charlotte Flair',
		signatures: [
			makeSpecial('charlotte_flair', 'signature', 'charlotte_chops', 'Natural Selection', 'signature', 16, 'head',
				'Forward falling neckbreaker', {
					windupFrames: 21,
					staminaCost: 10,
					hitbox: { range: 1.5, angle: 60 }
				}),
			makeSpecial('charlotte_flair', 'signature', 'charlotte_moonsault', 'Moonsault', 'signature', 18, 'body',
				'Standing or top rope moonsault', {
					category: 'aerial' as MoveCategory,
					windupFrames: 42,
					staminaCost: 14,
					hitbox: { range: 3.0, angle: 80 }
				})
		],
		finishers: [
			makeSpecial('charlotte_flair', 'finisher', 'charlotte_figure_eight', 'Figure Eight', 'finisher', 5, 'legs',
				'Bridging figure-four leglock', {
					category: 'submission' as MoveCategory,
					windupFrames: 36,
					activeFrames: 120,
					recoveryFrames: 30,
					staminaCost: 14,
					hitbox: { range: 1.2, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'eddie_guerrero',
		wrestlerName: 'Eddie Guerrero',
		signatures: [
			makeSpecial('eddie_guerrero', 'signature', 'three_amigos', 'Three Amigos', 'signature', 18, 'body',
				'Three consecutive vertical suplexes', {
					windupFrames: 24,
					activeFrames: 48,
					staminaCost: 14,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('eddie_guerrero', 'finisher', 'eddie_frog_splash', 'Frog Splash', 'finisher', 30, 'body',
				'Diving frog splash from the top rope with theatrics', {
					category: 'aerial' as MoveCategory,
					windupFrames: 48,
					activeFrames: 12,
					recoveryFrames: 48,
					staminaCost: 18,
					hitbox: { range: 3.0, angle: 70 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'jeff_hardy',
		wrestlerName: 'Jeff Hardy',
		signatures: [
			makeSpecial('jeff_hardy', 'signature', 'whisper_in_the_wind', 'Whisper in the Wind', 'signature', 16, 'body',
				'Springboard corkscrew senton', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					staminaCost: 14,
					hitbox: { range: 3.5, angle: 70 }
				}),
			makeSpecial('jeff_hardy', 'signature', 'twist_of_fate', 'Twist of Fate', 'signature', 18, 'head',
				'Three-quarter facelock front facebuster', {
					windupFrames: 18,
					staminaCost: 10,
					hitbox: { range: 1.5, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('jeff_hardy', 'finisher', 'swanton', 'Swanton Bomb', 'finisher', 30, 'body',
				'High-angle senton from the top rope', {
					category: 'aerial' as MoveCategory,
					windupFrames: 48,
					activeFrames: 12,
					recoveryFrames: 60,
					staminaCost: 20,
					hitbox: { range: 3.5, angle: 80 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'finn_balor',
		wrestlerName: 'Finn Balor',
		signatures: [
			makeSpecial('finn_balor', 'signature', 'sling_blade', 'Sling Blade', 'signature', 14, 'head',
				'Running forward somersault cutter', {
					windupFrames: 21,
					staminaCost: 10,
					hitbox: { range: 2.5, angle: 60 }
				}),
			makeSpecial('finn_balor', 'signature', 'balor_dropkick', '1916', 'signature', 18, 'head',
				'Lifting single underhook DDT', {
					windupFrames: 30,
					staminaCost: 12,
					hitbox: { range: 0.8, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('finn_balor', 'finisher', 'coup_de_grace', 'Coup de Grace', 'finisher', 30, 'body',
				'Diving double foot stomp to a prone opponent', {
					category: 'aerial' as MoveCategory,
					windupFrames: 42,
					activeFrames: 9,
					recoveryFrames: 42,
					staminaCost: 18,
					hitbox: { range: 2.5, angle: 50 },
					reversalWindow: 4
				})
		]
	},
	{
		movesetId: 'daniel_bryan',
		wrestlerName: 'Daniel Bryan',
		signatures: [
			makeSpecial('daniel_bryan', 'signature', 'yes_kicks', 'Yes! Kicks', 'signature', 16, 'body',
				'Series of rapid shoot kicks to the chest', {
					windupFrames: 12,
					activeFrames: 36,
					staminaCost: 10,
					hitbox: { range: 2.0, angle: 45 }
				}),
			makeSpecial('daniel_bryan', 'signature', 'suicide_dive', 'Suicide Dive', 'signature', 16, 'body',
				'Running through-the-ropes dive', {
					category: 'aerial' as MoveCategory,
					windupFrames: 30,
					staminaCost: 14,
					hitbox: { range: 5.0, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('daniel_bryan', 'finisher', 'yes_lock', 'Yes Lock', 'finisher', 5, 'head',
				'LeBell Lock / Crossface submission', {
					category: 'submission' as MoveCategory,
					windupFrames: 24,
					activeFrames: 120,
					recoveryFrames: 24,
					staminaCost: 14,
					hitbox: { range: 1.0, angle: 360 },
					reversalWindow: 3
				}),
			makeSpecial('daniel_bryan', 'finisher', 'running_knee_finish', 'Running Knee', 'finisher', 28, 'head',
				'Full sprint running knee strike', {
					windupFrames: 24,
					activeFrames: 9,
					recoveryFrames: 30,
					staminaCost: 14,
					hitbox: { range: 3.5, angle: 40 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'sasha_banks',
		wrestlerName: 'Sasha Banks',
		signatures: [
			makeSpecial('sasha_banks', 'signature', 'meteora', 'Meteora', 'signature', 16, 'head',
				'Double knee strike from the ropes', {
					category: 'aerial' as MoveCategory,
					windupFrames: 30,
					staminaCost: 12,
					hitbox: { range: 3.0, angle: 50 }
				}),
			makeSpecial('sasha_banks', 'signature', 'backstabber', 'Backstabber', 'signature', 16, 'body',
				'Double knee backbreaker', {
					windupFrames: 21,
					staminaCost: 10,
					hitbox: { range: 1.5, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('sasha_banks', 'finisher', 'bank_statement_fin', 'Bank Statement', 'finisher', 5, 'head',
				'Crossface bridging straight-jacket submission', {
					category: 'submission' as MoveCategory,
					windupFrames: 30,
					activeFrames: 120,
					recoveryFrames: 24,
					staminaCost: 14,
					hitbox: { range: 1.0, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'kane',
		wrestlerName: 'Kane',
		signatures: [
			makeSpecial('kane', 'signature', 'kane_sidewalk_slam', 'Sidewalk Slam', 'signature', 14, 'body',
				'Running sidewalk slam', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 1.5, angle: 360 }
				}),
			makeSpecial('kane', 'signature', 'kane_big_boot', 'Big Boot', 'signature', 14, 'head',
				'Running big boot to the face', {
					windupFrames: 18,
					staminaCost: 8,
					hitbox: { range: 2.5, angle: 40 }
				})
		],
		finishers: [
			makeSpecial('kane', 'finisher', 'kane_chokeslam', 'Chokeslam', 'finisher', 28, 'body',
				'One-handed throat lift into a devastating slam', {
					windupFrames: 36,
					activeFrames: 30,
					staminaCost: 18,
					hitbox: { range: 1.2, angle: 360 },
					reversalWindow: 3
				}),
			makeSpecial('kane', 'finisher', 'kane_tombstone', 'Tombstone Piledriver', 'finisher', 30, 'head',
				'Inverted piledriver', {
					windupFrames: 48,
					activeFrames: 30,
					staminaCost: 20,
					hitbox: { range: 0.8, angle: 360 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'dudley_boyz',
		wrestlerName: 'The Dudley Boyz',
		signatures: [
			makeSpecial('dudley_boyz', 'signature', 'wazzup_headbutt', 'Wazzup Headbutt', 'signature', 16, 'head',
				'Diving headbutt to the groin area', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					staminaCost: 12,
					hitbox: { range: 2.5, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('dudley_boyz', 'finisher', 'dudley_3d', '3D (Dudley Death Drop)', 'finisher', 30, 'head',
				'Flapjack combined with a cutter', {
					windupFrames: 30,
					activeFrames: 24,
					staminaCost: 16,
					hitbox: { range: 1.5, angle: 60 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'ricochet',
		wrestlerName: 'Ricochet',
		signatures: [
			makeSpecial('ricochet', 'signature', 'recoil', 'Recoil', 'signature', 18, 'head',
				'Standing Spanish Fly into cutter', {
					windupFrames: 21,
					staminaCost: 12,
					hitbox: { range: 2.0, angle: 60 }
				})
		],
		finishers: [
			makeSpecial('ricochet', 'finisher', 'ricochet_630', '630 Senton', 'finisher', 34, 'body',
				'Double front flip senton from the top rope', {
					category: 'aerial' as MoveCategory,
					windupFrames: 54,
					activeFrames: 12,
					recoveryFrames: 66,
					staminaCost: 24,
					hitbox: { range: 3.0, angle: 70 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'road_warriors',
		wrestlerName: 'The Road Warriors',
		signatures: [
			makeSpecial('road_warriors', 'signature', 'warrior_press', 'Military Press Slam', 'signature', 18, 'body',
				'Overhead military press slam', {
					windupFrames: 42,
					staminaCost: 14,
					hitbox: { range: 1.5, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('road_warriors', 'finisher', 'doomsday_device', 'Doomsday Device', 'finisher', 32, 'head',
				'Partner holds opponent on shoulders while other delivers a flying clothesline', {
					windupFrames: 48,
					activeFrames: 18,
					staminaCost: 20,
					hitbox: { range: 3.0, angle: 90 },
					reversalWindow: 3
				})
		]
	},
	{
		movesetId: 'rob_van_dam',
		wrestlerName: 'Rob Van Dam',
		signatures: [
			makeSpecial('rob_van_dam', 'signature', 'rolling_thunder', 'Rolling Thunder', 'signature', 16, 'body',
				'Rolling senton across the ring', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					staminaCost: 12,
					hitbox: { range: 4.0, angle: 90 }
				}),
			makeSpecial('rob_van_dam', 'signature', 'split_legged_moonsault', 'Split-Legged Moonsault', 'signature', 18, 'body',
				'Moonsault with split legs', {
					category: 'aerial' as MoveCategory,
					windupFrames: 42,
					staminaCost: 14,
					hitbox: { range: 3.0, angle: 80 }
				})
		],
		finishers: [
			makeSpecial('rob_van_dam', 'finisher', 'rvd_five_star', 'Five Star Frog Splash', 'finisher', 32, 'body',
				'Top rope frog splash with maximum height and distance', {
					category: 'aerial' as MoveCategory,
					windupFrames: 48,
					activeFrames: 12,
					recoveryFrames: 48,
					staminaCost: 18,
					hitbox: { range: 3.5, angle: 80 },
					reversalWindow: 4
				})
		]
	}
];

/**
 * Central table mapping moveset IDs to their signature and finisher moves.
 *
 * Usage:
 * - Look up a wrestler's special moves by their moveset ID.
 * - Check if a wrestler has enough momentum to attempt their finisher.
 * - Get the full move definition for animation and damage calculation.
 */
export class FinisherTable {
	private movesets: Map<string, MovesetEntry> = new Map();

	constructor(initialMovesets?: MovesetEntry[]) {
		const data = initialMovesets ?? DEFAULT_MOVESETS;
		for (const entry of data) {
			this.movesets.set(entry.movesetId, entry);
		}
	}

	/**
	 * Register a new moveset entry.
	 */
	register(entry: MovesetEntry): void {
		this.movesets.set(entry.movesetId, entry);
	}

	/**
	 * Get the signature move(s) for a moveset.
	 * Returns the first signature if multiple exist.
	 */
	getSignature(movesetId: string): SpecialMoveDef | undefined {
		const entry = this.movesets.get(movesetId);
		return entry?.signatures[0];
	}

	/**
	 * Get all signature moves for a moveset.
	 */
	getAllSignatures(movesetId: string): SpecialMoveDef[] {
		return this.movesets.get(movesetId)?.signatures ?? [];
	}

	/**
	 * Get the finisher move(s) for a moveset.
	 * Returns the first finisher if multiple exist.
	 */
	getFinisher(movesetId: string): SpecialMoveDef | undefined {
		const entry = this.movesets.get(movesetId);
		return entry?.finishers[0];
	}

	/**
	 * Get all finisher moves for a moveset.
	 */
	getAllFinishers(movesetId: string): SpecialMoveDef[] {
		return this.movesets.get(movesetId)?.finishers ?? [];
	}

	/**
	 * Check if a wrestler can attempt their finisher based on current momentum.
	 *
	 * @param momentum - Current momentum value (0-100).
	 * @param threshold - Minimum momentum required. Default 80 (matching Momentum component).
	 * @returns True if momentum meets or exceeds the threshold.
	 */
	canAttemptFinisher(momentum: number, threshold: number = 80): boolean {
		return momentum >= threshold;
	}

	/**
	 * Get the full moveset entry (signatures + finishers).
	 */
	getMoveset(movesetId: string): MovesetEntry | undefined {
		return this.movesets.get(movesetId);
	}

	/**
	 * Check if a moveset ID is registered.
	 */
	has(movesetId: string): boolean {
		return this.movesets.has(movesetId);
	}

	/**
	 * Get all registered moveset IDs.
	 */
	getAllMovesetIds(): string[] {
		return Array.from(this.movesets.keys());
	}

	/**
	 * Get the total number of registered movesets.
	 */
	get size(): number {
		return this.movesets.size;
	}

	/**
	 * Load movesets from external JSON data.
	 */
	loadFromJSON(data: unknown[]): number {
		let loaded = 0;
		for (const entry of data) {
			if (this.isValidMovesetEntry(entry)) {
				this.register(entry as MovesetEntry);
				loaded++;
			}
		}
		return loaded;
	}

	/**
	 * Basic validation for moveset entries from external sources.
	 */
	private isValidMovesetEntry(data: unknown): boolean {
		if (typeof data !== 'object' || data === null) return false;
		const obj = data as Record<string, unknown>;
		return (
			typeof obj.movesetId === 'string' &&
			typeof obj.wrestlerName === 'string' &&
			Array.isArray(obj.signatures) &&
			Array.isArray(obj.finishers)
		);
	}
}
