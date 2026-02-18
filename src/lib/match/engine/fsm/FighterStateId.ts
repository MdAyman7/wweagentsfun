/**
 * Fighter State Machine — State Identifiers & Shared Context
 *
 * 10 discrete states. Only one active at a time per fighter.
 * All transitions are deterministic (driven by timers + game events, never Math.random).
 *
 * STATE DIAGRAM (text format):
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │                         IDLE (default)                             │
 *   │  ← recovery timer expires                                          │
 *   │  ← getting_up timer expires                                        │
 *   │  ← taunt timer expires                                             │
 *   │  ← block released                                                  │
 *   └────┬──────┬──────┬──────┬──────────────────────────────────────────┘
 *        │      │      │      │
 *        ▼      │      │      ▼
 *   MOVING      │      │   TAUNTING
 *   (approach   │      │   (momentum buff,
 *    or retreat)│      │    timer-based)
 *   returns to  │      │   returns to IDLE
 *   IDLE when   │      │
 *   arrived     │      ▼
 *        │    BLOCKING
 *        │    (active while held,
 *        │     reduces damage,
 *        │     drains stamina)
 *        │    returns to IDLE
 *        │
 *        ▼
 *   ATTACK_WINDUP ──timer──▶ ATTACK_ACTIVE ──timer──▶ ATTACK_RECOVERY ──timer──▶ IDLE
 *        │                        │                         │
 *        │ (interrupted by        │ (combat resolves        │
 *        │  stun/knockdown)       │  in this phase)         │
 *        ▼                        ▼                         ▼
 *   STUNNED ◀──── hit by attack ─────────────────────────────
 *   (timer-based, can't act)
 *   returns to IDLE
 *        │
 *        │ (big hit or low health)
 *        ▼
 *   KNOCKED_DOWN ──timer──▶ GETTING_UP ──timer──▶ IDLE
 *   (2 second count)         (brief vulnerability window)
 *
 * INTERRUPTION RULES:
 *   - ATTACK_WINDUP can be interrupted by STUNNED or KNOCKED_DOWN
 *   - ATTACK_ACTIVE can be interrupted by STUNNED (reversal) or KNOCKED_DOWN
 *   - BLOCKING can be interrupted by STUNNED or KNOCKED_DOWN
 *   - MOVING can be interrupted by any combat state
 *   - TAUNTING can be interrupted by STUNNED or KNOCKED_DOWN (risky!)
 *   - STUNNED can be interrupted by KNOCKED_DOWN (escalation)
 *   - KNOCKED_DOWN and GETTING_UP can NOT be interrupted (immune)
 *   - ATTACK_RECOVERY can be interrupted by STUNNED or KNOCKED_DOWN
 *
 * ANTI-SPAM:
 *   - IDLE enforces a minimum cooldown before allowing the next attack
 *   - Transition to ATTACK_WINDUP requires cooldown to be 0
 *   - Cooldown is set when entering IDLE from ATTACK_RECOVERY
 */

/** The 10 discrete combat states. */
export type FighterStateId =
	| 'IDLE'
	| 'MOVING'
	| 'ATTACK_WINDUP'
	| 'ATTACK_ACTIVE'
	| 'ATTACK_RECOVERY'
	| 'BLOCKING'
	| 'STUNNED'
	| 'KNOCKED_DOWN'
	| 'GETTING_UP'
	| 'TAUNTING';

/**
 * Shared context that every state can read/write.
 * Owned by FighterStateMachine, passed to enter/update/exit.
 *
 * This is the "blackboard" — mutable data the FSM operates on.
 * It does NOT replace AgentState; it is a parallel structure that
 * the match loop syncs into AgentState after each tick.
 */
export interface FighterContext {
	/** Fighter's unique ID. */
	readonly fighterId: string;

	// ─── Timers ─────────────────────────────────────────────────
	/** Frames remaining in the current state (counts down to 0). */
	stateTimer: number;
	/** Anti-spam cooldown: frames remaining before next attack allowed. */
	attackCooldown: number;

	// ─── Move Data ──────────────────────────────────────────────
	/** Move being executed (set during ATTACK_WINDUP, cleared on recovery exit). */
	activeMoveId: string | null;
	/** Target fighter ID for the current action. */
	targetId: string | null;

	// ─── Movement ───────────────────────────────────────────────
	/** Target X position for MOVING state. */
	moveTargetX: number;
	/** Current X position. */
	positionX: number;
	/** Movement speed (units per frame). */
	moveSpeed: number;

	// ─── Flags ──────────────────────────────────────────────────
	/** Whether this fighter has a comeback active (affects some timers). */
	comebackActive: boolean;
	/** Number of knockdowns this match. */
	knockdownCount: number;

	// ─── Output Actions ─────────────────────────────────────────
	/**
	 * Actions to emit at the end of this tick.
	 * The match loop reads and clears this array each step.
	 * This replaces direct reducer dispatches from inside the FSM.
	 */
	pendingActions: FSMAction[];
}

/**
 * Actions emitted by the FSM for the match loop to process.
 * The FSM never directly mutates MatchState — it only queues actions.
 */
export type FSMAction =
	| { type: 'ENTER_ATTACK'; moveId: string; windupFrames: number }
	| { type: 'ATTACK_LANDED' }
	| { type: 'ATTACK_MISSED' }
	| { type: 'BLOCK_START' }
	| { type: 'BLOCK_END' }
	| { type: 'TAUNT_START' }
	| { type: 'TAUNT_END'; momentumGain: number }
	| { type: 'MOVE_START'; targetX: number }
	| { type: 'MOVE_TICK'; positionX: number }
	| { type: 'STATE_CHANGED'; from: FighterStateId; to: FighterStateId };

/**
 * External events that the match loop sends INTO the FSM.
 * These trigger forced transitions (e.g., hit → stun).
 */
export type FSMEvent =
	| { type: 'REQUEST_ATTACK'; moveId: string; windupFrames: number; activeFrames: number; recoveryFrames: number }
	| { type: 'REQUEST_BLOCK' }
	| { type: 'REQUEST_IDLE' }
	| { type: 'REQUEST_MOVE'; targetX: number }
	| { type: 'REQUEST_TAUNT'; durationFrames: number }
	| { type: 'HIT_RECEIVED'; stunFrames: number; damage: number }
	| { type: 'KNOCKDOWN'; durationFrames: number }
	| { type: 'REVERSAL_RECEIVED'; stunFrames: number };
