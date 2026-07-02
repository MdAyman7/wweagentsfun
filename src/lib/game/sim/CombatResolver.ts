import type { Fighter, MoveDef } from './types.ts';
import type { Rng } from './rng.ts';
import { clamp, clamp01, statFrac } from './util.ts';

export type HitResult = 'hit' | 'blocked' | 'dodged' | 'reversed' | 'missed';

export interface CombatOutcome {
	result: HitResult;
	/** Damage to apply to the DEFENDER (0 for reversed/dodged/missed). */
	damage: number;
	/** On a reversal, damage dealt back to the ATTACKER. */
	reversalDamage: number;
	critical: boolean;
}

const str = (f: Fighter): number => f.def.stats.strength;
const tech = (f: Fighter): number => f.def.stats.technique;
const spd = (f: Fighter): number => f.def.stats.speed;
const staminaFrac = (f: Fighter): number => clamp01(f.stamina / f.maxStamina);

/** Chance the defender reverses a telegraphed move (reactive). */
function reversalChance(defender: Fighter, attacker: Fighter, move: MoveDef): number {
	if (defender.stance !== 'standing') return 0;
	const a = defender.action;
	if (a && a !== 'idle' && a !== 'approach' && a !== 'retreat') return 0;
	const base = 0.04 + statFrac(tech(defender)) * 0.18 * (1 - move.reverseResist);
	const fatiguePenalty = 0.4 + staminaFrac(defender) * 0.6;
	const momPenalty = 1 - attacker.momentum / 320;
	return clamp(base * fatiguePenalty * momPenalty, 0, 0.32);
}

function computeDamage(
	attacker: Fighter, defender: Fighter, move: MoveDef, rng: Rng
): { dmg: number; crit: boolean } {
	const strengthScale = 0.75 + statFrac(str(attacker)) * 0.5; // 0.75..1.25
	const staminaScale = 0.65 + staminaFrac(attacker) * 0.35; // tired = weaker
	const comboScale = 1 + Math.min(attacker.comboCount, 5) * 0.06;
	const limbScale = 1 + defender.limb[move.region] / 100 * 0.4; // worn region takes more
	const critChance = 0.06 + statFrac(tech(attacker)) * 0.1 + attacker.momentum / 100 * 0.05;
	const crit = rng.chance(critChance);
	const critMul = crit ? 1.45 : 1;
	const variance = rng.range(0.9, 1.1);
	// Global scale so matches last minutes (finishers/pins decide, not raw HP).
	const DAMAGE_SCALE = 0.33;
	const dmg = move.damage * strengthScale * staminaScale * comboScale * limbScale * critMul * variance * DAMAGE_SCALE;
	return { dmg: Math.max(1, Math.round(dmg)), crit };
}

/**
 * Resolve an attacker's active move against the defender's current state.
 * Pure — returns the outcome; the sim applies mutations and logs.
 */
export function resolveAttack(attacker: Fighter, defender: Fighter, move: MoveDef, rng: Rng): CombatOutcome {
	const helpless =
		defender.stance === 'down' ||
		defender.stance === 'getting_up' ||
		defender.stance === 'pinned' ||
		defender.stance === 'submission';

	if (!helpless) {
		if (defender.action === 'block') {
			const { dmg } = computeDamage(attacker, defender, move, rng);
			return { result: 'blocked', damage: Math.max(1, Math.round(dmg * 0.28)), reversalDamage: 0, critical: false };
		}
		if (defender.action === 'dodge') {
			const dodgeP = clamp(0.5 + (spd(defender) - spd(attacker)) / 220 + statFrac(spd(defender)) * 0.15, 0.2, 0.9);
			if (rng.chance(dodgeP)) {
				return { result: 'dodged', damage: 0, reversalDamage: 0, critical: false };
			}
		}
		if (rng.chance(reversalChance(defender, attacker, move))) {
			const rev = computeDamage(defender, attacker, move, rng);
			return { result: 'reversed', damage: 0, reversalDamage: Math.max(1, Math.round(rev.dmg * 0.55)), critical: false };
		}
	}

	const { dmg, crit } = computeDamage(attacker, defender, move, rng);
	return { result: 'hit', damage: dmg, reversalDamage: 0, critical: crit };
}
