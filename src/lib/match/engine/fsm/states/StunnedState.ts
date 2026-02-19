import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * STUNNED — the fighter is dazed and unable to act.
 *
 * Entered when hit by an attack. Duration depends on the move's damage
 * and is calculated externally (stunFrames = 6 + damage * 0.8).
 *
 * During stun, the fighter cannot attack, block, move, or taunt.
 * Stamina regenerates at a reduced rate (handled by match loop).
 *
 * Transitions OUT:
 *   - Timer expires    → IDLE (recovered from stun)
 *   - KNOCKDOWN        → KNOCKED_DOWN (escalation — hit again while stunned)
 *   - HIT_RECEIVED     → STUNNED (refresh stun timer — stun chain)
 *
 * Can be interrupted by KNOCKDOWN (but NOT by voluntary actions).
 */
export class StunnedState extends FighterState {
	readonly id: FighterStateId = 'STUNNED';

	enter(ctx: FighterContext): void {
		// stateTimer set by the event that triggered the transition
		ctx.activeMoveId = null;
		ctx.targetId = null;
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			return 'IDLE';
		}
		return null;
	}

	exit(_ctx: FighterContext): void {
		// nothing to clean up
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'HIT_RECEIVED':
				// Refresh stun — stun-locked
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED'; // re-enter (triggers exit+enter cycle)

			case 'KNOCKDOWN':
				// Escalation
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			case 'FINISHER_LOCK':
				// Locked by opponent's finisher while stunned
				ctx.stateTimer = event.lockFrames;
				return 'FINISHER_LOCKED';

			default:
				// Ignore voluntary actions while stunned
				return null;
		}
	}
}
