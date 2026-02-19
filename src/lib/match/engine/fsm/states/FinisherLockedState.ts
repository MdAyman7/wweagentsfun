import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * FINISHER_LOCKED — the defender is locked in a reaction state during an opponent's finisher.
 *
 * Duration: Matches the attacker's setup + impact duration (set by lockFrames).
 *
 * During this phase:
 *   - The defender cannot act (no attack/block/move/taunt)
 *   - The defender is fully immune to other hits (only the finisher can damage them)
 *   - The defender waits for either FINISHER_IMPACT_RECEIVED or FINISHER_COUNTER_SUCCESS
 *
 * Transitions OUT:
 *   - FINISHER_IMPACT_RECEIVED (knockdownForced=true)  → KNOCKED_DOWN
 *   - FINISHER_IMPACT_RECEIVED (knockdownForced=false) → STUNNED
 *   - FINISHER_COUNTER_SUCCESS                         → IDLE (freed!)
 *   - Timer expires (fallback safety)                  → STUNNED
 *
 * All other events are ignored during this phase.
 */
export class FinisherLockedState extends FighterState {
	readonly id: FighterStateId = 'FINISHER_LOCKED';

	enter(ctx: FighterContext): void {
		// stateTimer set by the FINISHER_LOCK event (lockFrames)
		ctx.activeMoveId = null;
		ctx.targetId = null;
		ctx.finisherLocked = true;
		ctx.pendingActions.push({ type: 'FINISHER_LOCKED' });
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			// Fallback safety: if we never received impact or counter,
			// transition to STUNNED with a short timer
			ctx.stateTimer = 18;
			return 'STUNNED';
		}
		return null;
	}

	exit(ctx: FighterContext): void {
		ctx.finisherLocked = false;
		ctx.finisherAttackerId = null;
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'FINISHER_IMPACT_RECEIVED':
				// Finisher landed — transition based on knockdown flag
				if (event.knockdownForced) {
					ctx.stateTimer = 120; // standard knockdown duration
					return 'KNOCKED_DOWN';
				}
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'FINISHER_COUNTER_SUCCESS':
				// Counter-finisher succeeded — defender is freed
				return 'IDLE';

			default:
				// Ignore all other events while locked
				return null;
		}
	}

	/** Fully immune to stun (only finisher impact can affect this fighter). */
	get interruptibleByStun(): boolean {
		return false;
	}

	/** Fully immune to knockdown (only finisher impact triggers KD). */
	get interruptibleByKnockdown(): boolean {
		return false;
	}
}
