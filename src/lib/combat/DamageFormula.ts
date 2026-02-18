import type { MoveCategory, BodyRegion } from '../utils/types';
import type { SeededRandom } from '../utils/random';
import { clamp } from '../utils/math';

/**
 * Damage region vulnerability levels.
 * Higher accumulated damage on a region means more vulnerability.
 */
export interface RegionDamageState {
	head: number;
	body: number;
	legs: number;
}

/**
 * Result of a damage calculation.
 */
export interface DamageResult {
	/** Final computed damage after all modifiers. */
	finalDamage: number;
	/** Whether this was a critical hit. */
	isCritical: boolean;
	/** Breakdown of modifiers for debugging. */
	breakdown: {
		baseDamage: number;
		staminaModifier: number;
		regionModifier: number;
		categoryModifier: number;
		personalityModifier: number;
		criticalMultiplier: number;
	};
}

/**
 * Category-based damage modifiers.
 * Some move categories inherently deal more or less damage.
 */
const CATEGORY_MODIFIERS: Record<MoveCategory, number> = {
	strike: 1.0,
	grapple: 1.1,
	aerial: 1.25,
	submission: 0.5, // Submission damage is per-tick, so base is low
	signature: 1.4,
	finisher: 1.6
};

/**
 * Base critical hit chance by category.
 * Riskier moves have a higher crit chance.
 */
const CATEGORY_CRIT_CHANCE: Record<MoveCategory, number> = {
	strike: 0.05,
	grapple: 0.03,
	aerial: 0.12,
	submission: 0.0, // Submissions don't crit
	signature: 0.10,
	finisher: 0.15
};

/**
 * Critical hit damage multiplier.
 */
const CRITICAL_MULTIPLIER = 1.5;

/**
 * Calculate the damage a move deals.
 *
 * Formula:
 *   finalDamage = baseDamage
 *     * staminaModifier     (exhaustion penalty: lower stamina = weaker hits)
 *     * regionModifier      (targeting already-damaged regions does more)
 *     * categoryModifier    (aerial/finisher moves hit harder)
 *     * personalityModifier (external modifier from personality/style)
 *     * criticalMultiplier  (random chance based on category + RNG)
 *
 * @param baseDamage - The move's base damage value.
 * @param attackerStamina - Attacker's current stamina (0-100).
 * @param attackerMaxStamina - Attacker's maximum stamina.
 * @param defenderDamageRegion - Accumulated damage on defender's body regions.
 * @param moveCategory - The category of the move being used.
 * @param targetRegion - Which body region the move targets.
 * @param personalityMultiplier - External personality-based multiplier (default 1.0).
 * @param random - Seeded RNG for critical hit rolls and variance.
 * @returns Complete DamageResult with final damage and breakdown.
 */
export function calculateDamage(
	baseDamage: number,
	attackerStamina: number,
	attackerMaxStamina: number,
	defenderDamageRegion: RegionDamageState,
	moveCategory: MoveCategory,
	targetRegion: BodyRegion,
	personalityMultiplier: number = 1.0,
	random: SeededRandom
): DamageResult {
	// ── Stamina modifier ──
	// Full stamina = 1.0x, below exhaustion threshold = significant penalty
	const staminaPct = clamp(attackerStamina / (attackerMaxStamina || 100), 0, 1);
	// Gentle curve: damage scales down as stamina drops, with a floor at 0.4x
	const staminaModifier = 0.4 + staminaPct * 0.6;

	// ── Region vulnerability modifier ──
	// Targeting an already-damaged region deals more damage (up to 1.5x)
	const regionDamage = defenderDamageRegion[targetRegion] ?? 0;
	// Damage accumulation 0-100 maps to modifier 1.0-1.5
	const regionModifier = 1.0 + clamp(regionDamage / 100, 0, 1) * 0.5;

	// ── Category modifier ──
	const categoryModifier = CATEGORY_MODIFIERS[moveCategory] ?? 1.0;

	// ── Critical hit check ──
	const baseCritChance = CATEGORY_CRIT_CHANCE[moveCategory] ?? 0.05;
	// Higher region damage increases crit chance slightly (weakened areas = easier to land clean)
	const adjustedCritChance = clamp(baseCritChance + regionDamage * 0.001, 0, 0.3);
	const isCritical = random.chance(adjustedCritChance);
	const criticalMultiplier = isCritical ? CRITICAL_MULTIPLIER : 1.0;

	// ── Small variance ──
	// +/- 10% variance for natural-feeling damage
	const variance = random.float(0.9, 1.1);

	// ── Final calculation ──
	const rawDamage = baseDamage
		* staminaModifier
		* regionModifier
		* categoryModifier
		* personalityMultiplier
		* criticalMultiplier
		* variance;

	// Round and floor at 1 (moves always do at least 1 damage)
	const finalDamage = Math.max(1, Math.round(rawDamage));

	return {
		finalDamage,
		isCritical,
		breakdown: {
			baseDamage,
			staminaModifier: Math.round(staminaModifier * 1000) / 1000,
			regionModifier: Math.round(regionModifier * 1000) / 1000,
			categoryModifier,
			personalityModifier: personalityMultiplier,
			criticalMultiplier
		}
	};
}

/**
 * Calculate submission damage per tick.
 * Submissions deal continuous low damage that increases as the hold is maintained.
 *
 * @param baseDamagePerTick - Base per-tick damage of the submission move.
 * @param holdDuration - How many ticks the hold has been maintained.
 * @param defenderStamina - Defender's current stamina (lower = more damage taken).
 * @param defenderMaxStamina - Defender's max stamina.
 * @param targetRegion - Which region the submission targets.
 * @param defenderDamageRegion - Current region damage state of defender.
 * @returns Damage to apply this tick.
 */
export function calculateSubmissionDamage(
	baseDamagePerTick: number,
	holdDuration: number,
	defenderStamina: number,
	defenderMaxStamina: number,
	targetRegion: BodyRegion,
	defenderDamageRegion: RegionDamageState
): number {
	// Damage increases over time as the hold sinks in
	const durationModifier = 1.0 + Math.min(holdDuration * 0.02, 1.0);

	// Lower defender stamina = more damage
	const staminaPct = clamp(defenderStamina / (defenderMaxStamina || 100), 0, 1);
	const staminaVulnerability = 1.0 + (1 - staminaPct) * 0.5;

	// Region vulnerability
	const regionDamage = defenderDamageRegion[targetRegion] ?? 0;
	const regionModifier = 1.0 + clamp(regionDamage / 100, 0, 1) * 0.3;

	return Math.max(1, Math.round(baseDamagePerTick * durationModifier * staminaVulnerability * regionModifier));
}

/**
 * Calculate the chance of a submission tap-out.
 * This is checked each tick while a submission is held.
 *
 * @param holdDuration - Ticks the hold has been active.
 * @param defenderHealth - Defender's current health (0-100).
 * @param defenderStamina - Defender's current stamina (0-100).
 * @param targetRegionDamage - Accumulated damage on the targeted region (0-100).
 * @returns Probability of tap-out this tick (0-1).
 */
export function calculateTapOutChance(
	holdDuration: number,
	defenderHealth: number,
	defenderStamina: number,
	targetRegionDamage: number
): number {
	// Base chance is very low and increases with hold duration
	const durationFactor = Math.min(holdDuration * 0.003, 0.15);

	// Low health significantly increases tap chance
	const healthFactor = Math.max(0, (1 - defenderHealth / 100)) * 0.15;

	// Low stamina increases tap chance
	const staminaFactor = Math.max(0, (1 - defenderStamina / 100)) * 0.1;

	// High region damage increases tap chance
	const regionFactor = clamp(targetRegionDamage / 100, 0, 1) * 0.1;

	return clamp(durationFactor + healthFactor + staminaFactor + regionFactor, 0, 0.6);
}
