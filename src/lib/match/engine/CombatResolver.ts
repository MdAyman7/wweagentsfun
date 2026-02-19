import type { AgentState } from './MatchState';
import type { MoveDef } from '../../combat/MoveRegistry';
import type { EffectiveModifiers } from './TraitFormulas';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';

/**
 * Result of resolving a combat exchange between two agents.
 */
export interface CombatResult {
	/** Did the move connect? */
	hit: boolean;
	/** Final damage after all modifiers (0 if miss/block/reversal) */
	damage: number;
	/** Was the move reversed by the defender? */
	reversed: boolean;
	/** If reversed, damage dealt back to the attacker */
	reversalDamage: number;
	/** Was this a critical hit (extra damage + knockdown chance)? */
	critical: boolean;
	/** Momentum gained by the attacker on hit */
	momentumGain: number;
	/** Stun frames applied to the defender on hit */
	stunFrames: number;
	/** Descriptive text for the log */
	description: string;
}

/**
 * CombatResolver — resolves a single attack action into outcomes.
 *
 * The flow:
 * 1. Check distance (are they close enough?)
 * 2. Check if defender blocks (reduced damage, no momentum)
 * 3. Check reversal window (defender can reverse with skill check)
 * 4. Calculate damage with modifiers
 * 5. Determine stun/knockdown
 *
 * Damage formula (with psychology):
 *   finalDamage = baseDamage
 *     × staminaModifier    (0.5 at 0 stamina → 1.1 at full)
 *     × regionModifier     (1.0 + vulnerability bonus up to 0.5)
 *     × variance           (0.85 – 1.15 random)
 *     × criticalMultiplier (1.5 on crit, base chance modified by psychology)
 *     × comebackModifier   (1.3 during comeback)
 *     × psychDamageMod     (0.7 – 1.6 from emotional state)
 */
export class CombatResolver {
	constructor(private readonly rng: SeededRandom) {}

	/**
	 * Resolve an attack.
	 *
	 * @param attacker - Attacking agent
	 * @param defender - Defending agent
	 * @param move - The move being performed
	 * @param attackerMods - Psychology modifiers for the attacker (optional)
	 * @param defenderMods - Psychology modifiers for the defender (optional)
	 */
	resolve(
		attacker: AgentState,
		defender: AgentState,
		move: MoveDef,
		attackerMods?: EffectiveModifiers,
		defenderMods?: EffectiveModifiers
	): CombatResult {
		// ── Distance check ──
		const distance = Math.abs(attacker.positionX - defender.positionX);
		const effectiveRange = move.hitbox.range;

		if (distance > effectiveRange) {
			return {
				hit: false,
				damage: 0,
				reversed: false,
				reversalDamage: 0,
				critical: false,
				momentumGain: 0,
				stunFrames: 0,
				description: `${move.name} missed — out of range`
			};
		}

		// ── Dodge check ──
		// Defenders in idle or moving can dodge. Blocking defenders cannot dodge (they absorb hits).
		// Stunned, knocked down, getting_up, and taunting defenders are too vulnerable.
		const canDodge = defender.phase === 'idle' || defender.phase === 'moving';
		if (canDodge) {
			// Passive dodge chance — creates miss variety and extends matches
			// Psychology: defense modifier affects dodge chance
			const defenseBonus = defenderMods ? defenderMods.defense * 0.06 : 0;
			const dodgeChance = 0.12 + (defender.stamina / defender.maxStamina) * 0.10 + defenseBonus;
			if (this.rng.chance(dodgeChance)) {
				return {
					hit: false,
					damage: 0,
					reversed: false,
					reversalDamage: 0,
					critical: false,
					momentumGain: 0,
					stunFrames: 0,
					description: `${defender.name} dodged the ${move.name}`
				};
			}
		}

		// ── Reversal check ──
		// Idle or moving defenders can attempt reversals (requires readiness)
		if (move.canBeReversed && (defender.phase === 'idle' || defender.phase === 'moving')) {
			const baseReversalChance = 0.12;
			const skillBonus = defender.personality.reversalSkill * 0.18;
			const windowBonus = (move.reversalWindow / 10) * 0.08;
			// Harder to reverse when exhausted
			const staminaPenalty = (1 - defender.stamina / defender.maxStamina) * 0.1;
			// Psychology: reversal modifier from emotional state
			const psychReversalMul = defenderMods ? defenderMods.reversal : 1.0;
			const reversalChance = clamp(
				(baseReversalChance + skillBonus + windowBonus - staminaPenalty) * psychReversalMul,
				0.03,
				0.40
			);

			if (this.rng.chance(reversalChance)) {
				const reversalDamage = Math.round(move.baseDamage * 0.4);
				return {
					hit: false,
					damage: 0,
					reversed: true,
					reversalDamage,
					critical: false,
					momentumGain: 0,
					stunFrames: 48,
					description: `${defender.name} reversed the ${move.name}!`
				};
			}
		}

		// ── Hit confirmed — calculate damage ──

		// Stamina modifier: tired fighters deal less damage
		const attackerStaminaPct = attacker.stamina / attacker.maxStamina;
		const staminaModifier = 0.5 + attackerStaminaPct * 0.6;

		// Region vulnerability: targeting already-damaged areas hurts more
		const regionKey = move.region as keyof typeof defender.regionDamage;
		const regionDmg = defender.regionDamage[regionKey] ?? 0;
		const regionModifier = 1.0 + clamp(regionDmg / 100, 0, 1) * 0.5;

		// Random variance: ±15%
		const variance = this.rng.float(0.85, 1.15);

		// Critical hit check — psychology modifies crit chance
		const baseCritChance = 0.08;
		const critBonus = move.category === 'finisher' ? 0.15 : move.category === 'signature' ? 0.1 : 0;
		const psychCritMul = attackerMods ? attackerMods.crit : 1.0;
		const critical = this.rng.chance((baseCritChance + critBonus) * psychCritMul);
		const criticalMultiplier = critical ? 1.5 : 1.0;

		// Comeback modifier
		const comebackModifier = attacker.comebackActive ? 1.3 : 1.0;

		// Psychology damage modifier (0.7 – 1.6)
		const psychDamageMod = attackerMods ? attackerMods.damage : 1.0;

		// Match pacing scaler — reduces raw damage to extend match duration.
		// Tuned so matches run 25-50 seconds with 240-330 HP fighters.
		const pacingScale = 0.75;

		// Final damage
		const rawDamage = move.baseDamage
			* staminaModifier
			* regionModifier
			* variance
			* criticalMultiplier
			* comebackModifier
			* psychDamageMod
			* pacingScale;

		const damage = Math.max(1, Math.round(rawDamage));

		// Momentum gain (boosted on crit, reduced if defender was stunned)
		let momentumGain = move.momentumGain;
		if (critical) momentumGain = Math.round(momentumGain * 1.5);
		// Reduced momentum for hitting already-vulnerable targets
		if (defender.phase === 'stun' || defender.phase === 'getting_up') {
			momentumGain = Math.round(momentumGain * 0.6);
		}

		// Stun frames based on damage (bigger hits = longer stun)
		// Scaled 3× for cinematic pacing — fighters reel and stagger longer
		let stunFrames = Math.round(18 + damage * 2.4);
		if (critical) stunFrames += 24;
		// Fast defenders recover from stun slightly quicker
		if (defenderMods && defenderMods.speed > 1.0) {
			stunFrames = Math.round(stunFrames / (0.8 + defenderMods.speed * 0.2));
		}
		// Slow/panicking defenders stay stunned slightly longer
		if (defenderMods && defenderMods.speed < 0.95) {
			stunFrames = Math.round(stunFrames * (1.1 - defenderMods.speed * 0.1));
		}
		stunFrames = clamp(stunFrames, 18, 150);

		// Description
		const emotionTag = attackerMods ? ` [${attackerMods.emotion.toUpperCase()}]` : '';
		let desc = `${attacker.name} hits ${move.name} for ${damage} damage`;
		if (critical) desc += ' (CRITICAL!)';
		if (attacker.comebackActive) desc += ' [COMEBACK]';
		if (emotionTag && attackerMods && attackerMods.emotion !== 'calm') desc += emotionTag;

		return {
			hit: true,
			damage,
			reversed: false,
			reversalDamage: 0,
			critical,
			momentumGain,
			stunFrames,
			description: desc
		};
	}

	/**
	 * Resolve a finisher — guaranteed hit, no dodge/reversal checks.
	 * Counter-finisher checks happen during FINISHER_SETUP (handled by MatchLoop),
	 * not here. This method calculates damage only.
	 *
	 * Finisher damage formula:
	 *   baseDamage × 1.5 (finisher multiplier)
	 *   × staminaModifier (0.5 + staminaPct × 0.6)
	 *   × regionModifier (1.0 + regionVulnerability × 0.5)
	 *   × variance (0.95–1.05, tight for consistency)
	 *   × psychDamageMod (from attackerMods)
	 *   × comebackModifier (1.3 if active)
	 *   × clutchCrit (1.3 if emotion === 'clutch')
	 */
	resolveFinisher(
		attacker: AgentState,
		defender: AgentState,
		move: MoveDef,
		attackerMods?: EffectiveModifiers
	): { damage: number; knockdownForced: boolean; description: string } {
		// Finisher multiplier — finishers hit harder than normal moves
		const finisherMultiplier = 1.5;

		// Stamina modifier: tired fighters deal less damage
		const attackerStaminaPct = attacker.stamina / attacker.maxStamina;
		const staminaModifier = 0.5 + attackerStaminaPct * 0.6;

		// Region vulnerability: targeting already-damaged areas hurts more
		const regionKey = move.region as keyof typeof defender.regionDamage;
		const regionDmg = defender.regionDamage[regionKey] ?? 0;
		const regionModifier = 1.0 + clamp(regionDmg / 100, 0, 1) * 0.5;

		// Tight variance for finishers (±5% — finishers should feel consistent)
		const variance = this.rng.float(0.95, 1.05);

		// Psychology damage modifier
		const psychDamageMod = attackerMods ? attackerMods.damage : 1.0;

		// Comeback modifier
		const comebackModifier = attacker.comebackActive ? 1.3 : 1.0;

		// Clutch crit: being "in the zone" makes finishers even more devastating
		const clutchCrit = (attackerMods && attackerMods.emotion === 'clutch') ? 1.3 : 1.0;

		// Final damage
		const rawDamage = move.baseDamage
			* finisherMultiplier
			* staminaModifier
			* regionModifier
			* variance
			* psychDamageMod
			* comebackModifier
			* clutchCrit;

		const damage = Math.max(1, Math.round(rawDamage));

		// Knockdown forced if defender health drops to 0 or below 10% after damage
		const defenderHealthAfter = defender.health - damage;
		const knockdownForced = defenderHealthAfter <= 0
			|| (defenderHealthAfter / defender.maxHealth) < 0.10;

		// Description
		const emotionTag = attackerMods && attackerMods.emotion !== 'calm'
			? ` [${attackerMods.emotion.toUpperCase()}]`
			: '';
		let desc = `${attacker.name} LANDS THE FINISHER ${move.name} for ${damage} damage!`;
		if (attacker.comebackActive) desc += ' [COMEBACK]';
		if (clutchCrit > 1.0) desc += ' [CLUTCH]';
		desc += emotionTag;

		return { damage, knockdownForced, description: desc };
	}

	/**
	 * Resolve a clash when both agents attack simultaneously.
	 * The agent with fewer windup frames wins (faster move).
	 * On ties, use a coin flip.
	 */
	resolveClash(
		agentA: AgentState,
		moveA: MoveDef,
		agentB: AgentState,
		moveB: MoveDef
	): { winnerId: string; loserId: string } {
		if (moveA.windupFrames < moveB.windupFrames) {
			return { winnerId: agentA.id, loserId: agentB.id };
		}
		if (moveB.windupFrames < moveA.windupFrames) {
			return { winnerId: agentB.id, loserId: agentA.id };
		}
		// Tie — coin flip
		if (this.rng.chance(0.5)) {
			return { winnerId: agentA.id, loserId: agentB.id };
		}
		return { winnerId: agentB.id, loserId: agentA.id };
	}
}
