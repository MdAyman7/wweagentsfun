import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * GETTING_UP — brief vulnerability window after a knockdown.
 *
 * The fighter is rising from the mat. This is a new state that didn't
 * exist in the old phase system (which went knockdown → idle instantly).
 *
 * During GETTING_UP:
 *   - The fighter cannot act (no attack/block/move/taunt)
 *   - Cannot be knocked down AGAIN (immune to re-knockdown, prevents infinite loop)
 *   - CAN be stunned (punished for slow recovery)
 *
 * This creates a strategic window: the opponent can time an attack
 * to catch the fighter mid-rise and stun them again.
 *
 * Transitions OUT:
 *   - Timer expires   → IDLE (fully recovered)
 *   - HIT_RECEIVED    → STUNNED (caught while getting up!)
 */
export class GettingUpState extends FighterState {
	readonly id: FighterStateId = 'GETTING_UP';

	enter(ctx: FighterContext): void {
		// stateTimer set by KnockedDownState when transitioning here
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
				// Caught while getting up!
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			// Immune to re-knockdown during getting up
			// (prevents infinite knockdown loops)
			case 'KNOCKDOWN':
				return null;

			default:
				return null;
		}
	}

	get interruptibleByStun(): boolean {
		return true; // vulnerable to stun
	}

	get interruptibleByKnockdown(): boolean {
		return false; // immune to re-knockdown
	}
}
