import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * MOVING — fighter is repositioning on the ring mat.
 *
 * Position updates are handled exclusively by the MovementController
 * in Phase 5 (runMovementPhase). This state does NOT mutate position.
 * It stays active until a new decision event arrives, or it is
 * interrupted by combat (hit/knockdown).
 *
 * Transitions OUT:
 *   - REQUEST_IDLE         → IDLE (decision cycle re-evaluates)
 *   - REQUEST_MOVE         → stays in MOVING (refresh target)
 *   - HIT_RECEIVED         → STUNNED (interruptible)
 *   - KNOCKDOWN            → KNOCKED_DOWN (interruptible)
 *   - REQUEST_ATTACK       → ATTACK_WINDUP (cancel movement to attack)
 *   - REQUEST_BLOCK        → BLOCKING (cancel movement to block)
 *
 * The MovementController is the sole authority for positionX writes.
 */

export class MovingState extends FighterState {
	readonly id: FighterStateId = 'MOVING';

	enter(ctx: FighterContext): void {
		ctx.pendingActions.push({
			type: 'MOVE_START',
			targetX: ctx.moveTargetX
		});
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		// Position updates are handled by MovementController (Phase 5).
		// This state simply stays active until an event transitions it out.

		// Count down attack cooldown (fighters can attack from moving state)
		if (ctx.attackCooldown > 0) {
			ctx.attackCooldown--;
		}

		ctx.pendingActions.push({ type: 'MOVE_TICK', positionX: ctx.positionX });
		return null;
	}

	exit(_ctx: FighterContext): void {
		// nothing to clean up
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'HIT_RECEIVED':
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'KNOCKDOWN':
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			case 'REVERSAL_RECEIVED':
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'REQUEST_ATTACK':
				if (ctx.attackCooldown > 0) return null;
				ctx.activeMoveId = event.moveId;
				ctx.stateTimer = event.windupFrames;
				return 'ATTACK_WINDUP';

			case 'REQUEST_COMBO_ATTACK':
				if (ctx.attackCooldown > 0) return null;
				ctx.activeMoveId = event.moveId;
				ctx.stateTimer = event.windupFrames;
				return 'ATTACK_WINDUP';

			case 'REQUEST_BLOCK':
				return 'BLOCKING';

			case 'REQUEST_IDLE':
				return 'IDLE';

			case 'REQUEST_MOVE':
				// Update target but stay in MOVING
				ctx.moveTargetX = event.targetX;
				return null;

			case 'FINISHER_LOCK':
				// Locked by opponent's finisher — cancel movement
				ctx.stateTimer = event.lockFrames;
				return 'FINISHER_LOCKED';

			case 'REQUEST_FINISHER':
				ctx.activeMoveId = event.moveId;
				ctx.stateTimer = event.setupFrames;
				return 'FINISHER_SETUP';

			default:
				return null;
		}
	}
}
