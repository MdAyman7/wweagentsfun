import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * MOVING — fighter is repositioning on the ring mat.
 *
 * Moves toward ctx.moveTargetX at ctx.moveSpeed per frame.
 * Transitions to IDLE when the target is reached (within tolerance).
 *
 * Transitions OUT:
 *   - Target reached      → IDLE
 *   - HIT_RECEIVED        → STUNNED (interruptible)
 *   - KNOCKDOWN           → KNOCKED_DOWN (interruptible)
 *   - REQUEST_ATTACK      → ATTACK_WINDUP (cancel movement to attack)
 *   - REQUEST_BLOCK       → BLOCKING (cancel movement to block)
 *
 * Movement is purely positional (X-axis on ring mat). No physics sim.
 */

const POSITION_TOLERANCE = 0.05;

export class MovingState extends FighterState {
	readonly id: FighterStateId = 'MOVING';

	enter(ctx: FighterContext): void {
		ctx.pendingActions.push({
			type: 'MOVE_START',
			targetX: ctx.moveTargetX
		});
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		const dx = ctx.moveTargetX - ctx.positionX;
		const absDx = Math.abs(dx);

		if (absDx <= POSITION_TOLERANCE) {
			// Arrived
			ctx.positionX = ctx.moveTargetX;
			ctx.pendingActions.push({ type: 'MOVE_TICK', positionX: ctx.positionX });
			return 'IDLE';
		}

		// Step toward target
		const step = Math.min(ctx.moveSpeed, absDx);
		ctx.positionX += dx > 0 ? step : -step;

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

			case 'REQUEST_BLOCK':
				return 'BLOCKING';

			default:
				return null;
		}
	}
}
