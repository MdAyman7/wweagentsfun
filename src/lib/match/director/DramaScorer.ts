import type { MatchState, AgentState, MatchLogEntry } from '../engine/MatchState';
import type { DramaSnapshot, DramaFactors, DramaEvent } from './types';
import { clamp, remap } from '../../utils/math';

/**
 * DramaScorer — pure function that reads MatchState and produces a
 * DramaSnapshot with tension (0-1) and tagged events.
 *
 * This is the "producer intelligence" — it reads the room and decides
 * how dramatic the current moment is. The CameraDirector, AtmosphereController,
 * and ReplayManager all consume this score.
 *
 * Six weighted factors:
 *   1. Health Differential  (30%) — close health = high tension
 *   2. Momentum Swing       (20%) — large delta = exciting shift
 *   3. Streak Intensity     (15%) — long streaks are dramatic
 *   4. Emotional Volatility (15%) — emotion transitions add drama
 *   5. Comeback Intensity   (10%) — active comeback = instant drama
 *   6. Late Match Urgency   (10%) — time pressure amplifies everything
 */

const WEIGHTS = {
	healthDifferential: 0.30,
	momentumSwing: 0.20,
	streakIntensity: 0.15,
	emotionalVolatility: 0.15,
	comebackIntensity: 0.10,
	lateMatchUrgency: 0.10
} as const;

/** Big hit damage threshold for drama events */
const BIG_HIT_THRESHOLD = 14;

/** Momentum peak threshold */
const MOMENTUM_PEAK_THRESHOLD = 80;

/** Near-finish health percentage */
const NEAR_FINISH_THRESHOLD = 0.12;

/**
 * Compute the dramatic tension of the current match state.
 *
 * @param state - Current MatchState (read-only)
 * @param prevState - Previous MatchState for delta calculations (null on first tick)
 * @returns DramaSnapshot with tension score and tagged events
 */
export function scoreDrama(
	state: MatchState,
	prevState: MatchState | null
): DramaSnapshot {
	const [a, b] = state.agents;

	const factors: DramaFactors = {
		healthDifferential: scoreHealthDifferential(a, b),
		momentumSwing: scoreMomentumSwing(state, prevState),
		streakIntensity: scoreStreakIntensity(a, b),
		emotionalVolatility: scoreEmotionalVolatility(state, prevState),
		comebackIntensity: scoreComebackIntensity(a, b),
		lateMatchUrgency: scoreLateMatchUrgency(state.elapsed, state.timeLimit)
	};

	const tension = clamp(
		factors.healthDifferential * WEIGHTS.healthDifferential
		+ factors.momentumSwing * WEIGHTS.momentumSwing
		+ factors.streakIntensity * WEIGHTS.streakIntensity
		+ factors.emotionalVolatility * WEIGHTS.emotionalVolatility
		+ factors.comebackIntensity * WEIGHTS.comebackIntensity
		+ factors.lateMatchUrgency * WEIGHTS.lateMatchUrgency,
		0,
		1
	);

	const events = extractDramaEvents(state, prevState?.tick ?? 0);

	return { tick: state.tick, tension, factors, events };
}

// ─── Factor Scorers ─────────────────────────────────────────────────

/**
 * Close health = high tension. Both low = maximum.
 * Blowout (one side dominating) = low tension.
 */
function scoreHealthDifferential(a: AgentState, b: AgentState): number {
	const pctA = a.health / a.maxHealth;
	const pctB = b.health / b.maxHealth;

	// Closeness factor: 1.0 when equal, 0.0 when one is full and other is empty
	const closeness = 1.0 - Math.abs(pctA - pctB);

	// Danger factor: both being low is more dramatic
	const avgHealth = (pctA + pctB) / 2;
	const dangerBonus = clamp(remap(avgHealth, 0.5, 0.1, 0, 0.5), 0, 0.5);

	return clamp(closeness * 0.7 + dangerBonus + (1 - avgHealth) * 0.3, 0, 1);
}

/**
 * Large momentum delta = exciting shift.
 * Underdog gaining momentum is more dramatic.
 */
function scoreMomentumSwing(state: MatchState, prevState: MatchState | null): number {
	if (!prevState) return 0;

	const [currA, currB] = state.agents;
	const [prevA, prevB] = prevState.agents;

	const deltaA = currA.momentum - prevA.momentum;
	const deltaB = currB.momentum - prevB.momentum;

	// Swing is the difference in momentum changes
	const swingMagnitude = Math.abs(deltaA - deltaB);

	// Normalize: a 20-point swing in one tick is extremely dramatic
	return clamp(swingMagnitude / 20, 0, 1);
}

/**
 * Long hit/taken streaks are dramatic.
 * A streak breaking (reversal after 4+ taken) is peak drama.
 */
function scoreStreakIntensity(a: AgentState, b: AgentState): number {
	const maxHitStreak = Math.max(a.psych.hitStreak, b.psych.hitStreak);
	const maxTakenStreak = Math.max(a.psych.takenStreak, b.psych.takenStreak);
	const bestStreak = Math.max(maxHitStreak, maxTakenStreak);

	// 6+ streak is extremely dramatic
	return clamp(bestStreak / 6, 0, 1);
}

/**
 * Emotion transitions add drama. Clutch and desperate states
 * get a multiplier. Calm is boring.
 */
function scoreEmotionalVolatility(state: MatchState, prevState: MatchState | null): number {
	const [a, b] = state.agents;

	// Base score from current emotional states
	let score = 0;
	for (const agent of [a, b]) {
		switch (agent.psych.emotion) {
			case 'clutch': score += 0.5; break;
			case 'desperate': score += 0.4; break;
			case 'overconfident': score += 0.3; break;
			case 'dominating': score += 0.2; break;
			case 'panicking': score += 0.25; break;
			case 'calm': score += 0.05; break;
		}
	}

	// Check for recent emotion changes in the log
	if (prevState) {
		const recentChanges = state.log.filter(
			(l) => l.tick > prevState.tick && l.type === 'emotion_change'
		);
		// Each emotion change adds volatility
		score += recentChanges.length * 0.2;
	}

	return clamp(score, 0, 1);
}

/**
 * Active comeback = instant high drama.
 * Approaching conditions = building tension.
 */
function scoreComebackIntensity(a: AgentState, b: AgentState): number {
	if (a.comebackActive || b.comebackActive) return 1.0;

	// Check if conditions are approaching comeback trigger
	let approaching = 0;
	for (const agent of [a, b]) {
		const healthPct = agent.health / agent.maxHealth;
		if (healthPct < 0.35) {
			approaching += clamp(remap(healthPct, 0.35, 0.15, 0, 0.5), 0, 0.5);
		}
	}

	return clamp(approaching, 0, 0.6);
}

/**
 * Drama scales with elapsed/timeLimit.
 * Last 30% of match = maximum urgency.
 */
function scoreLateMatchUrgency(elapsed: number, timeLimit: number): number {
	if (timeLimit <= 0) return 0;
	return clamp(remap(elapsed / timeLimit, 0.7, 1.0, 0, 1), 0, 1);
}

// ─── Event Extraction ───────────────────────────────────────────────

/**
 * Scan the match log for new drama-worthy events since prevTick.
 */
function extractDramaEvents(state: MatchState, prevTick: number): DramaEvent[] {
	const events: DramaEvent[] = [];

	for (const entry of state.log) {
		if (entry.tick <= prevTick) continue;

		switch (entry.type) {
			case 'move_hit': {
				const damage = (entry.data.damage as number) ?? 0;
				if (damage >= BIG_HIT_THRESHOLD) {
					events.push({
						type: 'big_hit',
						agentId: entry.data.attackerId as string,
						damage,
						moveId: entry.data.moveId as string
					});
				}
				break;
			}

			case 'reversal':
				events.push({
					type: 'reversal',
					agentId: entry.data.defenderId as string,
					moveId: entry.data.moveId as string ?? 'unknown'
				});
				break;

			case 'knockdown':
				events.push({
					type: 'knockdown',
					agentId: entry.data.agentId as string,
					knockdownCount: (entry.data.knockdownCount as number) ?? 1
				});
				break;

			case 'comeback':
				events.push({
					type: 'comeback_start',
					agentId: entry.data.agentId as string
				});
				break;

			case 'emotion_change':
				events.push({
					type: 'emotion_shift',
					agentId: entry.data.agentId as string,
					from: entry.data.from as string,
					to: entry.data.to as string
				});
				break;

			case 'mistake':
				events.push({
					type: 'mistake',
					agentId: entry.data.agentId as string
				});
				break;

			case 'match_end':
				events.push({
					type: 'match_end',
					winnerId: entry.data.winnerId as string,
					method: entry.data.method as string
				});
				break;
		}
	}

	// Check for near-finish conditions
	for (const agent of state.agents) {
		const healthPct = agent.health / agent.maxHealth;
		if (healthPct > 0 && healthPct <= NEAR_FINISH_THRESHOLD) {
			events.push({
				type: 'near_finish',
				agentId: agent.id,
				healthPct
			});
		}

		// Momentum peak
		if (agent.momentum >= MOMENTUM_PEAK_THRESHOLD) {
			events.push({
				type: 'momentum_peak',
				agentId: agent.id,
				momentum: agent.momentum
			});
		}
	}

	return events;
}
