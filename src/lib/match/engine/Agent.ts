import type { AgentState, AgentPersonality } from './MatchState';
import type { MoveDef } from '../../combat/MoveRegistry';
import type { EffectiveModifiers } from './TraitFormulas';
import type { ComboRegistry } from '../../combat/ComboRegistry';
import { SeededRandom } from '../../utils/random';

/**
 * Available actions an agent can choose from each decision tick.
 */
export interface AgentAction {
	type: 'attack' | 'block' | 'idle' | 'mistake' | 'move' | 'taunt';
	moveId?: string;
}

/**
 * Context passed to the agent's decide() method.
 * Contains spatial information needed for range-aware decisions.
 */
export interface DecisionContext {
	/** Absolute distance to the opponent on X axis. */
	distance: number;
	/** The agent's preferred attack range (from MovementController). */
	attackRange: number;
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
 * Makes range-aware, weighted-random decisions based on:
 *   - Distance to opponent (approach first, then attack)
 *   - Per-move hitbox range (only consider in-range moves)
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
	/** Set of move IDs that can start at least one combo for this fighter's style. */
	private comboOpenerIds: Set<string> = new Set();

	constructor(
		private readonly rng: SeededRandom,
		private readonly availableMoves: MoveDef[],
		comboRegistry?: ComboRegistry,
		comboStyle?: string
	) {
		// Pre-compute which moves are combo openers
		if (comboRegistry && comboStyle) {
			const combos = comboRegistry.getByStyle(comboStyle);
			for (const combo of combos) {
				if (combo.steps.length > 0) {
					this.comboOpenerIds.add(combo.steps[0].moveId);
				}
			}
		}
	}

	/**
	 * Choose an action for this tick.
	 * Called only when FSM accepts input and cooldown is 0.
	 *
	 * Decision priority:
	 *   1. Mistake check (psychology whiff)
	 *   2. Out-of-range → move toward opponent
	 *   3. Block check (react to opponent attacks, low health)
	 *   4. Idle check (rest when exhausted)
	 *   5. Taunt check (high momentum, opponent stunned)
	 *   6. Pick an attack (in-range moves only)
	 *   7. Fallback → move (if no affordable in-range move exists)
	 *
	 * @param self - This agent's state
	 * @param opponent - The opponent's state
	 * @param ctx - Spatial context (distance, attack range)
	 * @param mods - Psychology-derived effective modifiers (optional)
	 */
	decide(
		self: AgentState,
		opponent: AgentState,
		ctx: DecisionContext,
		mods?: EffectiveModifiers
	): AgentAction {
		const p = self.personality;
		const healthPct = self.health / self.maxHealth;
		const staminaPct = self.stamina / self.maxStamina;

		// ── 1. Range check FIRST: if too far, approach (ALWAYS) ──
		// This MUST come before mistake check — fighters must close distance
		// or they'll stand still making whiffed attacks at range.
		const closestMoveRange = this.getClosestMoveRange(self);
		if (ctx.distance > closestMoveRange + 0.3) {
			// Too far — move toward opponent. No point choosing attack.
			return { type: 'move' };
		}

		// ── 2. Psychology: mistake check (only when in range) ──
		// Mistakes only make sense when close enough to actually attack.
		// Reduced effective chance to prevent mistake-spam from locking fighters.
		if (mods && mods.mistakeChance > 0 && this.rng.chance(mods.mistakeChance * 0.5)) {
			const randomMove = this.availableMoves[this.rng.int(0, this.availableMoves.length - 1)];
			if (randomMove && randomMove.staminaCost <= self.stamina
				&& ctx.distance <= randomMove.hitbox.range + 0.2) {
				return { type: 'mistake', moveId: randomMove.id };
			}
		}

		// ── 3. Should we block? ──
		// Only block when close enough for the opponent to actually hit us
		const opponentAttacking = opponent.phase === 'windup' || opponent.phase === 'active';
		const defenseWeight = mods ? mods.defense : 1.0;
		let blockChance = 0;

		// Only consider blocking when opponent is close and threatening
		if (opponentAttacking && ctx.distance < 3.0) {
			blockChance = 0.20 * defenseWeight;
			if (healthPct < 0.3) blockChance += 0.10 * defenseWeight;
		} else if (ctx.distance < 2.0) {
			// Small passive block chance when very close
			blockChance = 0.03 * (1 - p.aggression) * defenseWeight;
			if (healthPct < 0.3) blockChance += 0.05 * defenseWeight;
		}
		if (staminaPct < 0.15) blockChance += 0.05;

		// Comeback agents don't block — full aggression
		if (self.comebackActive) blockChance = 0.01;

		if (this.rng.chance(blockChance)) {
			return { type: 'block' };
		}

		// ── 4. Should we idle (rest)? ──
		// Idle = brief pause. Only do this occasionally and mainly when tired.
		const idleTendencyBase = mods ? mods.idleTendency * 0.5 : 0;
		let idleChance = idleTendencyBase;
		if (!mods) {
			if (staminaPct < 0.2 && !self.comebackActive) idleChance = 0.25;
			else if (staminaPct < 0.35 && !self.comebackActive) idleChance = 0.08;
		}

		if (this.rng.chance(idleChance)) {
			return { type: 'idle' };
		}

		// ── 5. Taunt check ──
		// Taunt when momentum is high and opponent is down (showmanship)
		const oppDown = opponent.phase === 'knockdown' || opponent.phase === 'getting_up';
		if (oppDown && self.momentum > 60 && staminaPct > 0.3 && this.rng.chance(0.2)) {
			return { type: 'taunt' };
		}

		// ── 6. Pick an in-range attack ──
		const move = this.selectMove(self, opponent, ctx, mods);
		if (move) {
			return { type: 'attack', moveId: move.id };
		}

		// ── 7. Fallback: no affordable in-range move → approach ──
		return { type: 'move' };
	}

	/**
	 * Get the practical engagement range for this fighter.
	 * Uses the median range of standard moves (strikes + grapples) rather than
	 * the maximum of all moves, so aerial moves at 3-4.5 range don't prevent
	 * fighters from approaching. This ensures fighters close distance to actual
	 * fighting range before choosing attacks.
	 */
	private getClosestMoveRange(self: AgentState): number {
		const ranges: number[] = [];
		for (const move of this.availableMoves) {
			if (move.staminaCost <= self.stamina) {
				// Only count standard combat moves for engagement range
				// Aerial/finisher/signature are special-case, not engagement range
				if (move.category === 'strike' || move.category === 'grapple' || move.category === 'submission') {
					ranges.push(move.hitbox.range);
				}
			}
		}
		if (ranges.length === 0) return 1.5;
		// Use the 75th percentile range — close enough for most moves to land
		ranges.sort((a, b) => a - b);
		const idx = Math.floor(ranges.length * 0.75);
		return ranges[Math.min(idx, ranges.length - 1)];
	}

	/**
	 * Select a move using weighted random selection.
	 * Only considers moves whose hitbox range covers the current distance.
	 *
	 * Weights are influenced by personality, psychology modifiers, and context.
	 */
	private selectMove(
		self: AgentState,
		opponent: AgentState,
		ctx: DecisionContext,
		mods?: EffectiveModifiers
	): MoveDef | null {
		const p = self.personality;
		const staminaPct = self.stamina / self.maxStamina;
		const oppStunned = opponent.phase === 'stun' || opponent.phase === 'knockdown' || opponent.phase === 'getting_up';

		// Psychology multipliers (default to 1.0 if no psychology system)
		const aggressionMul = mods ? mods.aggression : 1.0;
		const specialMoveMul = mods ? mods.specialMove : 1.0;
		const finisherBoost = mods ? mods.finisherBoost : 0;

		const options: WeightedOption[] = [];

		for (const move of this.availableMoves) {
			// ── Hard gates (skip entirely) ──

			// Can't afford it
			if (move.staminaCost > self.stamina) continue;

			// Out of range — this is the KEY fix for the spam bug
			if (ctx.distance > move.hitbox.range + 0.2) continue;

			// Momentum gates for special moves
			if (move.category === 'finisher' && self.momentum < 80) continue;
			if (move.category === 'signature' && self.momentum < 50) continue;

			// ── Weight calculation ──
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
					weight *= 3.0 * specialMoveMul;
					// Psychology: finisherBoost also pushes toward signature moves
					if (finisherBoost > 0) weight *= 1.0 + finisherBoost;
					if (self.comebackActive) weight *= 2.0;
					break;
				case 'finisher':
					weight *= 5.0 * specialMoveMul;
					// Psychology: finisherBoost adds extra urgency from emotion + momentum
					if (finisherBoost > 0) weight *= 1.0 + finisherBoost * 2.0;
					if (self.comebackActive) weight *= 3.0;
					break;
			}

			// ── Stamina conservation ──
			if (staminaPct < 0.4) {
				const costRatio = move.staminaCost / self.maxStamina;
				weight *= 1.0 - costRatio * 2;
			}

			// ── Aggression modifier (psychology-driven) ──
			if (move.baseDamage >= 14) {
				weight *= 0.5 + p.aggression * aggressionMul;
			} else {
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

			// ── Range efficiency bonus ──
			// Prefer moves that match the current distance well
			// (don't use a 0.8-range grapple when at 2.0 distance)
			const rangeFit = 1.0 - Math.abs(ctx.distance - move.hitbox.range * 0.7) / move.hitbox.range;
			weight *= Math.max(0.3, rangeFit);

			// ── Combo opener bonus — prefer moves that can start combos ──
			if (this.comboOpenerIds.has(move.id)) {
				// Combo openers get a moderate weight boost when we have stamina to follow through
				weight *= 1.3;
				// Extra boost at higher momentum (more likely to sustain the combo)
				if (self.momentum >= 30) weight *= 1.2;
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
