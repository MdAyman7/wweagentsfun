import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';
import { ATTACK_COOLDOWN_FRAMES } from './IdleState';

/**
 * ATTACK_RECOVERY — post-attack recovery lag.
 *
 * The fighter is recovering from executing a move. Cannot attack or block.
 * Duration comes from MoveDef.recoveryFrames.
 *
 * When exiting to IDLE, sets the anti-spam cooldown so the fighter
 * can't immediately chain another attack.
 *
 * Transitions OUT:
 *   - Timer expires + combo pending → COMBO_WINDOW (combo chain continues)
 *   - Timer expires + no combo      → IDLE (with anti-spam cooldown applied)
 *   - HIT_RECEIVED                  → STUNNED (punished during recovery!)
 *   - KNOCKDOWN                     → KNOCKED_DOWN
 */
export class AttackRecoveryState extends FighterState {
	readonly id: FighterStateId = 'ATTACK_RECOVERY';

	enter(ctx: FighterContext): void {
		// stateTimer set by FSM from move's recoveryFrames
		// Clear the active move — the attack phase is over
		ctx.activeMoveId = null;
		ctx.targetId = null;
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;
		if (ctx.stateTimer <= 0) {
			// If a combo window is pending, transition to COMBO_WINDOW
			// instead of IDLE (the match loop sets this flag during combat resolution)
			if (ctx.comboWindowPending && ctx.comboWindowFrames > 0) {
				return 'COMBO_WINDOW';
			}
			return 'IDLE';
		}
		return null;
	}

	exit(ctx: FighterContext): void {
		// Set anti-spam cooldown so next attack requires a brief pause
		// (COMBO_WINDOW will clear this on its own if chaining)
		ctx.attackCooldown = ATTACK_COOLDOWN_FRAMES;
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

			default:
				return null;
		}
	}
}
