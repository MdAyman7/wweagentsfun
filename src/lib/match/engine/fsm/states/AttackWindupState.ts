import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * ATTACK_WINDUP — the wind-up phase before a move becomes active.
 *
 * The fighter is telegraphing their attack. Duration comes from MoveDef.windupFrames.
 * ctx.stateTimer counts down to 0, then transitions to ATTACK_ACTIVE.
 *
 * This is an interruptible phase: getting hit during windup cancels the attack
 * and transitions to STUNNED.
 *
 * Transitions OUT:
 *   - Timer expires   → ATTACK_ACTIVE
 *   - HIT_RECEIVED    → STUNNED (attack interrupted!)
 *   - KNOCKDOWN       → KNOCKED_DOWN
 */
export class AttackWindupState extends FighterState {
	readonly id: FighterStateId = 'ATTACK_WINDUP';

	enter(ctx: FighterContext): void {
		// stateTimer already set by the event handler that triggered this transition
		ctx.pendingActions.push({
			type: 'ENTER_ATTACK',
			moveId: ctx.activeMoveId!,
			windupFrames: ctx.stateTimer
		});
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			return 'ATTACK_ACTIVE';
		}
		return null;
	}

	exit(_ctx: FighterContext): void {
		// nothing — active move stays set for ATTACK_ACTIVE to use
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'HIT_RECEIVED':
				// Attack interrupted! Move is cancelled.
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'KNOCKDOWN':
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			case 'REVERSAL_RECEIVED':
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			default:
				return null; // can't cancel windup voluntarily
		}
	}
}
