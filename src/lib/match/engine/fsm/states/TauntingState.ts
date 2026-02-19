import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * TAUNTING — the fighter plays to the crowd for a momentum boost.
 *
 * Taunting is a risk/reward mechanic:
 *   + Completing the taunt grants a momentum bonus
 *   - Getting hit during a taunt means extra stun (the opponent gets a free shot)
 *
 * Duration is set by the event that triggers the taunt (typically 30-60 frames).
 *
 * Transitions OUT:
 *   - Timer expires    → IDLE (taunt completes, momentum gained)
 *   - HIT_RECEIVED     → STUNNED (punished for showing off!)
 *   - KNOCKDOWN        → KNOCKED_DOWN
 */

/** Momentum gained from completing a full taunt. */
const TAUNT_MOMENTUM_GAIN = 15;

/** Stun duration multiplier when hit during a taunt (extra punishment). */
const TAUNT_STUN_MULTIPLIER = 1.5;

export class TauntingState extends FighterState {
	readonly id: FighterStateId = 'TAUNTING';

	enter(ctx: FighterContext): void {
		// stateTimer set by the event that triggered the taunt
		ctx.pendingActions.push({ type: 'TAUNT_START' });
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			// Taunt completed successfully — momentum boost
			ctx.pendingActions.push({
				type: 'TAUNT_END',
				momentumGain: TAUNT_MOMENTUM_GAIN
			});
			return 'IDLE';
		}
		return null;
	}

	exit(_ctx: FighterContext): void {
		// TAUNT_END is only emitted on successful completion (in update),
		// not on interruption.
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'HIT_RECEIVED':
				// Punished for taunting! Extra stun.
				ctx.stateTimer = Math.round(event.stunFrames * TAUNT_STUN_MULTIPLIER);
				return 'STUNNED';

			case 'KNOCKDOWN':
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			case 'REVERSAL_RECEIVED':
				ctx.stateTimer = Math.round(event.stunFrames * TAUNT_STUN_MULTIPLIER);
				return 'STUNNED';

			case 'FINISHER_LOCK':
				// Locked by opponent's finisher — taunt interrupted
				ctx.stateTimer = event.lockFrames;
				return 'FINISHER_LOCKED';

			default:
				return null;
		}
	}
}

export { TAUNT_MOMENTUM_GAIN, TAUNT_STUN_MULTIPLIER };
