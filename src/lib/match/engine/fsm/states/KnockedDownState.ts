import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * KNOCKED_DOWN — the fighter is on the mat.
 *
 * This is a hard control state: cannot be interrupted by any event.
 * Duration is typically 120 frames (2 seconds) but can vary.
 *
 * Unlike the old system where knockdown → idle directly, this FSM
 * adds a GETTING_UP intermediate state for the rising vulnerability window.
 *
 * Transitions OUT:
 *   - Timer expires → GETTING_UP (not directly to IDLE)
 *
 * Immune to all interrupts. Cannot be stunned or knocked down again
 * while already on the mat.
 */

/** Default knockdown duration in frames (2 seconds at 60fps). */
const DEFAULT_KNOCKDOWN_FRAMES = 120;

/** Frames for the GETTING_UP phase after knockdown. */
const GETTING_UP_FRAMES = 24;

export class KnockedDownState extends FighterState {
	readonly id: FighterStateId = 'KNOCKED_DOWN';

	enter(ctx: FighterContext): void {
		// stateTimer set by the event that triggered the knockdown
		if (ctx.stateTimer <= 0) {
			ctx.stateTimer = DEFAULT_KNOCKDOWN_FRAMES;
		}
		ctx.knockdownCount++;
		ctx.activeMoveId = null;
		ctx.targetId = null;
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			// Transition to getting-up phase (not directly to idle)
			ctx.stateTimer = GETTING_UP_FRAMES;
			return 'GETTING_UP';
		}
		return null;
	}

	exit(_ctx: FighterContext): void {
		// nothing to clean up
	}

	/**
	 * KNOCKED_DOWN is fully immune to interrupts.
	 * All events are ignored while on the mat.
	 */
	handleEvent(_ctx: FighterContext, _event: FSMEvent): FighterStateId | null {
		return null;
	}

	get interruptibleByStun(): boolean {
		return false;
	}

	get interruptibleByKnockdown(): boolean {
		return false;
	}
}

export { DEFAULT_KNOCKDOWN_FRAMES, GETTING_UP_FRAMES };
