import type { FighterStateId, FighterContext, FSMEvent } from './FighterStateId';

/**
 * Abstract base class for all fighter states.
 *
 * Lifecycle:
 *   enter(ctx)     — called once when transitioning INTO this state
 *   update(ctx,dt) — called once per tick while this state is active
 *   exit(ctx)      — called once when transitioning OUT of this state
 *   handleEvent()  — returns a new state ID if the event forces a transition
 *
 * Rules:
 *   - States must NOT import from rendering/ or ai/ (logic only)
 *   - States must NOT call Math.random() — all randomness via SeededRandom
 *   - States communicate outward ONLY by writing to ctx.pendingActions
 *   - States request transitions by returning a FighterStateId from update() or handleEvent()
 */
export abstract class FighterState {
	abstract readonly id: FighterStateId;

	/**
	 * Called once when this state is entered.
	 * Set up timers, flags, or emit actions here.
	 */
	abstract enter(ctx: FighterContext): void;

	/**
	 * Called once per simulation tick (1/60th of a second).
	 * @param ctx  Shared fighter context (mutable).
	 * @param dt   Always 1 (fixed timestep = 1 frame). Included for interface clarity.
	 * @returns    The next state ID to transition to, or null to stay in this state.
	 */
	abstract update(ctx: FighterContext, dt: number): FighterStateId | null;

	/**
	 * Called once when leaving this state (before the new state's enter()).
	 * Clean up timers or emit end-actions here.
	 */
	abstract exit(ctx: FighterContext): void;

	/**
	 * Handle an external event. The match loop pushes events into the FSM,
	 * and the FSM delegates to the current state's handleEvent().
	 *
	 * @returns  A new state ID if this event forces a transition, or null to ignore it.
	 *
	 * Default implementation: ignore all events (states override as needed).
	 */
	handleEvent(_ctx: FighterContext, _event: FSMEvent): FighterStateId | null {
		return null;
	}

	/**
	 * Whether this state can be interrupted by a stun event.
	 * Override to return false for immune states (KNOCKED_DOWN, GETTING_UP).
	 */
	get interruptibleByStun(): boolean {
		return true;
	}

	/**
	 * Whether this state can be interrupted by a knockdown event.
	 * Override to return false for immune states (GETTING_UP).
	 */
	get interruptibleByKnockdown(): boolean {
		return true;
	}
}
