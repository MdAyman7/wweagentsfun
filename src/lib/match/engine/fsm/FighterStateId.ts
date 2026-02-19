/**
 * Fighter State Machine — State Identifiers & Shared Context
 *
 * 14 discrete states. Only one active at a time per fighter.
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
 *   ATTACK_WINDUP ──timer──▶ ATTACK_ACTIVE ──timer──▶ ATTACK_RECOVERY ──▶ COMBO_WINDOW
 *        │                        │                         │                │
 *        │ (interrupted by        │ (combat resolves        │       REQUEST_COMBO_ATTACK
 *        │  stun/knockdown)       │  in this phase)         │        → ATTACK_WINDUP (chain)
 *        ▼                        ▼                         ▼       window expires → IDLE
 *   STUNNED ◀──── hit by attack ──────────────────────────────────────────────┘
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
 *   - COMBO_WINDOW can be interrupted by STUNNED or KNOCKED_DOWN
 *   - FINISHER_SETUP has super armor (immune to stun, can be knocked down or countered)
 *   - FINISHER_IMPACT is fully immune (cannot be interrupted)
 *   - FINISHER_LOCKED is fully immune (cannot be interrupted, waits for impact)
 *
 * FINISHER SEQUENCE:
 *   - IDLE + REQUEST_FINISHER → FINISHER_SETUP (attacker side)
 *   - Opponent receives FINISHER_LOCK → FINISHER_LOCKED (defender side)
 *   - FINISHER_SETUP timer expires → FINISHER_IMPACT
 *   - FINISHER_IMPACT timer expires → ATTACK_RECOVERY (reuses normal recovery)
 *   - Counter-finisher: COUNTER_FINISHER during FINISHER_SETUP → STUNNED (attacker)
 *                       FINISHER_COUNTER_SUCCESS → IDLE (defender)
 *
 * ANTI-SPAM:
 *   - IDLE enforces a minimum cooldown before allowing the next attack
 *   - Transition to ATTACK_WINDUP requires cooldown to be 0
 *   - Cooldown is set when entering IDLE from ATTACK_RECOVERY or COMBO_WINDOW
 *
 * COMBO CHAINING:
 *   - After ATTACK_RECOVERY, if a combo is active, enters COMBO_WINDOW
 *   - COMBO_WINDOW is a brief state (12–18 frames) where the next combo attack can be queued
 *   - REQUEST_COMBO_ATTACK in COMBO_WINDOW → ATTACK_WINDUP (skip cooldown)
 *   - Window expires → IDLE (combo dropped)
 *   - Getting hit or knocked down during window → combo broken
 */

/** The 14 discrete combat states. */
export type FighterStateId =
	| 'IDLE'
	| 'MOVING'
	| 'ATTACK_WINDUP'
	| 'ATTACK_ACTIVE'
	| 'ATTACK_RECOVERY'
	| 'COMBO_WINDOW'
	| 'BLOCKING'
	| 'STUNNED'
	| 'KNOCKED_DOWN'
	| 'GETTING_UP'
	| 'TAUNTING'
	| 'FINISHER_SETUP'
	| 'FINISHER_IMPACT'
	| 'FINISHER_LOCKED';

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

	// ─── Combo ──────────────────────────────────────────────────
	/** Whether the next recovery should transition to COMBO_WINDOW instead of IDLE. */
	comboWindowPending: boolean;
	/** Frames for the pending combo window (set by match loop before recovery ends). */
	comboWindowFrames: number;

	// ─── Finisher ───────────────────────────────────────────────
	/** Whether this fighter is currently executing a finisher (setup or impact). */
	finisherActive: boolean;
	/** Whether this fighter is locked by an opponent's finisher. */
	finisherLocked: boolean;
	/** ID of the opponent executing the finisher (set when locked). */
	finisherAttackerId: string | null;

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
	| { type: 'COMBO_WINDOW_OPENED' }
	| { type: 'COMBO_WINDOW_EXPIRED' }
	| { type: 'COMBO_CHAINED'; moveId: string }
	| { type: 'STATE_CHANGED'; from: FighterStateId; to: FighterStateId }
	| { type: 'FINISHER_SETUP_START'; moveId: string; setupFrames: number }
	| { type: 'FINISHER_IMPACT_START'; moveId: string }
	| { type: 'FINISHER_LOCKED' }
	| { type: 'FINISHER_COUNTERED'; attackerId: string }
	| { type: 'FINISHER_COMPLETED'; moveId: string };

/**
 * External events that the match loop sends INTO the FSM.
 * These trigger forced transitions (e.g., hit → stun).
 */
export type FSMEvent =
	| { type: 'REQUEST_ATTACK'; moveId: string; windupFrames: number; activeFrames: number; recoveryFrames: number }
	| { type: 'REQUEST_COMBO_ATTACK'; moveId: string; windupFrames: number; activeFrames: number; recoveryFrames: number }
	| { type: 'REQUEST_BLOCK' }
	| { type: 'REQUEST_IDLE' }
	| { type: 'REQUEST_MOVE'; targetX: number }
	| { type: 'REQUEST_TAUNT'; durationFrames: number }
	| { type: 'HIT_RECEIVED'; stunFrames: number; damage: number }
	| { type: 'KNOCKDOWN'; durationFrames: number }
	| { type: 'REVERSAL_RECEIVED'; stunFrames: number }
	| { type: 'REQUEST_FINISHER'; moveId: string; setupFrames: number; impactFrames: number; recoveryFrames: number }
	| { type: 'FINISHER_LOCK'; lockFrames: number; attackerId: string }
	| { type: 'FINISHER_IMPACT_RECEIVED'; stunFrames: number; damage: number; knockdownForced: boolean }
	| { type: 'COUNTER_FINISHER'; stunFrames: number }
	| { type: 'FINISHER_COUNTER_SUCCESS' };
