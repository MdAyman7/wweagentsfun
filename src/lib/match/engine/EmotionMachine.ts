import type { AgentState } from './MatchState';
import type {
	EmotionalState,
	AgentPsychState,
	PsychProfile
} from './PsychologyTypes';
import { EMOTION_MIN_DURATION } from './PsychologyTypes';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';

/**
 * EmotionMachine — evaluates the emotional state machine.
 *
 * Transition logic:
 *
 * Each tick the machine is evaluated, it computes a SCORE for each
 * candidate emotional state. The state with the highest score wins,
 * subject to:
 *   1. Hysteresis: must stay in current emotion for EMOTION_MIN_DURATION
 *   2. Trait gates: some transitions require trait thresholds
 *   3. Noise: small random perturbation prevents deterministic stalemates
 *
 * ── TRANSITION RULES ──
 *
 * → CALM:          Default. Score = stability factor (mid health, no streaks).
 *
 * → DOMINATING:    High health advantage + hit streak.
 *                  Gated by confidence > 0.4.
 *                  Ego amplifies the score.
 *
 * → PANICKING:     Low health + taken streak.
 *                  Gated by fear threshold (inverted: higher = easier to panic).
 *                  Crowd sensitivity amplifies if crowd is hostile.
 *
 * → DESPERATE:     Very low health + high aggression trait.
 *                  Transition from Panicking when health drops further.
 *                  "Nothing to lose" mentality.
 *
 * → OVERCONFIDENT: High momentum + recent domination + high ego.
 *                  Dangerous state: high reward but opens up mistakes.
 *
 * → CLUTCH:        Low health BUT high momentum/confidence.
 *                  Gated by confidence > 0.6 AND momentum > 50.
 *                  Crowd sensitivity helps face wrestlers get here.
 *                  This is the "big match player" moment.
 */
export class EmotionMachine {
	constructor(private readonly rng: SeededRandom) {}

	/**
	 * Evaluate the emotional state machine for one agent.
	 * Returns the new AgentPsychState (may be unchanged if no transition).
	 */
	evaluate(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState,
		profile: PsychProfile
	): AgentPsychState {
		let newPsych = { ...psych, emotionDuration: psych.emotionDuration + 1 };

		// Update confidence based on match flow
		newPsych.confidence = this.updateConfidence(agent, opponent, psych, profile);

		// Update crowd heat
		newPsych.crowdHeat = this.updateCrowdHeat(agent, opponent, psych);

		// Update momentum trend
		newPsych.momentumTrend = this.computeMomentumTrend(agent, psych);

		// Check hysteresis — don't transition too fast
		if (newPsych.emotionDuration < EMOTION_MIN_DURATION) {
			return newPsych;
		}

		// Score each candidate emotion
		const scores = this.scoreEmotions(agent, opponent, newPsych, profile);

		// Add noise to prevent deterministic oscillation
		for (const key of Object.keys(scores) as EmotionalState[]) {
			scores[key] += this.rng.float(-0.05, 0.05);
		}

		// Bonus for staying in current state (inertia)
		scores[newPsych.emotion] += 0.15;

		// Find highest-scoring emotion
		let bestEmotion: EmotionalState = newPsych.emotion;
		let bestScore = -Infinity;
		for (const [emotion, score] of Object.entries(scores) as [EmotionalState, number][]) {
			if (score > bestScore) {
				bestScore = score;
				bestEmotion = emotion;
			}
		}

		// Apply transition
		if (bestEmotion !== newPsych.emotion) {
			newPsych.emotion = bestEmotion;
			newPsych.emotionDuration = 0;
		}

		return newPsych;
	}

	/**
	 * Score each emotional state based on match context.
	 */
	private scoreEmotions(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState,
		profile: PsychProfile
	): Record<EmotionalState, number> {
		const healthPct = agent.health / agent.maxHealth;
		const oppHealthPct = opponent.health / opponent.maxHealth;
		const healthAdvantage = healthPct - oppHealthPct; // positive = winning
		const momentumPct = agent.momentum / 100;

		return {
			// ── CALM ──
			// Favored when things are even, no extreme streaks
			calm: this.scoreCalmState(healthAdvantage, psych),

			// ── DOMINATING ──
			// Favored when winning with a hit streak
			dominating: this.scoreDominatingState(healthAdvantage, psych, profile),

			// ── PANICKING ──
			// Favored when losing badly with a taken streak
			panicking: this.scorePanickingState(healthPct, healthAdvantage, psych, profile),

			// ── DESPERATE ──
			// Favored when very low health + high aggression
			desperate: this.scoreDesperateState(healthPct, psych, profile),

			// ── OVERCONFIDENT ──
			// Favored when dominating + high ego + high momentum
			overconfident: this.scoreOverconfidentState(healthAdvantage, momentumPct, psych, profile),

			// ── CLUTCH ──
			// Favored when low health but high confidence/momentum
			clutch: this.scoreClutchState(healthPct, momentumPct, psych, profile)
		};
	}

	// ── Individual emotion scorers ──────────────────────────────────

	private scoreCalmState(
		healthAdvantage: number,
		psych: AgentPsychState
	): number {
		// Calm is favored when the match is even
		let score = 0.5;
		// Penalty for extreme health differentials
		score -= Math.abs(healthAdvantage) * 0.8;
		// Penalty for streaks
		score -= (psych.hitStreak + psych.takenStreak) * 0.08;
		return Math.max(0, score);
	}

	private scoreDominatingState(
		healthAdvantage: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		// Gate: need some confidence
		if (psych.confidence < 0.4) return 0;

		let score = 0;
		// Health advantage is the primary driver
		score += clamp(healthAdvantage * 1.5, 0, 1);
		// Hit streak contributes
		score += psych.hitStreak * 0.15;
		// Ego amplifies (egotistical wrestlers feel dominant faster)
		score *= 0.7 + profile.ego * 0.6;
		// Confidence floor
		score *= psych.confidence;
		return Math.max(0, score);
	}

	private scorePanickingState(
		healthPct: number,
		healthAdvantage: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		let score = 0;
		// Low health drives panic
		const healthPanic = clamp(1.0 - healthPct, 0, 1);
		score += healthPanic * 0.8;
		// Losing badly amplifies
		score += clamp(-healthAdvantage, 0, 1) * 0.5;
		// Taken streak amplifies
		score += psych.takenStreak * 0.12;
		// Fear threshold: high fearThreshold = panics easily
		score *= 0.4 + profile.fearThreshold * 0.8;
		// Crowd hostility amplifies (crowd sensitivity)
		if (psych.crowdHeat < 0) {
			score += Math.abs(psych.crowdHeat) * profile.crowdSensitivity * 0.3;
		}
		// Low confidence makes panic more likely
		score *= 1.2 - psych.confidence * 0.4;
		return Math.max(0, score);
	}

	private scoreDesperateState(
		healthPct: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		// Only desperate when health is very low
		if (healthPct > 0.30) return 0;

		let score = 0;
		// Lower health = more desperate
		score += clamp(1.0 - healthPct, 0, 1) * 0.7;
		// Aggression trait drives desperation (aggressive fighters go down swinging)
		score += profile.aggression * 0.4;
		// Panicking for a while transitions to desperate
		if (psych.emotion === 'panicking' && psych.emotionDuration > 120) {
			score += 0.3;
		}
		// Taken streak pushes toward desperation
		score += psych.takenStreak * 0.1;
		return Math.max(0, score);
	}

	private scoreOverconfidentState(
		healthAdvantage: number,
		momentumPct: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		// Gate: need high ego AND winning
		if (profile.ego < 0.4 || healthAdvantage < 0.15) return 0;

		let score = 0;
		// Domination + high momentum
		score += healthAdvantage * 0.8;
		score += momentumPct * 0.4;
		// Hit streak (feeling invincible)
		score += psych.hitStreak * 0.15;
		// Ego is the primary amplifier
		score *= profile.ego;
		// Confidence pushes overconfidence
		score *= psych.confidence;
		// Being in dominating state already makes overconfidence more likely
		if (psych.emotion === 'dominating' && psych.emotionDuration > 180) {
			score += 0.25;
		}
		return Math.max(0, score);
	}

	private scoreClutchState(
		healthPct: number,
		momentumPct: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		// Gate: need confidence AND momentum AND low health
		if (psych.confidence < 0.5 || momentumPct < 0.4) return 0;
		if (healthPct > 0.50) return 0; // not low enough to be "clutch"

		let score = 0;
		// Low health + high confidence = clutch performer
		score += clamp(1.0 - healthPct, 0, 1) * 0.5;
		score += psych.confidence * 0.4;
		score += momentumPct * 0.3;
		// Crowd support helps faces get to clutch
		if (psych.crowdHeat > 0) {
			score += psych.crowdHeat * profile.crowdSensitivity * 0.3;
		}
		// Momentum influence makes momentum-dependent wrestlers more clutch
		score *= 0.6 + profile.momentumInfluence * 0.6;
		return Math.max(0, score);
	}

	// ── Sub-systems ─────────────────────────────────────────────────

	/**
	 * Update confidence based on match events.
	 * Confidence drifts toward a "fair" estimate based on match flow.
	 */
	private updateConfidence(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		let conf = psych.confidence;

		// Health advantage boosts confidence
		const healthAdv = (agent.health / agent.maxHealth) - (opponent.health / opponent.maxHealth);
		conf += healthAdv * 0.003;

		// Hit streaks boost, taken streaks reduce
		conf += psych.hitStreak * 0.005;
		conf -= psych.takenStreak * 0.008;

		// Momentum boosts confidence
		conf += (agent.momentum / 100) * 0.002;

		// Ego inflates confidence recovery (high ego = bounces back faster)
		if (conf < profile.baseConfidence) {
			conf += profile.ego * 0.002;
		}

		// Crowd support helps confidence (for crowd-sensitive wrestlers)
		conf += psych.crowdHeat * profile.crowdSensitivity * 0.001;

		// Mean-revert toward base confidence (slow drift)
		conf += (profile.baseConfidence - conf) * 0.005;

		return clamp(conf, 0, 1);
	}

	/**
	 * Simulated crowd heat based on match action.
	 * Positive = crowd cheering for this wrestler.
	 * Negative = crowd booing / supporting opponent.
	 */
	private updateCrowdHeat(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState
	): number {
		let heat = psych.crowdHeat;

		// Crowd loves underdogs
		const healthPct = agent.health / agent.maxHealth;
		const oppHealthPct = opponent.health / opponent.maxHealth;
		if (healthPct < oppHealthPct - 0.2) {
			heat += 0.003; // underdog bonus
		} else if (healthPct > oppHealthPct + 0.3) {
			heat -= 0.001; // crowd gets bored of domination
		}

		// Hit streaks shift crowd
		heat += psych.hitStreak * 0.002;
		heat -= psych.takenStreak * 0.001;

		// Comebacks are exciting
		if (agent.comebackActive) heat += 0.005;

		// Decay toward 0 (crowd is fickle)
		heat *= 0.998;

		return clamp(heat, -1, 1);
	}

	/**
	 * Compute momentum trend (derivative of momentum over recent ticks).
	 * Positive = momentum building, negative = momentum fading.
	 */
	private computeMomentumTrend(
		agent: AgentState,
		psych: AgentPsychState
	): number {
		// Simple exponential smoothing of momentum direction
		const currentMomentum = agent.momentum / 100;
		const prevTrend = psych.momentumTrend;

		let direction = 0;
		if (psych.hitStreak > 0) direction = 0.1 * psych.hitStreak;
		if (psych.takenStreak > 0) direction = -0.1 * psych.takenStreak;

		// Smooth blend
		return prevTrend * 0.9 + direction * 0.1;
	}
}
