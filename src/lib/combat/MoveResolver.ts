import type { MoveDef } from './MoveRegistry';
import type { SeededRandom } from '../utils/random';

/**
 * Result of a priority check between two simultaneous moves.
 */
export interface PriorityResult {
	/** Which side wins priority: 'a', 'b', or 'trade' if simultaneous. */
	winner: 'a' | 'b' | 'trade';
	/** Explanation of why this side won priority. */
	reason: string;
}

/**
 * Result of a trade (both moves connect simultaneously).
 */
export interface TradeResult {
	/** Damage dealt by move A (to B). */
	damageToB: number;
	/** Damage dealt by move B (to A). */
	damageToA: number;
	/** Whether both fighters are stunned after the trade. */
	bothStunned: boolean;
	/** Momentum change for A. */
	momentumDeltaA: number;
	/** Momentum change for B. */
	momentumDeltaB: number;
}

/**
 * Determine which of two simultaneous moves has priority.
 *
 * Priority rules (in order):
 * 1. Shorter windup wins (faster move lands first).
 * 2. If equal windup, the move with more active frames wins (more commitment).
 * 3. If still tied, it's a trade (both connect).
 *
 * Strikes beat grapple attempts (grapples have longer windup).
 * Grapples beat submissions (submissions need setup).
 *
 * @param moveA - First move definition.
 * @param moveB - Second move definition.
 * @returns PriorityResult indicating which move wins.
 */
export function priorityCheck(moveA: MoveDef, moveB: MoveDef): PriorityResult {
	// Rule 1: Shorter windup wins
	if (moveA.windupFrames < moveB.windupFrames) {
		return {
			winner: 'a',
			reason: `${moveA.name} has faster startup (${moveA.windupFrames} < ${moveB.windupFrames})`
		};
	}
	if (moveB.windupFrames < moveA.windupFrames) {
		return {
			winner: 'b',
			reason: `${moveB.name} has faster startup (${moveB.windupFrames} < ${moveA.windupFrames})`
		};
	}

	// Rule 2: Equal windup — more active frames wins (more commitment = more priority)
	if (moveA.activeFrames > moveB.activeFrames) {
		return {
			winner: 'a',
			reason: `${moveA.name} has longer active window (${moveA.activeFrames} > ${moveB.activeFrames})`
		};
	}
	if (moveB.activeFrames > moveA.activeFrames) {
		return {
			winner: 'b',
			reason: `${moveB.name} has longer active window (${moveB.activeFrames} > ${moveA.activeFrames})`
		};
	}

	// Rule 3: Perfect tie — trade
	return {
		winner: 'trade',
		reason: `${moveA.name} and ${moveB.name} traded (identical frame data)`
	};
}

/**
 * Check if a defender can counter/reverse an attack based on timing.
 *
 * The counter window is the period during the attacker's windup phase
 * where a well-timed defensive action can interrupt the attack.
 *
 * @param attackerMove - The move being executed by the attacker.
 * @param defenderInputFrame - The frame the defender pressed the counter input, relative to the attacker's move start.
 * @returns True if the counter timing is valid.
 */
export function canCounter(
	attackerMove: MoveDef,
	defenderInputFrame: number
): boolean {
	if (!attackerMove.canBeReversed) return false;
	if (attackerMove.reversalWindow <= 0) return false;

	// The reversal window opens at the end of windup and extends into early active frames.
	// defenderInputFrame is relative to the move start (0 = move just started).
	const windowStart = attackerMove.windupFrames - Math.floor(attackerMove.reversalWindow / 2);
	const windowEnd = attackerMove.windupFrames + Math.ceil(attackerMove.reversalWindow / 2);

	return defenderInputFrame >= windowStart && defenderInputFrame <= windowEnd;
}

/**
 * Check if a move can be reversed and whether the reverser has enough stamina.
 *
 * @param move - The move to check reversibility for.
 * @param reverserStamina - Current stamina of the entity attempting the reversal.
 * @param minStaminaThreshold - Minimum stamina required to attempt a reversal. Default 10.
 * @returns True if the move is reversible and the reverser has enough stamina.
 */
export function canReverse(
	move: MoveDef,
	reverserStamina: number,
	minStaminaThreshold: number = 10
): boolean {
	if (!move.canBeReversed) return false;
	if (move.reversalWindow <= 0) return false;
	if (reverserStamina < minStaminaThreshold) return false;

	return true;
}

/**
 * Compute the result of a trade (both moves connect simultaneously).
 *
 * In a trade, both fighters take damage, but the stronger move
 * deals relatively more damage. Both are stunned briefly.
 *
 * @param moveA - Move executed by fighter A.
 * @param moveB - Move executed by fighter B.
 * @param random - Seeded RNG for variance.
 * @returns TradeResult with damage and stun outcomes.
 */
export function tradeResult(
	moveA: MoveDef,
	moveB: MoveDef,
	random: SeededRandom
): TradeResult {
	// Trade damage is reduced (70-90% of base) because neither lands cleanly
	const tradeModA = random.float(0.7, 0.9);
	const tradeModB = random.float(0.7, 0.9);

	const damageToB = Math.round(moveA.baseDamage * tradeModA);
	const damageToA = Math.round(moveB.baseDamage * tradeModB);

	// Both fighters are stunned after a trade
	const bothStunned = true;

	// Momentum: the winner of the trade (more damage) gets momentum, the loser loses some
	const momentumDeltaA = damageToB > damageToA
		? moveA.momentumGain * 0.5
		: -moveA.momentumGain * 0.25;
	const momentumDeltaB = damageToA > damageToB
		? moveB.momentumGain * 0.5
		: -moveB.momentumGain * 0.25;

	return {
		damageToB,
		damageToA,
		bothStunned,
		momentumDeltaA,
		momentumDeltaB
	};
}

/**
 * Calculate the total frame count for a move (windup + active + recovery).
 */
export function totalMoveFrames(move: MoveDef): number {
	return move.windupFrames + move.activeFrames + move.recoveryFrames;
}

/**
 * Determine if one move can interrupt another based on frame advantage.
 * A move can interrupt if it can complete its windup before the opponent
 * finishes their recovery.
 *
 * @param interrupterMove - The move attempting to interrupt.
 * @param targetRecoveryFramesLeft - Remaining recovery frames of the target.
 * @returns True if the interrupter can land before recovery ends.
 */
export function canInterrupt(
	interrupterMove: MoveDef,
	targetRecoveryFramesLeft: number
): boolean {
	return interrupterMove.windupFrames < targetRecoveryFramesLeft;
}
