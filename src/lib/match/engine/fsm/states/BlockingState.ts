import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * BLOCKING — active defensive stance.
 *
 * The fighter is guarding. Damage from incoming attacks is reduced.
 * The block has a maximum duration (timer-based) to prevent indefinite blocking.
 * Stamina drains while blocking.
 *
 * Transitions OUT:
 *   - Timer expires    → IDLE (block released)
 *   - REQUEST_IDLE     → IDLE (voluntary release)
 *   - HIT_RECEIVED     → STUNNED (guard broken by heavy hit)
 *   - KNOCKDOWN        → KNOCKED_DOWN
 *
 * The match loop applies damage reduction externally when the defender
 * is in BLOCKING state. The FSM itself doesn't modify health.
 */

/** Maximum blocking duration in frames (0.5 seconds). */
const MAX_BLOCK_FRAMES = 30;

/** Stamina drain per frame while blocking. */
const BLOCK_STAMINA_DRAIN = 0.3;

export class BlockingState extends FighterState {
	readonly id: FighterStateId = 'BLOCKING';

	enter(ctx: FighterContext): void {
		ctx.stateTimer = MAX_BLOCK_FRAMES;
		ctx.pendingActions.push({ type: 'BLOCK_START' });
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		ctx.stateTimer--;

		// Note: actual stamina mutation happens in the match loop.
		// We don't mutate health/stamina here; we just signal intent.

		if (ctx.stateTimer <= 0) {
			return 'IDLE';
		}
		return null;
	}

	exit(ctx: FighterContext): void {
		ctx.pendingActions.push({ type: 'BLOCK_END' });
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'REQUEST_IDLE':
				// Voluntary release
				return 'IDLE';

			case 'HIT_RECEIVED':
				// Guard broken — stunned
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

export { MAX_BLOCK_FRAMES, BLOCK_STAMINA_DRAIN };
