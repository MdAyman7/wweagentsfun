import { FighterState } from '../FighterState';
import type { FighterStateId, FighterContext, FSMEvent } from '../FighterStateId';

/**
 * IDLE — default resting state.
 *
 * The fighter stands ready, waiting for an AI decision.
 * Stamina regenerates at full rate. Momentum decays slowly.
 *
 * Transitions OUT:
 *   - REQUEST_ATTACK → ATTACK_WINDUP (if attackCooldown === 0)
 *   - REQUEST_BLOCK  → BLOCKING
 *   - REQUEST_MOVE   → MOVING
 *   - REQUEST_TAUNT  → TAUNTING
 *   - HIT_RECEIVED   → STUNNED
 *   - KNOCKDOWN      → KNOCKED_DOWN
 *
 * Anti-spam: attackCooldown counts down each frame. Attack requests
 * are rejected until cooldown reaches 0.
 */

/** Minimum frames between attacks (anti-spam). */
const ATTACK_COOLDOWN_FRAMES = 6;

export class IdleState extends FighterState {
	readonly id: FighterStateId = 'IDLE';

	enter(ctx: FighterContext): void {
		ctx.activeMoveId = null;
		ctx.targetId = null;
		// Don't reset attackCooldown here — it's set by ATTACK_RECOVERY.exit()
		// If entering from a non-attack path, cooldown will already be 0.
	}

	update(ctx: FighterContext, _dt: number): FighterStateId | null {
		// Count down anti-spam cooldown
		if (ctx.attackCooldown > 0) {
			ctx.attackCooldown--;
		}
		return null; // stay idle until an event arrives
	}

	exit(_ctx: FighterContext): void {
		// nothing to clean up
	}

	handleEvent(ctx: FighterContext, event: FSMEvent): FighterStateId | null {
		switch (event.type) {
			case 'REQUEST_ATTACK':
				// Anti-spam gate
				if (ctx.attackCooldown > 0) return null;
				ctx.activeMoveId = event.moveId;
				ctx.stateTimer = event.windupFrames;
				// Stash active+recovery frames for later states to read
				// (stored via the FSM's event forwarding mechanism)
				return 'ATTACK_WINDUP';

			case 'REQUEST_BLOCK':
				return 'BLOCKING';

			case 'REQUEST_MOVE':
				ctx.moveTargetX = event.targetX;
				return 'MOVING';

			case 'REQUEST_TAUNT':
				ctx.stateTimer = event.durationFrames;
				return 'TAUNTING';

			case 'HIT_RECEIVED':
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'KNOCKDOWN':
				ctx.stateTimer = event.durationFrames;
				return 'KNOCKED_DOWN';

			case 'REVERSAL_RECEIVED':
				ctx.stateTimer = event.stunFrames;
				return 'STUNNED';

			case 'REQUEST_FINISHER':
				// Finisher request — enter the cinematic setup phase
				ctx.activeMoveId = event.moveId;
				ctx.stateTimer = event.setupFrames;
				return 'FINISHER_SETUP';

			case 'FINISHER_LOCK':
				// Locked by opponent's finisher
				ctx.stateTimer = event.lockFrames;
				return 'FINISHER_LOCKED';

			default:
				return null;
		}
	}
}

export { ATTACK_COOLDOWN_FRAMES };
