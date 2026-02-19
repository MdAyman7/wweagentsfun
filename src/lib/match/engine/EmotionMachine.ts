import type { AgentState } from './MatchState';
import type {
	EmotionalState,
	AgentPsychState,
	PsychProfile
} from './PsychologyTypes';
import { computeEffectiveHysteresis } from './TraitFormulas';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';

/**
 * EmotionMachine — evaluates the 7-state emotional state machine.
 *
 * Transition logic:
 *
 * Each tick the machine is evaluated, it computes a SCORE for each
 * candidate emotional state. The state with the highest score wins,
 * subject to:
 *   1. Hysteresis: must stay in current emotion for a minimum duration
 *      (modified by adaptability trait — high adapt = shorter lock)
 *   2. Trait gates: some transitions require trait thresholds
 *   3. Noise: small random perturbation prevents deterministic stalemates
 *   4. Context: combo chains, time remaining, near-knockdowns influence scores
 *
 * ── TRANSITION RULES (7 states) ──
 *
 * → CALM:          Default. Score = stability factor (mid health, no streaks).
 *
 * → DOMINATING:    High health advantage + hit streak.
 *                  Gated by confidence > 0.4.
 *                  Ego amplifies the score.
 *
 * → FRUSTRATED:    Moderate health disadvantage + moves missing/reversed.
 *                  Gated by taken streak > 0.
 *                  Opponent landing combos amplifies frustration.
 *                  Low adaptability makes frustration stickier.
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
 *                  Gated by confidence > 0.5 AND momentum > 40.
 *                  Crowd sensitivity helps face wrestlers get here.
 *                  Time running out amplifies clutch urgency.
 */
export class EmotionMachine {
	constructor(private readonly rng: SeededRandom) {}

	/**
	 * Evaluate the emotional state machine for one agent.
	 * Returns the new AgentPsychState (may be unchanged if no transition).
	 *
	 * @param matchElapsed — seconds elapsed in match (for time-based transitions)
	 * @param matchTimeLimit — total match time limit in seconds
	 */
	evaluate(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState,
		profile: PsychProfile,
		matchElapsed?: number,
		matchTimeLimit?: number
	): AgentPsychState {
		let newPsych = { ...psych, emotionDuration: psych.emotionDuration + 1 };

		// Update confidence based on match flow
		newPsych.confidence = this.updateConfidence(agent, opponent, psych, profile);

		// Update crowd heat
		newPsych.crowdHeat = this.updateCrowdHeat(agent, opponent, psych);

		// Update momentum trend
		newPsych.momentumTrend = this.computeMomentumTrend(agent, psych);

		// ── Natural emotional decay ──
		// Emotions that aren't continually reinforced drift back toward calm.
		// Adaptable wrestlers decay faster (they move on from emotional states).
		const decayMultiplier = 1.0 + profile.adaptability * 0.5;
		if (newPsych.emotionDuration > 180 * (1.0 / decayMultiplier)) {
			// After extended time in a non-calm state, pull toward calm
			if (newPsych.emotion !== 'calm') {
				// Slow confidence regression when frustrated/panicking too long
				if (newPsych.emotion === 'frustrated' || newPsych.emotion === 'panicking') {
					newPsych.confidence = clamp(
						newPsych.confidence + 0.002 * profile.adaptability,
						0, 1
					);
				}
			}
		}

		// Check hysteresis — don't transition too fast
		// Adaptability reduces hysteresis duration
		const hysteresis = computeEffectiveHysteresis(profile);
		if (newPsych.emotionDuration < hysteresis) {
			return newPsych;
		}

		// Compute time factor for time-sensitive transitions
		const timeFactor = (matchElapsed !== undefined && matchTimeLimit !== undefined)
			? matchElapsed / matchTimeLimit
			: 0.5; // default to mid-match if not provided

		// Score each candidate emotion
		const scores = this.scoreEmotions(agent, opponent, newPsych, profile, timeFactor);

		// Add noise to prevent deterministic oscillation
		for (const key of Object.keys(scores) as EmotionalState[]) {
			scores[key] += this.rng.float(-0.05, 0.05);
		}

		// Bonus for staying in current state (inertia)
		// Low adaptability = higher inertia (stubborn, sticks with current emotion)
		const inertiaBonus = 0.15 * (1.0 + (1.0 - profile.adaptability) * 0.5);
		scores[newPsych.emotion] += inertiaBonus;

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
		profile: PsychProfile,
		timeFactor: number
	): Record<EmotionalState, number> {
		const healthPct = agent.health / agent.maxHealth;
		const oppHealthPct = opponent.health / opponent.maxHealth;
		const healthAdvantage = healthPct - oppHealthPct; // positive = winning
		const momentumPct = agent.momentum / 100;

		return {
			calm: this.scoreCalmState(healthAdvantage, psych),
			dominating: this.scoreDominatingState(healthAdvantage, psych, profile),
			frustrated: this.scoreFrustratedState(healthPct, healthAdvantage, psych, profile),
			panicking: this.scorePanickingState(healthPct, healthAdvantage, psych, profile),
			desperate: this.scoreDesperateState(healthPct, psych, profile, timeFactor),
			overconfident: this.scoreOverconfidentState(healthAdvantage, momentumPct, psych, profile),
			clutch: this.scoreClutchState(healthPct, momentumPct, psych, profile, timeFactor)
		};
	}

	// ── Individual emotion scorers ──────────────────────────────────

	private scoreCalmState(
		healthAdvantage: number,
		psych: AgentPsychState
	): number {
		let score = 0.5;
		score -= Math.abs(healthAdvantage) * 0.8;
		score -= (psych.hitStreak + psych.takenStreak) * 0.08;
		return Math.max(0, score);
	}

	private scoreDominatingState(
		healthAdvantage: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		if (psych.confidence < 0.4) return 0;

		let score = 0;
		score += clamp(healthAdvantage * 1.5, 0, 1);
		score += psych.hitStreak * 0.15;
		score += psych.bestComboLanded * 0.08;
		score *= 0.7 + profile.ego * 0.6;
		score *= psych.confidence;
		return Math.max(0, score);
	}

	/**
	 * FRUSTRATED state scorer.
	 *
	 * Frustration arises when:
	 * - The wrestler is losing but not critically (moderate health disadvantage)
	 * - Moves are being reversed or missing (taken streak)
	 * - Opponent is landing combos on them
	 * - They can't get their offense going
	 *
	 * It's the "losing composure" emotion — between calm and panicking.
	 * Leads to sloppy play and erratic aggression.
	 * Low adaptability wrestlers get stuck in frustration longer.
	 */
	private scoreFrustratedState(
		healthPct: number,
		healthAdvantage: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		if (healthAdvantage > 0.1 && psych.takenStreak === 0) return 0;

		let score = 0;

		// Moderate health disadvantage
		if (healthAdvantage < 0) {
			score += clamp(-healthAdvantage * 1.2, 0, 0.6);
		}

		// Taken streak is a major frustration driver
		score += psych.takenStreak * 0.15;

		// Opponent landing combos on us is infuriating
		score += psych.worstComboReceived * 0.12;

		// Low hit streak fuels frustration
		if (psych.hitStreak === 0 && psych.takenStreak >= 2) {
			score += 0.15;
		}

		// Ego amplifies frustration
		score *= 0.5 + profile.ego * 0.6;

		// Low adaptability makes frustration more likely
		score *= 1.0 + (1.0 - profile.adaptability) * 0.4;

		// Confidence suppresses frustration
		score *= 1.0 - psych.confidence * 0.3;

		// Frustration compounds
		if (psych.emotion === 'frustrated') {
			score += 0.1;
		}

		// At very low health, frustration gives way to panic/desperation
		if (healthPct < 0.25) {
			score *= 0.5;
		}

		return Math.max(0, score);
	}

	private scorePanickingState(
		healthPct: number,
		healthAdvantage: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		let score = 0;
		const healthPanic = clamp(1.0 - healthPct, 0, 1);
		score += healthPanic * 0.8;
		score += clamp(-healthAdvantage, 0, 1) * 0.5;
		score += psych.takenStreak * 0.12;
		score += psych.nearKnockdowns * 0.1;
		score *= 0.4 + profile.fearThreshold * 0.8;
		if (psych.crowdHeat < 0) {
			score += Math.abs(psych.crowdHeat) * profile.crowdSensitivity * 0.3;
		}
		score *= 1.2 - psych.confidence * 0.4;
		return Math.max(0, score);
	}

	private scoreDesperateState(
		healthPct: number,
		psych: AgentPsychState,
		profile: PsychProfile,
		timeFactor: number
	): number {
		if (healthPct > 0.30) return 0;

		let score = 0;
		score += clamp(1.0 - healthPct, 0, 1) * 0.7;
		score += profile.aggression * 0.4;
		if (psych.emotion === 'panicking' && psych.emotionDuration > 120) {
			score += 0.3;
		}
		if (psych.emotion === 'frustrated' && psych.emotionDuration > 90) {
			score += 0.2;
		}
		score += psych.takenStreak * 0.1;
		// Time running out amplifies desperation
		if (timeFactor > 0.75) {
			score += (timeFactor - 0.75) * 0.8;
		}
		return Math.max(0, score);
	}

	private scoreOverconfidentState(
		healthAdvantage: number,
		momentumPct: number,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		if (profile.ego < 0.4 || healthAdvantage < 0.15) return 0;

		let score = 0;
		score += healthAdvantage * 0.8;
		score += momentumPct * 0.4;
		score += psych.hitStreak * 0.15;
		score += psych.bestComboLanded * 0.1;
		score *= profile.ego;
		score *= psych.confidence;
		if (psych.emotion === 'dominating' && psych.emotionDuration > 180) {
			score += 0.25;
		}
		return Math.max(0, score);
	}

	private scoreClutchState(
		healthPct: number,
		momentumPct: number,
		psych: AgentPsychState,
		profile: PsychProfile,
		timeFactor: number
	): number {
		if (psych.confidence < 0.5 || momentumPct < 0.4) return 0;
		if (healthPct > 0.50) return 0;

		let score = 0;
		score += clamp(1.0 - healthPct, 0, 1) * 0.5;
		score += psych.confidence * 0.4;
		score += momentumPct * 0.3;
		if (psych.crowdHeat > 0) {
			score += psych.crowdHeat * profile.crowdSensitivity * 0.3;
		}
		score *= 0.6 + profile.momentumInfluence * 0.6;
		// Time pressure amplifies clutch
		if (timeFactor > 0.7) {
			score += (timeFactor - 0.7) * 0.6;
		}
		// Near-knockdown survival builds clutch narrative
		if (psych.nearKnockdowns > 0) {
			score += psych.nearKnockdowns * 0.08;
		}
		return Math.max(0, score);
	}

	// ── Sub-systems ─────────────────────────────────────────────────

	private updateConfidence(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState,
		profile: PsychProfile
	): number {
		let conf = psych.confidence;

		const healthAdv = (agent.health / agent.maxHealth) - (opponent.health / opponent.maxHealth);
		conf += healthAdv * 0.003;

		conf += psych.hitStreak * 0.005;
		conf -= psych.takenStreak * 0.008;

		conf += (agent.momentum / 100) * 0.002;

		// Landing combos boosts confidence
		conf += psych.bestComboLanded * 0.002;
		// Receiving combos hurts confidence
		conf -= psych.worstComboReceived * 0.003;

		// Near-knockdown events reduce confidence
		conf -= psych.nearKnockdowns * 0.004;

		// Ego inflates confidence recovery
		if (conf < profile.baseConfidence) {
			conf += profile.ego * 0.002;
		}

		// Adaptability helps recover confidence faster
		if (conf < profile.baseConfidence) {
			conf += profile.adaptability * 0.001;
		}

		conf += psych.crowdHeat * profile.crowdSensitivity * 0.001;

		// Mean-revert toward base confidence
		conf += (profile.baseConfidence - conf) * 0.005;

		return clamp(conf, 0, 1);
	}

	private updateCrowdHeat(
		agent: AgentState,
		opponent: AgentState,
		psych: AgentPsychState
	): number {
		let heat = psych.crowdHeat;

		const healthPct = agent.health / agent.maxHealth;
		const oppHealthPct = opponent.health / opponent.maxHealth;
		if (healthPct < oppHealthPct - 0.2) {
			heat += 0.003;
		} else if (healthPct > oppHealthPct + 0.3) {
			heat -= 0.001;
		}

		heat += psych.hitStreak * 0.002;
		heat -= psych.takenStreak * 0.001;

		// Combos excite the crowd
		if (psych.bestComboLanded >= 3) {
			heat += 0.004;
		}

		if (agent.comebackActive) heat += 0.005;

		// Near-knockdown survival pops the crowd
		if (psych.nearKnockdowns > 0 && healthPct > 0) {
			heat += psych.nearKnockdowns * 0.003;
		}

		heat *= 0.998;

		return clamp(heat, -1, 1);
	}

	private computeMomentumTrend(
		agent: AgentState,
		psych: AgentPsychState
	): number {
		const prevTrend = psych.momentumTrend;

		let direction = 0;
		if (psych.hitStreak > 0) direction = 0.1 * psych.hitStreak;
		if (psych.takenStreak > 0) direction = -0.1 * psych.takenStreak;

		// Combo chains amplify momentum trend
		direction += psych.bestComboLanded * 0.05;

		return prevTrend * 0.9 + direction * 0.1;
	}
}
