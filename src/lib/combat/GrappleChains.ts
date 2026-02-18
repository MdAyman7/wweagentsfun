import type { GrapplePosition } from '../components/combat/GrappleState';

/**
 * A move available from a specific grapple position.
 */
export interface GrappleMoveDef {
	/** Move ID (must match an entry in MoveRegistry). */
	moveId: string;
	/** Human-readable name for display. */
	name: string;
	/** Stamina cost to execute from this position. */
	staminaCost: number;
	/** Whether executing this move ends the grapple. */
	endsGrapple: boolean;
	/** Required minimum momentum to use this move (0 = no requirement). */
	momentumRequired: number;
}

/**
 * A transition from one grapple position to another.
 */
export interface GrappleTransition {
	/** Target position after the transition. */
	targetPosition: GrapplePosition;
	/** Human-readable name. */
	name: string;
	/** Stamina cost to execute the transition. */
	staminaCost: number;
	/** Frame duration of the transition animation. */
	transitionFrames: number;
	/** Whether this transition can be reversed by the opponent. */
	canBeReversed: boolean;
}

/**
 * Complete grapple position data: available moves and transitions.
 */
export interface GrapplePositionData {
	position: GrapplePosition;
	/** Moves that can be executed from this position. */
	moves: GrappleMoveDef[];
	/** Transitions to other grapple positions. */
	transitions: GrappleTransition[];
}

/**
 * Full grapple chain definitions.
 * Maps each GrapplePosition to its available moves and transitions.
 */
const GRAPPLE_CHAINS: Record<GrapplePosition, GrapplePositionData> = {
	neutral: {
		position: 'neutral',
		moves: [
			{ moveId: 'jab', name: 'Collar Elbow Strike', staminaCost: 3, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'kick', name: 'Knee Strike', staminaCost: 4, endsGrapple: true, momentumRequired: 0 }
		],
		transitions: [
			{
				targetPosition: 'front_facelock',
				name: 'Transition to Front Facelock',
				staminaCost: 4,
				transitionFrames: 8,
				canBeReversed: true
			},
			{
				targetPosition: 'side_headlock',
				name: 'Transition to Side Headlock',
				staminaCost: 3,
				transitionFrames: 6,
				canBeReversed: true
			},
			{
				targetPosition: 'rear_waistlock',
				name: 'Go Behind',
				staminaCost: 5,
				transitionFrames: 10,
				canBeReversed: true
			}
		]
	},

	front_facelock: {
		position: 'front_facelock',
		moves: [
			{ moveId: 'ddt', name: 'DDT', staminaCost: 8, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'snap_suplex', name: 'Snap Suplex', staminaCost: 8, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'neckbreaker', name: 'Neckbreaker', staminaCost: 7, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'vertical_suplex', name: 'Vertical Suplex', staminaCost: 10, endsGrapple: true, momentumRequired: 10 },
			{ moveId: 'piledriver', name: 'Piledriver', staminaCost: 14, endsGrapple: true, momentumRequired: 30 },
			{ moveId: 'sleeper_hold', name: 'Sleeper Hold', staminaCost: 4, endsGrapple: false, momentumRequired: 0 }
		],
		transitions: [
			{
				targetPosition: 'rear_waistlock',
				name: 'Spin Behind',
				staminaCost: 4,
				transitionFrames: 8,
				canBeReversed: true
			},
			{
				targetPosition: 'side_headlock',
				name: 'Transition to Side Headlock',
				staminaCost: 3,
				transitionFrames: 6,
				canBeReversed: true
			},
			{
				targetPosition: 'corner',
				name: 'Push to Corner',
				staminaCost: 5,
				transitionFrames: 12,
				canBeReversed: true
			}
		]
	},

	rear_waistlock: {
		position: 'rear_waistlock',
		moves: [
			{ moveId: 'german_suplex', name: 'German Suplex', staminaCost: 12, endsGrapple: true, momentumRequired: 10 },
			{ moveId: 'backbreaker', name: 'Backbreaker', staminaCost: 8, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'body_slam', name: 'Back Body Drop', staminaCost: 8, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'powerbomb', name: 'Powerbomb', staminaCost: 14, endsGrapple: true, momentumRequired: 30 }
		],
		transitions: [
			{
				targetPosition: 'front_facelock',
				name: 'Turn Around',
				staminaCost: 5,
				transitionFrames: 10,
				canBeReversed: true
			},
			{
				targetPosition: 'side_headlock',
				name: 'Side Control',
				staminaCost: 4,
				transitionFrames: 8,
				canBeReversed: true
			}
		]
	},

	side_headlock: {
		position: 'side_headlock',
		moves: [
			{ moveId: 'headlock_takeover', name: 'Headlock Takeover', staminaCost: 6, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'neckbreaker', name: 'Side Neckbreaker', staminaCost: 7, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'ddt', name: 'Side DDT', staminaCost: 8, endsGrapple: true, momentumRequired: 10 },
			{ moveId: 'crossface', name: 'Crossface', staminaCost: 7, endsGrapple: false, momentumRequired: 0 }
		],
		transitions: [
			{
				targetPosition: 'front_facelock',
				name: 'Front Facelock',
				staminaCost: 3,
				transitionFrames: 6,
				canBeReversed: true
			},
			{
				targetPosition: 'rear_waistlock',
				name: 'Go Behind',
				staminaCost: 5,
				transitionFrames: 10,
				canBeReversed: true
			}
		]
	},

	corner: {
		position: 'corner',
		moves: [
			{ moveId: 'chop', name: 'Corner Chop', staminaCost: 4, endsGrapple: false, momentumRequired: 0 },
			{ moveId: 'forearm_smash', name: 'Corner Forearm', staminaCost: 5, endsGrapple: false, momentumRequired: 0 },
			{ moveId: 'clothesline', name: 'Corner Clothesline', staminaCost: 6, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'superkick', name: 'Corner Superkick', staminaCost: 10, endsGrapple: true, momentumRequired: 20 }
		],
		transitions: [
			{
				targetPosition: 'top_rope',
				name: 'Climb Turnbuckle',
				staminaCost: 6,
				transitionFrames: 18,
				canBeReversed: true
			},
			{
				targetPosition: 'front_facelock',
				name: 'Pull from Corner',
				staminaCost: 4,
				transitionFrames: 8,
				canBeReversed: true
			}
		]
	},

	top_rope: {
		position: 'top_rope',
		moves: [
			{ moveId: 'diving_crossbody', name: 'Diving Crossbody', staminaCost: 12, endsGrapple: true, momentumRequired: 0 },
			{ moveId: 'missile_dropkick', name: 'Missile Dropkick', staminaCost: 14, endsGrapple: true, momentumRequired: 10 },
			{ moveId: 'moonsault', name: 'Moonsault', staminaCost: 16, endsGrapple: true, momentumRequired: 20 },
			{ moveId: 'frog_splash', name: 'Frog Splash', staminaCost: 14, endsGrapple: true, momentumRequired: 15 },
			{ moveId: 'elbow_drop_top', name: 'Top Rope Elbow Drop', staminaCost: 10, endsGrapple: true, momentumRequired: 0 }
		],
		transitions: [
			{
				targetPosition: 'corner',
				name: 'Climb Down',
				staminaCost: 2,
				transitionFrames: 10,
				canBeReversed: false
			}
		]
	}
};

/**
 * Get all moves available from a specific grapple position.
 *
 * @param position - The current grapple position.
 * @returns Array of GrappleMoveDef available from this position.
 */
export function getAvailableMoves(position: GrapplePosition): GrappleMoveDef[] {
	return GRAPPLE_CHAINS[position]?.moves ?? [];
}

/**
 * Get all transitions available from a specific grapple position.
 *
 * @param position - The current grapple position.
 * @returns Array of GrappleTransition from this position.
 */
export function getTransitions(position: GrapplePosition): GrappleTransition[] {
	return GRAPPLE_CHAINS[position]?.transitions ?? [];
}

/**
 * Get the full position data (moves + transitions).
 *
 * @param position - The grapple position to query.
 * @returns GrapplePositionData or undefined if position is invalid.
 */
export function getPositionData(position: GrapplePosition): GrapplePositionData | undefined {
	return GRAPPLE_CHAINS[position];
}

/**
 * Get moves available from a position, filtered by minimum stamina and momentum.
 *
 * @param position - The current grapple position.
 * @param currentStamina - The grappler's current stamina.
 * @param currentMomentum - The grappler's current momentum.
 * @returns Filtered array of moves the grappler can actually execute.
 */
export function getAffordableMoves(
	position: GrapplePosition,
	currentStamina: number,
	currentMomentum: number
): GrappleMoveDef[] {
	return getAvailableMoves(position).filter(
		(m) => m.staminaCost <= currentStamina && m.momentumRequired <= currentMomentum
	);
}

/**
 * Get transitions available from a position, filtered by stamina.
 *
 * @param position - The current grapple position.
 * @param currentStamina - The grappler's current stamina.
 * @returns Filtered array of transitions the grappler can afford.
 */
export function getAffordableTransitions(
	position: GrapplePosition,
	currentStamina: number
): GrappleTransition[] {
	return getTransitions(position).filter((t) => t.staminaCost <= currentStamina);
}

/**
 * Get all valid grapple positions.
 */
export function getAllPositions(): GrapplePosition[] {
	return Object.keys(GRAPPLE_CHAINS) as GrapplePosition[];
}
