import { clamp, remap } from '../../utils/math';

/**
 * Layout descriptor for a single observation dimension.
 */
export interface ObservationDimension {
	/** Human-readable label for this observation channel. */
	label: string;
	/** Index in the flat observation vector. */
	index: number;
	/** Raw value minimum (before normalization). */
	rawMin: number;
	/** Raw value maximum (before normalization). */
	rawMax: number;
}

/**
 * Raw component data gathered before building the observation vector.
 * Each field is optional because not all data may be available.
 */
export interface RawObservationData {
	// Self state
	selfHealth?: number;
	selfHealthMax?: number;
	selfStamina?: number;
	selfStaminaMax?: number;
	selfMomentum?: number;
	selfMomentumMax?: number;
	selfPositionX?: number;
	selfPositionY?: number;
	selfBlocking?: boolean;
	selfInGrapple?: boolean;
	selfGrapplePosition?: string;
	selfPhysicalFatigue?: number;
	selfMentalFatigue?: number;
	selfCombatPhase?: string;

	// Self damage regions
	selfHeadDamage?: number;
	selfBodyDamage?: number;
	selfLegsDamage?: number;

	// Opponent state
	opponentHealth?: number;
	opponentHealthMax?: number;
	opponentStamina?: number;
	opponentStaminaMax?: number;
	opponentMomentum?: number;
	opponentMomentumMax?: number;
	opponentPositionX?: number;
	opponentPositionY?: number;
	opponentBlocking?: boolean;
	opponentInGrapple?: boolean;
	opponentCombatPhase?: string;

	// Opponent damage regions
	opponentHeadDamage?: number;
	opponentBodyDamage?: number;
	opponentLegsDamage?: number;

	// Match state
	distanceToOpponent?: number;
	crowdPop?: number;
	crowdHeat?: number;
	matchTension?: number;
	nearFallCount?: number;
	matchRating?: number;
	comebackEligible?: boolean;
	counterSuccessRate?: number;

	// Spatial
	nearRopes?: boolean;
	nearCorner?: boolean;
	inRing?: boolean;
}

/**
 * Full layout of the observation vector.
 * Indices 0-44 are defined below. The layout is fixed so that
 * RL policies trained on one version remain compatible.
 */
export const OBSERVATION_LAYOUT: ObservationDimension[] = [
	// Self state (0-8)
	{ label: 'self_health_pct', index: 0, rawMin: 0, rawMax: 1 },
	{ label: 'self_stamina_pct', index: 1, rawMin: 0, rawMax: 1 },
	{ label: 'self_momentum_pct', index: 2, rawMin: 0, rawMax: 1 },
	{ label: 'self_position_x', index: 3, rawMin: -20, rawMax: 20 },
	{ label: 'self_position_y', index: 4, rawMin: -20, rawMax: 20 },
	{ label: 'self_blocking', index: 5, rawMin: 0, rawMax: 1 },
	{ label: 'self_in_grapple', index: 6, rawMin: 0, rawMax: 1 },
	{ label: 'self_physical_fatigue', index: 7, rawMin: 0, rawMax: 100 },
	{ label: 'self_mental_fatigue', index: 8, rawMin: 0, rawMax: 100 },

	// Self damage regions (9-11)
	{ label: 'self_head_damage', index: 9, rawMin: 0, rawMax: 100 },
	{ label: 'self_body_damage', index: 10, rawMin: 0, rawMax: 100 },
	{ label: 'self_legs_damage', index: 11, rawMin: 0, rawMax: 100 },

	// Self combat phase one-hot (12-17)
	{ label: 'self_phase_idle', index: 12, rawMin: 0, rawMax: 1 },
	{ label: 'self_phase_windup', index: 13, rawMin: 0, rawMax: 1 },
	{ label: 'self_phase_active', index: 14, rawMin: 0, rawMax: 1 },
	{ label: 'self_phase_recovery', index: 15, rawMin: 0, rawMax: 1 },
	{ label: 'self_phase_stun', index: 16, rawMin: 0, rawMax: 1 },
	{ label: 'self_phase_grounded', index: 17, rawMin: 0, rawMax: 1 },

	// Opponent state (18-26)
	{ label: 'opp_health_pct', index: 18, rawMin: 0, rawMax: 1 },
	{ label: 'opp_stamina_pct', index: 19, rawMin: 0, rawMax: 1 },
	{ label: 'opp_momentum_pct', index: 20, rawMin: 0, rawMax: 1 },
	{ label: 'opp_position_x', index: 21, rawMin: -20, rawMax: 20 },
	{ label: 'opp_position_y', index: 22, rawMin: -20, rawMax: 20 },
	{ label: 'opp_blocking', index: 23, rawMin: 0, rawMax: 1 },
	{ label: 'opp_in_grapple', index: 24, rawMin: 0, rawMax: 1 },
	{ label: 'opp_phase_idle', index: 25, rawMin: 0, rawMax: 1 },
	{ label: 'opp_phase_stun', index: 26, rawMin: 0, rawMax: 1 },

	// Opponent damage regions (27-29)
	{ label: 'opp_head_damage', index: 27, rawMin: 0, rawMax: 100 },
	{ label: 'opp_body_damage', index: 28, rawMin: 0, rawMax: 100 },
	{ label: 'opp_legs_damage', index: 29, rawMin: 0, rawMax: 100 },

	// Relational / match state (30-39)
	{ label: 'distance_to_opponent', index: 30, rawMin: 0, rawMax: 30 },
	{ label: 'crowd_pop', index: 31, rawMin: 0, rawMax: 100 },
	{ label: 'crowd_heat', index: 32, rawMin: -100, rawMax: 100 },
	{ label: 'match_tension', index: 33, rawMin: 0, rawMax: 1 },
	{ label: 'near_fall_count', index: 34, rawMin: 0, rawMax: 10 },
	{ label: 'match_rating', index: 35, rawMin: 0, rawMax: 5 },
	{ label: 'comeback_eligible', index: 36, rawMin: 0, rawMax: 1 },
	{ label: 'counter_success_rate', index: 37, rawMin: 0, rawMax: 1 },

	// Spatial flags (38-40)
	{ label: 'near_ropes', index: 38, rawMin: 0, rawMax: 1 },
	{ label: 'near_corner', index: 39, rawMin: 0, rawMax: 1 },
	{ label: 'in_ring', index: 40, rawMin: 0, rawMax: 1 },

	// Grapple position one-hot (41-45)
	{ label: 'grapple_neutral', index: 41, rawMin: 0, rawMax: 1 },
	{ label: 'grapple_front_facelock', index: 42, rawMin: 0, rawMax: 1 },
	{ label: 'grapple_rear_waistlock', index: 43, rawMin: 0, rawMax: 1 },
	{ label: 'grapple_side_headlock', index: 44, rawMin: 0, rawMax: 1 },
	{ label: 'grapple_corner', index: 45, rawMin: 0, rawMax: 1 }
];

/** Total size of the observation vector. */
export const OBSERVATION_SIZE = OBSERVATION_LAYOUT.length;

/** Labels array matching the vector layout. */
export const OBSERVATION_LABELS: string[] = OBSERVATION_LAYOUT.map((d) => d.label);

/**
 * Encode a combat phase string as a one-hot set of values.
 */
function encodeCombatPhase(phase: string | undefined): number[] {
	const phases = ['idle', 'windup', 'active', 'recovery', 'stun', 'grounded'];
	return phases.map((p) => (phase === p ? 1 : 0));
}

/**
 * Encode a grapple position as a one-hot set of values.
 */
function encodeGrapplePosition(position: string | undefined): number[] {
	const positions = ['neutral', 'front_facelock', 'rear_waistlock', 'side_headlock', 'corner'];
	return positions.map((p) => (position === p ? 1 : 0));
}

/**
 * Build a normalized observation vector from raw component data.
 * All values are normalized to [0, 1] based on the layout ranges.
 *
 * @param raw - Raw data from ECS components.
 * @returns A Float32-compatible array of normalized values.
 */
export function buildObservationVector(raw: RawObservationData): number[] {
	const vec = new Array<number>(OBSERVATION_SIZE).fill(0);

	// Self state
	vec[0] = clamp((raw.selfHealth ?? 0) / (raw.selfHealthMax || 100), 0, 1);
	vec[1] = clamp((raw.selfStamina ?? 0) / (raw.selfStaminaMax || 100), 0, 1);
	vec[2] = clamp((raw.selfMomentum ?? 0) / (raw.selfMomentumMax || 100), 0, 1);
	vec[3] = remap(raw.selfPositionX ?? 0, -20, 20, 0, 1);
	vec[4] = remap(raw.selfPositionY ?? 0, -20, 20, 0, 1);
	vec[5] = raw.selfBlocking ? 1 : 0;
	vec[6] = raw.selfInGrapple ? 1 : 0;
	vec[7] = remap(raw.selfPhysicalFatigue ?? 0, 0, 100, 0, 1);
	vec[8] = remap(raw.selfMentalFatigue ?? 0, 0, 100, 0, 1);

	// Self damage regions
	vec[9] = remap(raw.selfHeadDamage ?? 0, 0, 100, 0, 1);
	vec[10] = remap(raw.selfBodyDamage ?? 0, 0, 100, 0, 1);
	vec[11] = remap(raw.selfLegsDamage ?? 0, 0, 100, 0, 1);

	// Self combat phase (one-hot, indices 12-17)
	const selfPhase = encodeCombatPhase(raw.selfCombatPhase);
	for (let i = 0; i < selfPhase.length; i++) {
		vec[12 + i] = selfPhase[i];
	}

	// Opponent state
	vec[18] = clamp((raw.opponentHealth ?? 0) / (raw.opponentHealthMax || 100), 0, 1);
	vec[19] = clamp((raw.opponentStamina ?? 0) / (raw.opponentStaminaMax || 100), 0, 1);
	vec[20] = clamp((raw.opponentMomentum ?? 0) / (raw.opponentMomentumMax || 100), 0, 1);
	vec[21] = remap(raw.opponentPositionX ?? 0, -20, 20, 0, 1);
	vec[22] = remap(raw.opponentPositionY ?? 0, -20, 20, 0, 1);
	vec[23] = raw.opponentBlocking ? 1 : 0;
	vec[24] = raw.opponentInGrapple ? 1 : 0;
	// Opponent phase (simplified to idle / stun)
	vec[25] = raw.opponentCombatPhase === 'idle' ? 1 : 0;
	vec[26] = raw.opponentCombatPhase === 'stun' ? 1 : 0;

	// Opponent damage regions
	vec[27] = remap(raw.opponentHeadDamage ?? 0, 0, 100, 0, 1);
	vec[28] = remap(raw.opponentBodyDamage ?? 0, 0, 100, 0, 1);
	vec[29] = remap(raw.opponentLegsDamage ?? 0, 0, 100, 0, 1);

	// Relational / match state
	vec[30] = remap(raw.distanceToOpponent ?? 0, 0, 30, 0, 1);
	vec[31] = remap(raw.crowdPop ?? 50, 0, 100, 0, 1);
	vec[32] = remap(raw.crowdHeat ?? 0, -100, 100, 0, 1);
	vec[33] = clamp(raw.matchTension ?? 0, 0, 1);
	vec[34] = remap(raw.nearFallCount ?? 0, 0, 10, 0, 1);
	vec[35] = remap(raw.matchRating ?? 0, 0, 5, 0, 1);
	vec[36] = raw.comebackEligible ? 1 : 0;
	vec[37] = clamp(raw.counterSuccessRate ?? 0, 0, 1);

	// Spatial flags
	vec[38] = raw.nearRopes ? 1 : 0;
	vec[39] = raw.nearCorner ? 1 : 0;
	vec[40] = raw.inRing !== false ? 1 : 0; // default to in-ring

	// Grapple position (one-hot, indices 41-45)
	const grapPos = encodeGrapplePosition(raw.selfGrapplePosition);
	for (let i = 0; i < grapPos.length; i++) {
		vec[41 + i] = grapPos[i];
	}

	return vec;
}

/**
 * Get the human-readable label for a given observation index.
 */
export function getObservationLabel(index: number): string {
	return OBSERVATION_LAYOUT[index]?.label ?? `unknown_${index}`;
}
