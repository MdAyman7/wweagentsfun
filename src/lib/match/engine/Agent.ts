import type { AgentState, AgentPersonality } from './MatchState';
import type { MoveDef } from '../../combat/MoveRegistry';
import type { EffectiveModifiers } from './TraitFormulas';
import { SeededRandom } from '../../utils/random';

/**
 * Available actions an agent can choose from each decision tick.
 */
export interface AgentAction {
	type: 'attack' | 'block' | 'idle' | 'mistake';
	moveId?: string;
}

/**
 * Weighted option for move selection.
 */
interface WeightedOption {
	moveId: string;
	weight: number;
}

/**
 * Agent — the AI brain for a wrestler.
 *
 * Makes weighted-random decisions based on:
 *   - Personality biases (strike preference, aggression, risk tolerance)
 *   - Psychology modifiers (emotion-driven aggression, defense, special moves)
 *   - Current health/stamina ratio (conserve when exhausted)
 *   - Opponent state (attack stunned opponents, block when pressured)
 *   - Momentum level (use signature/finisher when meter is high)
 *   - Comeback state (increased aggression during comeback)
 *
 * Decisions are deterministic for a given seed — same seed, same fight.
 */
export class Agent {
	constructor(
		private readonly rng: SeededRandom,
		private readonly availableMoves: MoveDef[]
	) {}

	/**
	 * Choose an action for this tick.
	 * Called only when agent is in 'idle' phase and cooldown is 0.
	 *
	 * @param self - This agent's state
	 * @param opponent - The opponent's state
	 * @param mods - Psychology-derived effective modifiers (optional for backwards compat)
	 */
	decide(self: AgentState, opponent: AgentState, mods?: EffectiveModifiers): AgentAction {
		const p = self.personality;
		const healthPct = self.health / self.maxHealth;
		const staminaPct = self.stamina / self.maxStamina;

		// ── Psychology: mistake check ──
		// Before any decision, check if the agent makes a mistake (whiff)
		if (mods && mods.mistakeChance > 0 && this.rng.chance(mods.mistakeChance)) {
			// Pick a random move to "whiff" — the agent commits to a bad action
			const randomMove = this.availableMoves[this.rng.int(0, this.availableMoves.length - 1)];
			if (randomMove && randomMove.staminaCost <= self.stamina) {
				return { type: 'mistake', moveId: randomMove.id };
			}
		}

		// ── Should we block? ──
		// Block chance scales with psychology defense modifier
		const opponentAttacking = opponent.phase === 'windup' || opponent.phase === 'active';
		const defenseWeight = mods ? mods.defense : 1.0;
		let blockChance = 0.1 * (1 - p.aggression) * defenseWeight;
		if (opponentAttacking) blockChance += 0.25 * defenseWeight;
		if (healthPct < 0.3) blockChance += 0.15 * defenseWeight;
		if (staminaPct < 0.15) blockChance += 0.2;

		// Comeback agents don't block — full aggression
		if (self.comebackActive) blockChance = 0.02;

		if (this.rng.chance(blockChance)) {
			return { type: 'block' };
		}

		// ── Should we idle (rest)? ──
		// idleTendency from psychology replaces hardcoded values
		const idleTendencyBase = mods ? mods.idleTendency : 0;
		let idleChance = idleTendencyBase;
		if (!mods) {
			// Fallback: original logic when no psychology
			if (staminaPct < 0.2 && !self.comebackActive) idleChance = 0.4;
			else if (staminaPct < 0.35 && !self.comebackActive) idleChance = 0.15;
		}

		if (this.rng.chance(idleChance)) {
			return { type: 'idle' };
		}

		// ── Pick a move ──
		const move = this.selectMove(self, opponent, mods);
		if (!move) {
			return { type: 'idle' };
		}

		return { type: 'attack', moveId: move.id };
	}

	/**
	 * Select a move using weighted random selection.
	 * Weights are influenced by personality, psychology modifiers, and context.
	 */
	private selectMove(
		self: AgentState,
		opponent: AgentState,
		mods?: EffectiveModifiers
	): MoveDef | null {
		const p = self.personality;
		const staminaPct = self.stamina / self.maxStamina;
		const oppStunned = opponent.phase === 'stun' || opponent.phase === 'knockdown' || opponent.phase === 'getting_up';

		// Psychology multipliers (default to 1.0 if no psychology system)
		const aggressionMul = mods ? mods.aggression : 1.0;
		const specialMoveMul = mods ? mods.specialMove : 1.0;

		const options: WeightedOption[] = [];

		for (const move of this.availableMoves) {
			// Skip moves we can't afford
			if (move.staminaCost > self.stamina) continue;

			// Skip finisher if momentum is too low
			if (move.category === 'finisher' && self.momentum < 80) continue;
			if (move.category === 'signature' && self.momentum < 50) continue;

			let weight = 1.0;

			// ── Category bias from personality ──
			switch (move.category) {
				case 'strike':
					weight *= 0.5 + p.strikePreference * 1.5;
					break;
				case 'grapple':
					weight *= 0.5 + (1 - p.strikePreference) * 1.5;
					break;
				case 'aerial':
					weight *= p.riskTolerance * 1.2;
					if (staminaPct < 0.3) weight *= 0.2; // too risky when tired
					break;
				case 'submission':
					weight *= (1 - p.aggression) * 0.8;
					break;
				case 'signature':
					weight *= 3.0 * specialMoveMul; // psychology amplifies special move tendency
					if (self.comebackActive) weight *= 2.0;
					break;
				case 'finisher':
					weight *= 5.0 * specialMoveMul; // psychology amplifies special move tendency
					if (self.comebackActive) weight *= 3.0;
					break;
			}

			// ── Stamina conservation ──
			// Prefer cheaper moves when tired
			if (staminaPct < 0.4) {
				const costRatio = move.staminaCost / self.maxStamina;
				weight *= 1.0 - costRatio * 2;
			}

			// ── Aggression modifier (psychology-driven) ──
			// High damage moves weighted by effective aggression
			if (move.baseDamage >= 14) {
				weight *= 0.5 + p.aggression * aggressionMul;
			} else {
				// Lower damage moves still get a slight aggression bias
				weight *= 0.8 + p.aggression * aggressionMul * 0.2;
			}

			// ── Target stunned opponents with big moves ──
			if (oppStunned && move.baseDamage >= 12) {
				weight *= 2.0;
			}

			// ── Region targeting — target already-damaged areas ──
			const regionDmg = opponent.regionDamage[move.region as keyof typeof opponent.regionDamage] ?? 0;
			if (regionDmg > 30) {
				weight *= 1.0 + regionDmg / 100;
			}

			// ── Comeback boost — go all-out ──
			if (self.comebackActive) {
				weight *= 1.5;
				if (move.baseDamage >= 15) weight *= 2.0;
			}

			if (weight > 0.01) {
				options.push({ moveId: move.id, weight: Math.max(0.01, weight) });
			}
		}

		if (options.length === 0) return null;

		// Weighted random selection
		const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
		let roll = this.rng.float(0, totalWeight);

		for (const option of options) {
			roll -= option.weight;
			if (roll <= 0) {
				return this.availableMoves.find((m) => m.id === option.moveId) ?? null;
			}
		}

		// Fallback: pick last option
		const last = options[options.length - 1];
		return this.availableMoves.find((m) => m.id === last.moveId) ?? null;
	}
}
