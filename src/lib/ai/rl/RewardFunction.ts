import { clamp } from '../../utils/math';

/**
 * Snapshot of per-tick state used to compute reward.
 * Deltas are current - previous tick values.
 */
export interface RewardContext {
	/** Damage dealt this tick (positive). */
	damageDealt: number;
	/** Damage taken this tick (positive value = bad). */
	damageTaken: number;
	/** Change in crowd pop this tick. */
	crowdPopDelta: number;
	/** Change in match rating this tick. */
	matchRatingDelta: number;
	/** Whether a near-fall occurred this tick (2-count). */
	nearFallOccurred: boolean;
	/** Whether the agent's finisher connected this tick. */
	finisherConnected: boolean;
	/** Whether the agent's signature connected this tick. */
	signatureConnected: boolean;
	/** Whether a reversal was performed this tick (by agent). */
	reversalPerformed: boolean;
	/** Terminal state: did the agent win? null = match still going. */
	matchOutcome: 'win' | 'loss' | 'draw' | null;
	/** Current momentum of the agent (0-100). */
	agentMomentum: number;
	/** Current match rating (0-5 stars). */
	currentMatchRating: number;
}

/**
 * Weight configuration for reward components.
 * Tune these to shape learning behavior.
 */
export interface RewardWeights {
	damageDealt: number;
	damageTaken: number;
	crowdPop: number;
	matchRating: number;
	nearFallBonus: number;
	finisherBonus: number;
	signatureBonus: number;
	reversalBonus: number;
	winReward: number;
	lossReward: number;
	drawReward: number;
}

/**
 * Default reward weights — balanced for entertaining match quality.
 * Positive weights reward desirable outcomes, negative penalize bad ones.
 */
export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
	damageDealt: 0.01,
	damageTaken: -0.008,
	crowdPop: 0.005,
	matchRating: 0.02,
	nearFallBonus: 0.15,
	finisherBonus: 0.3,
	signatureBonus: 0.2,
	reversalBonus: 0.1,
	winReward: 1.0,
	lossReward: -0.5,
	drawReward: 0.1
};

/**
 * Compute per-tick reward for RL training.
 *
 * The reward is a composite signal designed to teach the agent to:
 * 1. Deal damage effectively (but not just spam).
 * 2. Avoid taking unnecessary damage.
 * 3. Play to the crowd (entertainment value).
 * 4. Create dramatic moments (near-falls, signature spots).
 * 5. Win the match (terminal reward).
 *
 * @param ctx - Current tick context with deltas and events.
 * @param weights - Reward component weights. Defaults to DEFAULT_REWARD_WEIGHTS.
 * @returns Scalar reward value. Typically in range [-1.5, 2.0] per tick.
 */
export function computeReward(
	ctx: RewardContext,
	weights: RewardWeights = DEFAULT_REWARD_WEIGHTS
): number {
	let reward = 0;

	// ── Continuous rewards (every tick) ──

	// Damage dealt is good
	reward += ctx.damageDealt * weights.damageDealt;

	// Damage taken is bad
	reward += ctx.damageTaken * weights.damageTaken;

	// Crowd pop change (entertaining the audience)
	reward += ctx.crowdPopDelta * weights.crowdPop;

	// Match rating improvement
	reward += ctx.matchRatingDelta * weights.matchRating;

	// ── Event-based bonuses (sparse) ──

	// Near-fall drama (2-count) — big crowd pop moment
	if (ctx.nearFallOccurred) {
		reward += weights.nearFallBonus;
	}

	// Finisher connection — climactic moment
	if (ctx.finisherConnected) {
		reward += weights.finisherBonus;
	}

	// Signature connection — building toward finish
	if (ctx.signatureConnected) {
		reward += weights.signatureBonus;
	}

	// Reversal — shows adaptability and creates drama
	if (ctx.reversalPerformed) {
		reward += weights.reversalBonus;
	}

	// ── Terminal rewards (end of match) ──

	if (ctx.matchOutcome !== null) {
		switch (ctx.matchOutcome) {
			case 'win':
				// Scale win reward by match quality: winning a great match is better
				reward += weights.winReward * (1 + ctx.currentMatchRating * 0.2);
				break;
			case 'loss':
				// Losing a great match is less bad than losing a boring one
				reward += weights.lossReward * (1 - ctx.currentMatchRating * 0.1);
				break;
			case 'draw':
				reward += weights.drawReward;
				break;
		}
	}

	return reward;
}

/**
 * Compute cumulative discounted return from a sequence of per-tick rewards.
 * Used for training value functions.
 *
 * @param rewards - Array of per-tick rewards in chronological order.
 * @param gamma - Discount factor (0-1). Higher = more future-oriented. Default 0.99.
 * @returns Array of discounted returns, same length as rewards.
 */
export function computeDiscountedReturns(
	rewards: number[],
	gamma: number = 0.99
): number[] {
	const returns = new Array<number>(rewards.length);
	let runningReturn = 0;

	for (let i = rewards.length - 1; i >= 0; i--) {
		runningReturn = rewards[i] + gamma * runningReturn;
		returns[i] = runningReturn;
	}

	return returns;
}

/**
 * Normalize rewards to zero mean and unit variance.
 * Stabilizes RL training by reducing reward scale sensitivity.
 */
export function normalizeRewards(rewards: number[]): number[] {
	if (rewards.length === 0) return [];

	const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
	const variance = rewards.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rewards.length;
	const std = Math.sqrt(variance) || 1; // avoid division by zero

	return rewards.map((r) => clamp((r - mean) / std, -10, 10));
}
