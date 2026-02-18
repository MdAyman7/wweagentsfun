import type { AgentState, MatchState } from './MatchState';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';

/**
 * Comeback duration in ticks (5 seconds at 60fps).
 */
const COMEBACK_DURATION_TICKS = 300;

/**
 * Minimum ticks between comebacks (20 seconds).
 */
const COMEBACK_COOLDOWN_TICKS = 1200;

/**
 * Health ratio below which a comeback can trigger.
 */
const COMEBACK_HEALTH_THRESHOLD = 0.30;

/**
 * The losing agent must be THIS much lower than the opponent.
 */
const COMEBACK_DEFICIT_THRESHOLD = 0.25;

/**
 * ComebackSystem — models the dramatic "Hulk Up" / second wind.
 *
 * A comeback triggers when:
 *   1. Agent health is below 30% of max
 *   2. Agent is at least 25% health lower than opponent
 *   3. Global comeback cooldown has expired (prevents spam)
 *   4. A random chance check passes (rare event: ~12% base)
 *
 * During a comeback (5 seconds):
 *   - Damage dealt is boosted by 30% (via CombatResolver)
 *   - Agent stamina regenerates 3× faster
 *   - Block/idle decisions are suppressed (full aggression)
 *   - Signature/finisher move weights are boosted heavily
 *
 * This creates the classic wrestling "fighting spirit" moment.
 */
export class ComebackSystem {
	constructor(private readonly rng: SeededRandom) {}

	/**
	 * Check if a comeback should trigger for the given agent.
	 * Returns the agent ID if triggered, null otherwise.
	 */
	checkTrigger(state: MatchState): string | null {
		if (state.comebackCooldown > 0) return null;

		for (const agent of state.agents) {
			if (agent.comebackActive) return null; // only one at a time

			const healthPct = agent.health / agent.maxHealth;
			if (healthPct > COMEBACK_HEALTH_THRESHOLD) continue;

			const opponent = state.agents.find((a) => a.id !== agent.id)!;
			const oppHealthPct = opponent.health / opponent.maxHealth;
			const deficit = oppHealthPct - healthPct;

			if (deficit < COMEBACK_DEFICIT_THRESHOLD) continue;

			// ── Probability increases with deficit severity ──
			// Base 12% + up to 15% more based on how badly they're losing
			const baseChance = 0.0020; // per tick, works out to ~12% over a second
			const deficitBonus = clamp((deficit - 0.25) * 0.003, 0, 0.0025);
			// Late match bonus: comebacks are more likely as time runs out
			const timeBonus = (state.elapsed / state.timeLimit) * 0.001;

			const chance = baseChance + deficitBonus + timeBonus;

			if (this.rng.chance(chance)) {
				return agent.id;
			}
		}

		return null;
	}

	/**
	 * Check if an active comeback should end.
	 */
	shouldEnd(agent: AgentState, tick: number, comebackStartTick: number): boolean {
		// Duration expired
		if (tick - comebackStartTick >= COMEBACK_DURATION_TICKS) return true;
		// Agent got knocked down during comeback — it's over
		if (agent.phase === 'knockdown') return true;
		// Health recovered above threshold (rare but possible)
		if (agent.health / agent.maxHealth > 0.6) return true;
		return false;
	}

	get cooldownTicks(): number {
		return COMEBACK_COOLDOWN_TICKS;
	}

	get durationTicks(): number {
		return COMEBACK_DURATION_TICKS;
	}
}
