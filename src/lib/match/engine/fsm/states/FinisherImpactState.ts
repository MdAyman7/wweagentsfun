import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * FINISHER_IMPACT — the impact phase where the finisher connects.
 *
 * Duration: 8-12 frames (0.13–0.2 seconds). Fully immune to ALL interrupts.
 *
 * During this phase:
 *   - The attacker is fully immune (cannot be stunned or knocked down)
 *   - Damage resolution occurs in the match loop (CombatResolver.resolveFinisher)
 *   - The impact event is dispatched to the defender's FSM (FINISHER_IMPACT_RECEIVED)
 *   - Cinematic freeze-frame and VFX are triggered by the presentation layer
 *
 * Transitions OUT:
 *   - Timer expires → ATTACK_RECOVERY (reuses normal attack recovery for finisher)
 *
 * All events are ignored during this phase.
 */
export class FinisherImpactState extends FighterState {
	readonly id: FighterStateId = 'FINISHER_IMPACT';

	enter(ctx: FighterContext): void {
		// stateTimer is set by the FSM transition override (pendingImpactFrames)
		ctx.pendingActions.push({
			type: 'FINISHER_IMPACT_START',
			moveId: ctx.activeMoveId!
		});
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			return 'ATTACK_RECOVERY';
		}
		return null;
	}

	exit(ctx: FighterContext): void {
		// Finisher sequence complete — clear the finisher flag
		ctx.finisherActive = false;
		ctx.pendingActions.push({
			type: 'FINISHER_COMPLETED',
			moveId: ctx.activeMoveId!
		});
	}

	/**
	 * FINISHER_IMPACT is fully immune to all events.
	 * Nothing can interrupt the impact moment.
	 */
	handleEvent(_ctx: FighterContext, _event: FSMEvent): FighterStateId | null {
		return null;
	}

	/** Fully immune to stun. */
	get interruptibleByStun(): boolean {
		return false;
	}

	/** Fully immune to knockdown. */
	get interruptibleByKnockdown(): boolean {
		return false;
	}
}
