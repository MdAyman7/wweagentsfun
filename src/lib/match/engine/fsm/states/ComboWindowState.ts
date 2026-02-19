import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * COMBO_WINDOW — brief window after attack recovery where the next combo hit can be queued.
 *
 * This state is the core of the combo chaining system. After ATTACK_RECOVERY,
 * if the match loop determines a combo chain is available, it sets
 * ctx.comboWindowPending = true and the recovery state transitions here
 * instead of IDLE.
 *
 * During COMBO_WINDOW:
 *   - The fighter is briefly vulnerable (can be hit/knocked down)
 *   - REQUEST_COMBO_ATTACK queues the next move → ATTACK_WINDUP (chain continues)
 *   - Timer expiration → IDLE (combo dropped, window closed)
 *   - Getting hit → STUNNED (combo broken)
 *   - Knockdown → KNOCKED_DOWN (combo broken)
 *
 * The combo window duration comes from the ComboStep.windowFrames
 * (typically 12–18 frames = 0.2–0.3 seconds).
 *
 * Transitions OUT:
 *   - REQUEST_COMBO_ATTACK → ATTACK_WINDUP (combo chain!)
 *   - Timer expires         → IDLE
 *   - HIT_RECEIVED          → STUNNED (combo broken)
 *   - KNOCKDOWN             → KNOCKED_DOWN (combo broken)
 */
export class ComboWindowState extends FighterState {
	readonly id: FighterStateId = 'COMBO_WINDOW';

	enter(ctx: FighterContext): void {
		// stateTimer is set by AttackRecoveryState or the FSM transition
		// to ctx.comboWindowFrames before entering this state
		ctx.pendingActions.push({ type: 'COMBO_WINDOW_OPENED' });
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			// Window expired — combo dropped
			ctx.pendingActions.push({ type: 'COMBO_WINDOW_EXPIRED' });
			return 'IDLE';
		}
		return null;
	}

	exit(ctx: FighterContext): void {
		// Clear combo window pending flags
		ctx.comboWindowPending = false;
		ctx.comboWindowFrames = 0;
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'REQUEST_COMBO_ATTACK':
				// Chain the combo! Skip the anti-spam cooldown.
				ctx.activeMoveId = event.moveId;
				ctx.stateTimer = event.windupFrames;
				ctx.pendingActions.push({ type: 'COMBO_CHAINED', moveId: event.moveId });
				return 'ATTACK_WINDUP';

			case 'HIT_RECEIVED':
				// Got hit during combo window — combo broken!
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
				return null;
		}
	}
}
