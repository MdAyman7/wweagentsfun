import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * FINISHER_SETUP — the attacker's wind-up phase for a cinematic finisher.
 *
 * Duration: 30-40 frames (0.5–0.67 seconds). Super armor — immune to stun
 * (cannot be interrupted by normal hits) but CAN be knocked down or countered.
 *
 * During this phase:
 *   - The attacker has super armor (interruptibleByStun = false)
 *   - The attacker can be knocked down (interruptibleByKnockdown = true)
 *   - The opponent is locked in FINISHER_LOCKED (set by match loop)
 *   - A counter-finisher check runs during the first 8 frames (match loop)
 *
 * Transitions OUT:
 *   - Timer expires            → FINISHER_IMPACT (finisher connects)
 *   - COUNTER_FINISHER         → STUNNED (counter-finisher succeeded!)
 *   - KNOCKDOWN                → KNOCKED_DOWN (rare — only if forced KD)
 *
 * The match loop caches impactFrames and recoveryFrames when REQUEST_FINISHER
 * is received, applying them at phase transitions.
 */
export class FinisherSetupState extends FighterState {
	readonly id: FighterStateId = 'FINISHER_SETUP';

	enter(ctx: FighterContext): void {
		// stateTimer set by the event that triggered REQUEST_FINISHER
		ctx.finisherActive = true;
		ctx.pendingActions.push({
			type: 'FINISHER_SETUP_START',
			moveId: ctx.activeMoveId!,
			setupFrames: ctx.stateTimer
		});
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			return 'FINISHER_IMPACT';
		}
		return null;
	}

	exit(_ctx: FighterContext): void {
		// finisherActive cleared in FINISHER_IMPACT.exit() or on counter
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'COUNTER_FINISHER':
				// Counter-finisher succeeded — attacker gets stunned
				ctx.finisherActive = false;
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.stunFrames;
				ctx.pendingActions.push({
					type: 'FINISHER_COUNTERED',
					attackerId: ctx.fighterId
				});
				return 'STUNNED';

			case 'KNOCKDOWN':
				// Rare but possible (forced knockdown)
				ctx.finisherActive = false;
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			case 'HIT_RECEIVED':
				// Super armor — ignore stun from normal hits
				return null;

			default:
				return null;
		}
	}

	/** Super armor: immune to stun during finisher setup. */
	get interruptibleByStun(): boolean {
		return false;
	}

	/** Can be knocked down (but this is extremely rare during finisher). */
	get interruptibleByKnockdown(): boolean {
		return true;
	}
}
