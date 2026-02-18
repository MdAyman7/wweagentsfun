import type { FighterStateId, FighterContext, FSMEvent, FSMAction } from './FighterStateId';
import { FighterState } from './FighterState';
import { IdleState } from './states/IdleState';
import { MovingState } from './states/MovingState';
import { AttackWindupState } from './states/AttackWindupState';
import { AttackActiveState } from './states/AttackActiveState';
import { AttackRecoveryState } from './states/AttackRecoveryState';
import { BlockingState } from './states/BlockingState';
import { StunnedState } from './states/StunnedState';
import { KnockedDownState } from './states/KnockedDownState';
import { GettingUpState } from './states/GettingUpState';
import { TauntingState } from './states/TauntingState';

/**
 * FighterStateMachine — the core FSM controller for one fighter.
 *
 * Owns:
 *   - The state registry (all 10 states, created once)
 *   - The current state pointer
 *   - The shared FighterContext
 *   - The pending event queue
 *
 * The match loop interacts with this class via:
 *   1. pushEvent(event)  — queue an external event (hit, knockdown, AI decision)
 *   2. update(dt)        — advance by one tick (processes events, runs state.update)
 *   3. drainActions()    — read and clear pending FSM actions for the match loop
 *
 * Transition protocol:
 *   - Events are processed BEFORE the state update
 *   - handleEvent() may return a new state → immediate transition
 *   - update() may return a new state → post-update transition
 *   - Transitions call: currentState.exit() → newState.enter()
 *   - A STATE_CHANGED action is emitted for every transition
 *
 * Move data flow for attacks:
 *   The FSM needs to know activeFrames and recoveryFrames for multi-phase
 *   attack sequences. These are stored from the REQUEST_ATTACK event and
 *   applied at phase transitions (WINDUP→ACTIVE, ACTIVE→RECOVERY).
 */
export class FighterStateMachine {
	private readonly states: Map<FighterStateId, FighterState>;
	private currentState: FighterState;
	private readonly ctx: FighterContext;
	private readonly eventQueue: FSMEvent[] = [];

	/** Cached move phase data for attack sequences. */
	private pendingActiveFrames = 0;
	private pendingRecoveryFrames = 0;

	constructor(fighterId: string, positionX: number) {
		// Create all 10 states
		this.states = new Map<FighterStateId, FighterState>([
			['IDLE', new IdleState()],
			['MOVING', new MovingState()],
			['ATTACK_WINDUP', new AttackWindupState()],
			['ATTACK_ACTIVE', new AttackActiveState()],
			['ATTACK_RECOVERY', new AttackRecoveryState()],
			['BLOCKING', new BlockingState()],
			['STUNNED', new StunnedState()],
			['KNOCKED_DOWN', new KnockedDownState()],
			['GETTING_UP', new GettingUpState()],
			['TAUNTING', new TauntingState()]
		]);

		// Create shared context
		this.ctx = {
			fighterId,
			stateTimer: 0,
			attackCooldown: 0,
			activeMoveId: null,
			targetId: null,
			moveTargetX: positionX,
			positionX,
			moveSpeed: 0.08, // units per frame (~4.8 units/second)
			comebackActive: false,
			knockdownCount: 0,
			pendingActions: []
		};

		// Start in IDLE
		this.currentState = this.states.get('IDLE')!;
		this.currentState.enter(this.ctx);
	}

	// ─── Public API ──────────────────────────────────────────────

	/** Current state identifier. */
	get stateId(): FighterStateId {
		return this.currentState.id;
	}

	/** Read-only access to the fighter context. */
	get context(): Readonly<FighterContext> {
		return this.ctx;
	}

	/** Remaining frames in the current state timer. */
	get stateTimer(): number {
		return this.ctx.stateTimer;
	}

	/** Current position on the ring mat. */
	get positionX(): number {
		return this.ctx.positionX;
	}

	/** Active move being executed (null if none). */
	get activeMoveId(): string | null {
		return this.ctx.activeMoveId;
	}

	/** Whether this fighter can currently accept an attack command. */
	get canAttack(): boolean {
		return this.currentState.id === 'IDLE' && this.ctx.attackCooldown <= 0;
	}

	/** Whether this fighter is in a state where AI decisions are accepted. */
	get acceptsInput(): boolean {
		return this.currentState.id === 'IDLE';
	}

	/** Total knockdowns this match. */
	get knockdownCount(): number {
		return this.ctx.knockdownCount;
	}

	// ─── Event Queue ─────────────────────────────────────────────

	/**
	 * Queue an external event to be processed on the next update().
	 * Events are processed in FIFO order.
	 */
	pushEvent(event: FSMEvent): void {
		// Cache attack phase data for multi-phase transitions
		if (event.type === 'REQUEST_ATTACK') {
			this.pendingActiveFrames = event.activeFrames;
			this.pendingRecoveryFrames = event.recoveryFrames;
		}
		this.eventQueue.push(event);
	}

	// ─── Tick ────────────────────────────────────────────────────

	/**
	 * Advance the FSM by one tick.
	 *
	 * Order of operations:
	 *   1. Process all queued events (may trigger transitions)
	 *   2. Run current state's update(ctx, dt)
	 *   3. If update returns a new state, transition
	 *
	 * @param dt  Always 1 for fixed timestep. Included for interface consistency.
	 */
	update(dt: number = 1): void {
		// 1. Process events
		while (this.eventQueue.length > 0) {
			const event = this.eventQueue.shift()!;
			const nextId = this.currentState.handleEvent(this.ctx, event);
			if (nextId !== null) {
				this.transition(nextId);
			}
		}

		// 2. Run state update
		const nextId = this.currentState.update(this.ctx, dt);

		// 3. Transition if needed
		if (nextId !== null) {
			this.transition(nextId);
		}
	}

	// ─── Action Drain ────────────────────────────────────────────

	/**
	 * Read and clear all pending actions emitted by the FSM this tick.
	 * The match loop calls this after update() to process FSM outputs.
	 */
	drainActions(): FSMAction[] {
		const actions = this.ctx.pendingActions.slice();
		this.ctx.pendingActions.length = 0;
		return actions;
	}

	// ─── Context Mutation (for match loop sync) ──────────────────

	/** Update comeback status from match state. */
	setComebackActive(active: boolean): void {
		this.ctx.comebackActive = active;
	}

	/** Sync position from external match state (e.g., after combat resolution). */
	setPositionX(x: number): void {
		this.ctx.positionX = x;
	}

	// ─── Internal ────────────────────────────────────────────────

	/**
	 * Execute a state transition.
	 *
	 * Protocol:
	 *   1. currentState.exit(ctx)
	 *   2. Emit STATE_CHANGED action
	 *   3. Set currentState to new state
	 *   4. Apply phase-specific timer overrides (attack chain)
	 *   5. newState.enter(ctx)
	 */
	private transition(nextId: FighterStateId): void {
		const nextState = this.states.get(nextId);
		if (!nextState) {
			throw new Error(`FighterStateMachine: unknown state '${nextId}'`);
		}

		const prevId = this.currentState.id;

		// Exit current
		this.currentState.exit(this.ctx);

		// Emit transition action
		this.ctx.pendingActions.push({
			type: 'STATE_CHANGED',
			from: prevId,
			to: nextId
		});

		// Update pointer
		this.currentState = nextState;

		// ── Attack chain timer overrides ──
		// When transitioning through the attack pipeline, apply the correct
		// phase durations from the cached move data.
		if (prevId === 'ATTACK_WINDUP' && nextId === 'ATTACK_ACTIVE') {
			this.ctx.stateTimer = this.pendingActiveFrames;
		}
		if ((prevId === 'ATTACK_ACTIVE' || prevId === 'ATTACK_WINDUP') && nextId === 'ATTACK_RECOVERY') {
			this.ctx.stateTimer = this.pendingRecoveryFrames;
		}

		// Enter new state
		this.currentState.enter(this.ctx);
	}

	// ─── Debug ───────────────────────────────────────────────────

	/**
	 * Debug snapshot for logging and testing.
	 */
	toDebugString(): string {
		return `[FSM ${this.ctx.fighterId}] state=${this.currentState.id} timer=${this.ctx.stateTimer} cooldown=${this.ctx.attackCooldown} move=${this.ctx.activeMoveId ?? 'none'} pos=${this.ctx.positionX.toFixed(2)}`;
	}
}
