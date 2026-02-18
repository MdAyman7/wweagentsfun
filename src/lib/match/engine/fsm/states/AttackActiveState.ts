import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * ATTACK_ACTIVE — the hitbox-active phase where combat is resolved.
 *
 * During this phase, the match loop checks for collision and resolves damage.
 * The FSM emits ATTACK_LANDED when the phase completes naturally (the match
 * loop is responsible for actual hit/miss determination and dispatches
 * the result back as HIT_RECEIVED on the defender, or sets the attacker
 * to recovery).
 *
 * Duration comes from the move's activeFrames (set on ctx.stateTimer by FSM).
 *
 * Transitions OUT:
 *   - Timer expires         → ATTACK_RECOVERY
 *   - REVERSAL_RECEIVED     → STUNNED (defender reversed the move!)
 *   - KNOCKDOWN             → KNOCKED_DOWN
 *   - HIT_RECEIVED          → STUNNED (trading blows — rare)
 */
export class AttackActiveState extends FighterState {
	readonly id: FighterStateId = 'ATTACK_ACTIVE';

	enter(ctx: FighterContext): void {
		// stateTimer is set by the FSM when transitioning from WINDUP
		// (the FSM reads the move's activeFrames from the stored event data)
		ctx.pendingActions.push({ type: 'ATTACK_LANDED' });
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			return 'ATTACK_RECOVERY';
		}
		return null;
	}

	exit(_ctx: FighterContext): void {
		// move data stays until ATTACK_RECOVERY clears it
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'REVERSAL_RECEIVED':
				// Our attack was reversed! We get stunned.
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'HIT_RECEIVED':
				// Trading blows — rare but possible if both are in active phase
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'KNOCKDOWN':
				ctx.activeMoveId = null;
				ctx.targetId = null;
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			default:
				return null;
		}
	}
}
