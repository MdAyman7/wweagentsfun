import type { AgentObservation } from '../../components/agent/AgentObservation';
import type { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';
import type { ActionResult, Strategy } from '../Strategy';
import {
	type PersonalityWeights,
	applyPersonalityBias,
	createBalancedWeights
} from '../personality/PersonalityProfile';
import { ACTION_CATEGORIES, type ActionName } from '../rl/ActionSpace';

// ── Observation indices (matching ObservationSpace layout) ──
const OBS = {
	SELF_HEALTH: 0,
	SELF_STAMINA: 1,
	SELF_MOMENTUM: 2,
	SELF_IN_GRAPPLE: 6,
	SELF_FATIGUE: 7,
	SELF_PHASE_IDLE: 12,
	OPP_HEALTH: 18,
	OPP_STAMINA: 19,
	OPP_MOMENTUM: 20,
	OPP_BLOCKING: 23,
	OPP_PHASE_STUN: 26,
	OPP_HEAD_DAMAGE: 27,
	OPP_BODY_DAMAGE: 28,
	OPP_LEGS_DAMAGE: 29,
	DISTANCE: 30,
	CROWD_POP: 31,
	MATCH_TENSION: 33,
	NEAR_FALL_COUNT: 34,
	COMEBACK_ELIGIBLE: 36,
	NEAR_CORNER: 39,
	GRAPPLE_FRONT: 42,
	GRAPPLE_REAR: 43
} as const;

/**
 * Scoring function type: takes the observation vector and returns a utility score in [0, 1].
 */
export type ScoringFunction = (obs: number[]) => number;

/**
 * An action candidate with its scoring function.
 */
export interface UtilityAction {
	action: ActionName;
	category: string;
	scoreFn: ScoringFunction;
}

/**
 * Build the default set of utility-scored actions.
 * Each action has a scoring function that evaluates how desirable it is
 * given the current observation state.
 */
export function buildDefaultActions(): UtilityAction[] {
	return [
		{
			action: 'idle',
			category: ACTION_CATEGORIES['idle'],
			scoreFn: (obs) => {
				// Idle when exhausted or need to recover stamina
				const staminaUrgency = 1 - obs[OBS.SELF_STAMINA];
				const notInDanger = obs[OBS.SELF_HEALTH] > 0.5 ? 0.1 : 0;
				return clamp(staminaUrgency * 0.3 + notInDanger, 0, 0.4);
			}
		},
		{
			action: 'light_strike',
			category: ACTION_CATEGORIES['light_strike'],
			scoreFn: (obs) => {
				const inRange = obs[OBS.DISTANCE] < 0.3 ? 0.5 : 0.1;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.15 ? 0.2 : 0;
				const oppNotBlocking = obs[OBS.OPP_BLOCKING] < 0.5 ? 0.15 : 0;
				return clamp(inRange + hasStamina + oppNotBlocking, 0, 1);
			}
		},
		{
			action: 'heavy_strike',
			category: ACTION_CATEGORIES['heavy_strike'],
			scoreFn: (obs) => {
				const inRange = obs[OBS.DISTANCE] < 0.25 ? 0.4 : 0.05;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.35 ? 0.2 : 0;
				const oppStunned = obs[OBS.OPP_PHASE_STUN] > 0.5 ? 0.25 : 0;
				const oppNotBlocking = obs[OBS.OPP_BLOCKING] < 0.5 ? 0.1 : 0;
				return clamp(inRange + hasStamina + oppStunned + oppNotBlocking, 0, 1);
			}
		},
		{
			action: 'grapple_initiate',
			category: ACTION_CATEGORIES['grapple_initiate'],
			scoreFn: (obs) => {
				const inRange = obs[OBS.DISTANCE] < 0.2 ? 0.4 : 0;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.3 ? 0.2 : 0;
				const oppNotBlocking = obs[OBS.OPP_BLOCKING] < 0.5 ? 0.15 : 0;
				const notInGrapple = obs[OBS.SELF_IN_GRAPPLE] < 0.5 ? 0.1 : 0;
				return clamp(inRange + hasStamina + oppNotBlocking + notInGrapple, 0, 1);
			}
		},
		{
			action: 'front_grapple_move',
			category: ACTION_CATEGORIES['front_grapple_move'],
			scoreFn: (obs) => {
				const inGrapple = obs[OBS.SELF_IN_GRAPPLE] > 0.5 ? 0.5 : 0;
				const frontPos = obs[OBS.GRAPPLE_FRONT] > 0.5 ? 0.3 : 0;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.2 ? 0.15 : 0;
				return clamp(inGrapple + frontPos + hasStamina, 0, 1);
			}
		},
		{
			action: 'rear_grapple_move',
			category: ACTION_CATEGORIES['rear_grapple_move'],
			scoreFn: (obs) => {
				const inGrapple = obs[OBS.SELF_IN_GRAPPLE] > 0.5 ? 0.5 : 0;
				const rearPos = obs[OBS.GRAPPLE_REAR] > 0.5 ? 0.3 : 0;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.2 ? 0.15 : 0;
				return clamp(inGrapple + rearPos + hasStamina, 0, 1);
			}
		},
		{
			action: 'aerial_move',
			category: ACTION_CATEGORIES['aerial_move'],
			scoreFn: (obs) => {
				const nearCorner = obs[OBS.NEAR_CORNER] > 0.5 ? 0.35 : 0.05;
				const oppStunned = obs[OBS.OPP_PHASE_STUN] > 0.5 ? 0.25 : 0;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.4 ? 0.15 : 0;
				const crowdWants = obs[OBS.CROWD_POP] > 0.6 ? 0.1 : 0;
				return clamp(nearCorner + oppStunned + hasStamina + crowdWants, 0, 1);
			}
		},
		{
			action: 'pin_attempt',
			category: ACTION_CATEGORIES['pin_attempt'],
			scoreFn: (obs) => {
				const oppWeak = (1 - obs[OBS.OPP_HEALTH]) * 0.5;
				const oppStunned = obs[OBS.OPP_PHASE_STUN] > 0.5 ? 0.25 : 0;
				const close = obs[OBS.DISTANCE] < 0.2 ? 0.15 : 0;
				const tension = obs[OBS.MATCH_TENSION] * 0.1;
				return clamp(oppWeak + oppStunned + close + tension, 0, 1);
			}
		},
		{
			action: 'submission',
			category: ACTION_CATEGORIES['submission'],
			scoreFn: (obs) => {
				// Submission is better when limbs are damaged
				const limbDamage = Math.max(
					obs[OBS.OPP_HEAD_DAMAGE],
					obs[OBS.OPP_BODY_DAMAGE],
					obs[OBS.OPP_LEGS_DAMAGE]
				);
				const oppStamina = 1 - obs[OBS.OPP_STAMINA];
				const close = obs[OBS.DISTANCE] < 0.2 ? 0.15 : 0;
				return clamp(limbDamage * 0.4 + oppStamina * 0.3 + close, 0, 1);
			}
		},
		{
			action: 'block',
			category: ACTION_CATEGORIES['block'],
			scoreFn: (obs) => {
				const selfLowHealth = (1 - obs[OBS.SELF_HEALTH]) * 0.3;
				const oppHasMomentum = obs[OBS.OPP_MOMENTUM] * 0.25;
				const oppClose = obs[OBS.DISTANCE] < 0.25 ? 0.2 : 0;
				const selfIdle = obs[OBS.SELF_PHASE_IDLE] > 0.5 ? 0.1 : 0;
				return clamp(selfLowHealth + oppHasMomentum + oppClose + selfIdle, 0, 1);
			}
		},
		{
			action: 'dodge',
			category: ACTION_CATEGORIES['dodge'],
			scoreFn: (obs) => {
				const oppHasMomentum = obs[OBS.OPP_MOMENTUM] * 0.2;
				const selfLowStamina = (1 - obs[OBS.SELF_STAMINA]) * 0.15;
				const selfIdle = obs[OBS.SELF_PHASE_IDLE] > 0.5 ? 0.15 : 0;
				return clamp(oppHasMomentum + selfLowStamina + selfIdle, 0, 0.7);
			}
		},
		{
			action: 'taunt',
			category: ACTION_CATEGORIES['taunt'],
			scoreFn: (obs) => {
				const crowdPop = obs[OBS.CROWD_POP] * 0.2;
				const selfHealthy = obs[OBS.SELF_HEALTH] > 0.6 ? 0.15 : 0;
				const oppWeak = (1 - obs[OBS.OPP_HEALTH]) * 0.15;
				const notDanger = obs[OBS.OPP_MOMENTUM] < 0.4 ? 0.1 : 0;
				return clamp(crowdPop + selfHealthy + oppWeak + notDanger, 0, 0.65);
			}
		},
		{
			action: 'run_ropes',
			category: ACTION_CATEGORIES['run_ropes'],
			scoreFn: (obs) => {
				const farAway = obs[OBS.DISTANCE] > 0.5 ? 0.4 : 0.05;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.3 ? 0.2 : 0;
				const momentumBuild = (1 - obs[OBS.SELF_MOMENTUM]) * 0.15;
				return clamp(farAway + hasStamina + momentumBuild, 0, 1);
			}
		},
		{
			action: 'irish_whip',
			category: ACTION_CATEGORIES['irish_whip'],
			scoreFn: (obs) => {
				const close = obs[OBS.DISTANCE] < 0.2 ? 0.3 : 0;
				const hasStamina = obs[OBS.SELF_STAMINA] > 0.25 ? 0.15 : 0;
				const setupValue = obs[OBS.NEAR_CORNER] < 0.5 ? 0.15 : 0.05;
				return clamp(close + hasStamina + setupValue, 0, 0.75);
			}
		},
		{
			action: 'signature_move',
			category: ACTION_CATEGORIES['signature_move'],
			scoreFn: (obs) => {
				const momentum = obs[OBS.SELF_MOMENTUM] > 0.5 ? 0.3 : 0;
				const oppWeakened = (1 - obs[OBS.OPP_HEALTH]) * 0.25;
				const close = obs[OBS.DISTANCE] < 0.3 ? 0.2 : 0;
				const tension = obs[OBS.MATCH_TENSION] * 0.15;
				return clamp(momentum + oppWeakened + close + tension, 0, 1);
			}
		},
		{
			action: 'finisher',
			category: ACTION_CATEGORIES['finisher'],
			scoreFn: (obs) => {
				const highMomentum = obs[OBS.SELF_MOMENTUM] > 0.8 ? 0.4 : 0;
				const oppVeryWeak = obs[OBS.OPP_HEALTH] < 0.3 ? 0.3 : 0;
				const close = obs[OBS.DISTANCE] < 0.25 ? 0.2 : 0;
				const dramaticMoment = obs[OBS.MATCH_TENSION] > 0.7 ? 0.1 : 0;
				return clamp(highMomentum + oppVeryWeak + close + dramaticMoment, 0, 1);
			}
		}
	];
}

/**
 * UtilityAIStrategy: scores all possible actions and picks the highest.
 *
 * Each action has a scoring function that returns a base utility in [0, 1].
 * Personality weights bias the scores toward the wrestler's style.
 * A small random perturbation prevents deterministic play.
 */
export class UtilityAIStrategy implements Strategy {
	readonly id = 'utility_ai';
	private readonly actions: UtilityAction[];
	private readonly personality: PersonalityWeights;
	private readonly biasStrength: number;
	/** Small noise factor to prevent ties and add variety (0 = deterministic). */
	private readonly noiseFactor: number;

	/**
	 * @param personality - Personality weights to bias scoring. Defaults to balanced.
	 * @param actions - Custom action definitions. Defaults to buildDefaultActions().
	 * @param biasStrength - How strongly personality affects scores. Default 0.5.
	 * @param noiseFactor - Random noise magnitude. Default 0.05.
	 */
	constructor(
		personality?: PersonalityWeights,
		actions?: UtilityAction[],
		biasStrength: number = 0.5,
		noiseFactor: number = 0.05
	) {
		this.personality = personality ?? createBalancedWeights();
		this.actions = actions ?? buildDefaultActions();
		this.biasStrength = biasStrength;
		this.noiseFactor = noiseFactor;
	}

	decide(observation: AgentObservation, random: SeededRandom): ActionResult {
		const vec = observation.vector;

		// Score each action
		const baseScores = this.actions.map((ua) => ({
			action: ua.action,
			category: ua.category,
			score: ua.scoreFn(vec)
		}));

		// Apply personality bias
		const biasedScores = applyPersonalityBias(baseScores, this.personality, this.biasStrength);

		// Add small random noise
		const noisyScores = biasedScores.map((s) => ({
			...s,
			score: clamp(s.score + random.float(-this.noiseFactor, this.noiseFactor), 0, 1)
		}));

		// Sort descending by score
		noisyScores.sort((a, b) => b.score - a.score);

		const best = noisyScores[0];
		const secondBest = noisyScores[1];

		return {
			action: best.action,
			target: null,
			confidence: best.score,
			reasoning: `utility:${best.action}(${best.score.toFixed(3)})>` +
				`${secondBest?.action ?? 'none'}(${secondBest?.score.toFixed(3) ?? '0'})`
		};
	}
}
