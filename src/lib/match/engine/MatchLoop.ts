import type { MatchState, AgentState, AgentPhase, MatchResult, AgentPersonality } from './MatchState';
import type { MoveDef } from '../../combat/MoveRegistry';
import type { PsychProfile, AgentPsychState } from './PsychologyTypes';
import type { EffectiveModifiers } from './TraitFormulas';
import type { FighterStateId, FSMAction } from './fsm';
import { MoveRegistry } from '../../combat/MoveRegistry';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';
import { Agent, type DecisionContext } from './Agent';
import { CombatResolver } from './CombatResolver';
import { ComebackSystem } from './ComebackSystem';
import { EmotionMachine } from './EmotionMachine';
import { FighterStateMachine } from './fsm';
import { MovementController } from './movement';
import { computeEffectiveModifiers } from './TraitFormulas';
import { createDefaultPsychState, PSYCHOLOGY_EVAL_INTERVAL } from './PsychologyTypes';
import { PSYCH_PROFILES } from './BalanceConfig';
import { matchReducer } from './MatchReducer';
import { ComboTracker, type ComboBreakReason } from './ComboTracker';
import { ComboRegistry } from '../../combat/ComboRegistry';
import { FinisherTable } from '../../combat/FinisherTable';
import type { Seed } from '../../utils/types';

// ─── Hit Impact Event (consumed by rendering layer) ─────────────────

export interface HitImpactEvent {
	/** Position of impact (midpoint between attacker and defender) */
	positionX: number;
	/** The attacker's id */
	attackerId: string;
	/** The defender's id */
	defenderId: string;
	/** Final damage dealt */
	damage: number;
	/** Was this a critical hit? */
	critical: boolean;
	/** Was this a reversal? */
	reversed: boolean;
	/** Was the hit blocked? */
	blocked: boolean;
	/** Intensity 0-1 based on damage relative to max health */
	intensity: number;
}

// ─── Debug Interface ────────────────────────────────────────────────

/** Phase names emitted by the debug logger. */
export type DebugPhase = 'tick' | 'psychology' | 'decision' | 'fsm' | 'movement' | 'combat' | 'reaction' | 'win_check';

/**
 * MatchDebugger — optional observer attached to MatchLoop for diagnostic tracing.
 *
 * Implement this interface to receive per-phase trace data during simulation.
 * Zero overhead when not attached (all calls are guarded by null check).
 *
 * Usage:
 *   const debugger = new ConsoleMatchDebugger();
 *   matchLoop.setDebugger(debugger);
 *   matchLoop.step(); // → debugger receives callbacks
 *   matchLoop.setDebugger(null); // detach
 */
export interface MatchDebugger {
	/** Called at the start of each tick with the upcoming tick number. */
	onTickStart(tick: number): void;
	/** Called after each phase completes with the phase name and current state snapshot. */
	onPhase(phase: DebugPhase, state: MatchState): void;
	/** Called at the end of each tick with the final state. */
	onTickEnd(state: MatchState): void;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface MatchLoopConfig {
	seed: Seed;
	timeLimit: number;
	tickRate: number;
	wrestler1: WrestlerInput;
	wrestler2: WrestlerInput;
}

export interface WrestlerInput {
	id: string;
	name: string;
	health: number;
	stamina: number;
	personality: AgentPersonality;
	/** Psychology archetype key (e.g. 'powerhouse', 'highflyer'). Falls back to 'balanced'. */
	psychArchetype?: string;
	/** Direct PsychProfile override (takes precedence over psychArchetype). */
	psychProfile?: PsychProfile;
	color: string;
	height: number;
	build: 'light' | 'medium' | 'heavy';
}

/** Decision cooldown in ticks between AI combat actions (attack/block/taunt). */
const DECISION_INTERVAL = 42; // ~1.4 decisions per second — slow, cinematic pacing

/** Decision cooldown for movement re-evaluation (faster — keeps fighters engaged). */
const MOVE_DECISION_INTERVAL = 6; // ~10 re-evaluations per second — responsive movement

/** Health threshold for knockdown check */
const KNOCKDOWN_HEALTH_THRESHOLD = 0.12;

/** TKO: 4 knockdowns = automatic loss */
const TKO_KNOCKDOWN_LIMIT = 4;

/** Cooldown in ticks after a knockdown before another knockdown can occur */
const KNOCKDOWN_COOLDOWN = 300; // 5 seconds between knockdowns — dramatic spacing

/** Base knockback speed applied to defender on hit (units/second). */
const KNOCKBACK_BASE_SPEED = 8.0;

/** Fixed delta time for 60Hz simulation (seconds). */
const DT = 1 / 60;

// ─── Match Loop ─────────────────────────────────────────────────────

/**
 * MatchLoop — the core simulation driver.
 *
 * Creates the initial state, then runs tick-by-tick at 60Hz.
 * Each tick follows a deterministic 8-phase pipeline:
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PHASE 1: TICK           — Advance clock, stamina regen, momentum decay  │
 * │ PHASE 2: PSYCHOLOGY     — Emotion state machine + effective modifiers   │
 * │ PHASE 3: AI DECISION    — Agents choose: move/attack/block/taunt/idle   │
 * │ PHASE 4: FSM UPDATE     — Process input events, advance state timers    │
 * │ PHASE 5: MOVEMENT       — Kinematic position update, knockback decay    │
 * │ PHASE 6: COMBAT         — Resolve active-phase attacks (once per move)  │
 * │ PHASE 7: REACTION       — Process combat events (HIT/REVERSAL/KNOCKDOWN)│
 * │ PHASE 8: WIN CHECK      — KO, TKO, timeout, comeback triggers          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Invariants:
 *   - Same seed + same inputs = identical outcome (deterministic via SeededRandom)
 *   - FSM is the sole authority for phase/phaseFrames/activeMove transitions
 *   - Position is written exactly once per tick (in Phase 5)
 *   - Each attack resolves exactly once (tracked by resolvedAttacks set)
 *   - No game logic lives in the rendering layer
 *
 * Debug logging:
 *   Attach a MatchDebugger via setDebugger() to receive per-phase trace output.
 *   Disabled by default (zero overhead when no debugger attached).
 *
 * Can be driven externally by calling step() repeatedly (for rendering),
 * or run to completion via runToEnd().
 */
export class MatchLoop {
	state: MatchState;

	private readonly rng: SeededRandom;
	private readonly moveRegistry: MoveRegistry;
	private readonly combatResolver: CombatResolver;
	private readonly comebackSystem: ComebackSystem;
	private readonly emotionMachine: EmotionMachine;
	private readonly agents: Map<string, Agent>;
	private readonly decisionTimers: Map<string, number>;
	private readonly comebackStartTicks: Map<string, number>;

	/** Cached effective modifiers per agent, recomputed each psychology eval */
	private readonly effectiveMods: Map<string, EffectiveModifiers>;

	/** Fighter state machines — one per agent. Drives all combat state transitions. */
	private readonly fsms: Map<string, FighterStateMachine>;

	/** Movement controllers — one per agent. Handles approach, knockback, facing. */
	private readonly movers: Map<string, MovementController>;

	/** Combo registry — shared set of combo definitions. */
	private readonly comboRegistry: ComboRegistry;

	/** Combo trackers — one per agent. Tracks active combo chains. */
	private readonly comboTrackers: Map<string, ComboTracker>;

	/** Finisher table — maps movesets to finisher definitions. */
	private readonly finisherTable: FinisherTable;

	/** Maps agent IDs to their moveset IDs for finisher lookup. */
	private readonly agentMovesetIds: Map<string, string>;

	/**
	 * Tracks which attacks have already been resolved this active phase.
	 * Keyed by agentId — cleared when the agent leaves ATTACK_ACTIVE.
	 * Prevents the same move from being resolved on every tick of the active window.
	 */
	private readonly resolvedAttacks: Set<string> = new Set();

	/**
	 * Hit impact events emitted during the current tick.
	 * The rendering layer reads and drains these each frame to spawn VFX.
	 */
	private _pendingHitEvents: HitImpactEvent[] = [];

	/** Tracks last knockdown tick per agent (cooldown between knockdowns). */
	private readonly lastKnockdownTick: Map<string, number> = new Map();

	/** Optional debug logger — attached via setDebugger(). */
	private _debugger: MatchDebugger | null = null;

	constructor(config: MatchLoopConfig) {
		this.rng = new SeededRandom(config.seed);
		this.moveRegistry = new MoveRegistry();
		this.combatResolver = new CombatResolver(this.rng);
		this.comebackSystem = new ComebackSystem(this.rng);
		this.emotionMachine = new EmotionMachine(this.rng);
		this.agents = new Map();
		this.decisionTimers = new Map();
		this.comebackStartTicks = new Map();
		this.effectiveMods = new Map();
		this.fsms = new Map();
		this.movers = new Map();
		this.comboRegistry = new ComboRegistry();
		this.comboTrackers = new Map();
		this.finisherTable = new FinisherTable();
		this.agentMovesetIds = new Map();

		// Create initial state
		this.state = createInitialState(config);

		// Create agent brains, FSMs, movement controllers, and initial psychology modifiers
		const allMoves = this.moveRegistry.getAll();
		for (let i = 0; i < this.state.agents.length; i++) {
			const agent = this.state.agents[i];

			// Map psych archetype to combo style
			const comboStyle = resolveComboStyle(config[i === 0 ? 'wrestler1' : 'wrestler2']);

			// Create agent brain (combo-aware: knows which moves can start combos)
			this.agents.set(agent.id, new Agent(this.rng, allMoves, this.comboRegistry, comboStyle));
			this.decisionTimers.set(agent.id, 0);

			// Create FSM for this fighter
			this.fsms.set(agent.id, new FighterStateMachine(agent.id, agent.positionX));

			// Create movement controller and teleport to initial position
			const mover = new MovementController();
			mover.teleport(agent.positionX);
			this.movers.set(agent.id, mover);

			// Create combo tracker for this fighter
			this.comboTrackers.set(agent.id, new ComboTracker(this.comboRegistry, comboStyle));

			// Map agent to their moveset ID for finisher lookup
			const movesetId = resolveMovesetId(config[i === 0 ? 'wrestler1' : 'wrestler2']);
			this.agentMovesetIds.set(agent.id, movesetId);

			// Compute initial effective modifiers
			const opponent = this.state.agents[1 - i];
			const mods = computeEffectiveModifiers(
				agent, opponent, agent.psych, agent.psychProfile
			);
			this.effectiveMods.set(agent.id, mods);
		}
	}

	// ─── Public API ──────────────────────────────────────────────

	/**
	 * Get the facing sign for a fighter (-1 = facing left, +1 = facing right).
	 * Used by rendering to orient wrestler meshes toward each other.
	 */
	getFacingSign(agentId: string): number {
		return this.movers.get(agentId)?.facingSign ?? 1;
	}

	/**
	 * Drain pending hit impact events. The rendering layer calls this
	 * each frame to spawn VFX (sparks, camera shake, flash).
	 * Returns the events and clears the internal buffer.
	 */
	drainHitEvents(): HitImpactEvent[] {
		const events = this._pendingHitEvents;
		this._pendingHitEvents = [];
		return events;
	}

	/**
	 * Attach a debug logger. Pass null to detach.
	 * When attached, each phase of step() emits trace data.
	 */
	setDebugger(dbg: MatchDebugger | null): void {
		this._debugger = dbg;
	}

	// ─── Core Update Loop ────────────────────────────────────────

	/**
	 * Advance the match by one tick (1/60th of a second).
	 * Returns true if the match is still running.
	 *
	 * EXECUTION ORDER (8 deterministic phases):
	 *
	 *  ┌─ Phase 1: TICK ──────────────── clock++, stamina regen, momentum decay
	 *  │
	 *  ├─ Phase 2: PSYCHOLOGY ────────── emotion FSM eval (every 20 ticks)
	 *  │                                 → recompute effective modifiers
	 *  │
	 *  ├─ Phase 3: AI DECISION ───────── brain.decide() per agent
	 *  │                                 → push FSM events (REQUEST_ATTACK, etc.)
	 *  │                                 → set movement targets
	 *  │
	 *  ├─ Phase 4: FSM UPDATE ────────── process queued events → state transitions
	 *  │                                 → sync phase/activeMove into MatchState
	 *  │
	 *  ├─ Phase 5: MOVEMENT ──────────── kinematic position update
	 *  │                                 → knockback decay
	 *  │                                 → ring boundary + separation enforcement
	 *  │                                 → write positionX (ONCE per tick)
	 *  │
	 *  ├─ Phase 6: COMBAT ────────────── resolve ATTACK_ACTIVE moves (once each)
	 *  │                                 → CombatResolver.resolve()
	 *  │                                 → push HIT_RECEIVED / REVERSAL_RECEIVED
	 *  │                                 → apply damage, momentum, knockback
	 *  │                                 → emit HitImpactEvents for VFX
	 *  │
	 *  ├─ Phase 7: REACTION ──────────── second FSM pass (same-tick reactions)
	 *  │                                 → defender → STUNNED immediately
	 *  │                                 → knockdown detection + FSM push
	 *  │                                 → comeback trigger/expiry
	 *  │
	 *  └─ Phase 8: WIN CHECK ─────────── KO (health=0), TKO (3 knockdowns), timeout
	 */
	step(): boolean {
		if (!this.state.running) return false;

		this._debugger?.onTickStart(this.state.tick + 1);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 1: TICK — advance clock, stamina regen, decay     ║
		// ╚═══════════════════════════════════════════════════════════╝
		this.state = matchReducer(this.state, { type: 'TICK' });
		// Tick combo cooldowns for all fighters
		for (const tracker of this.comboTrackers.values()) {
			tracker.tick();
		}
		this._debugger?.onPhase('tick', this.state);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 2: PSYCHOLOGY — emotion evaluation + modifiers    ║
		// ╚═══════════════════════════════════════════════════════════╝
		if (this.state.tick % PSYCHOLOGY_EVAL_INTERVAL === 0) {
			this.runPsychologyPhase();
			this._debugger?.onPhase('psychology', this.state);
		}

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 3: AI DECISION — agents choose actions            ║
		// ╚═══════════════════════════════════════════════════════════╝
		this.runDecisionPhase();
		this._debugger?.onPhase('decision', this.state);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 4: FSM UPDATE — process input events + advance    ║
		// ╚═══════════════════════════════════════════════════════════╝
		this.runFSMPhase();
		this._debugger?.onPhase('fsm', this.state);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 5: MOVEMENT — positions, knockback, boundaries    ║
		// ╚═══════════════════════════════════════════════════════════╝
		this.runMovementPhase();
		this._debugger?.onPhase('movement', this.state);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 6: COMBAT — resolve active-phase attacks          ║
		// ╚═══════════════════════════════════════════════════════════╝
		this.runCombatPhase();
		this._debugger?.onPhase('combat', this.state);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 7: REACTION — combat events + knockdown + comeback║
		// ╚═══════════════════════════════════════════════════════════╝
		this.runReactionPhase();
		this._debugger?.onPhase('reaction', this.state);

		// ╔═══════════════════════════════════════════════════════════╗
		// ║  PHASE 8: WIN CHECK — KO, TKO, timeout                   ║
		// ╚═══════════════════════════════════════════════════════════╝
		this.checkWinConditions();
		this._debugger?.onPhase('win_check', this.state);

		this._debugger?.onTickEnd(this.state);

		return this.state.running;
	}

	/**
	 * Run the entire match to completion and return the final state.
	 */
	runToEnd(): MatchState {
		while (this.step()) {
			// Safety: max 1 hour of game time
			if (this.state.tick > 60 * 60 * 60) {
				this.forceTimeout();
				break;
			}
		}
		return this.state;
	}

	// ─── Phase Implementations ──────────────────────────────────────

	/**
	 * Run the psychology evaluation phase.
	 * Updates emotional state machines and recomputes effective modifiers.
	 */
	private runPsychologyPhase(): void {
		for (let i = 0; i < this.state.agents.length; i++) {
			const agent = this.state.agents[i];
			const opponent = this.state.agents[1 - i];
			const profile = agent.psychProfile;
			const prevPsych = agent.psych;

			// Evaluate the emotional state machine (time-aware)
			const matchElapsed = this.state.elapsed;
			const matchTimeLimit = this.state.timeLimit;
			const newPsych = this.emotionMachine.evaluate(
				agent, opponent, prevPsych, profile,
				matchElapsed, matchTimeLimit
			);

			// Check if emotion changed — log it
			if (newPsych.emotion !== prevPsych.emotion) {
				this.state = matchReducer(this.state, {
					type: 'EMOTION_CHANGE',
					agentId: agent.id,
					from: prevPsych.emotion,
					to: newPsych.emotion
				});
			}

			// Update the psych state on the agent
			this.state = {
				...this.state,
				agents: this.state.agents.map((a) => {
					if (a.id !== agent.id) return a;
					return { ...a, psych: newPsych };
				}) as [AgentState, AgentState]
			};

			// Recompute effective modifiers with updated state
			const updatedAgent = this.state.agents[i];
			const mods = computeEffectiveModifiers(
				updatedAgent, opponent, newPsych, profile
			);
			this.effectiveMods.set(agent.id, mods);
		}
	}

	private runDecisionPhase(): void {
		for (let i = 0; i < this.state.agents.length; i++) {
			const agentState = this.state.agents[i];
			const opponent = this.state.agents[1 - i];

			// Decrement decision timer
			const timer = (this.decisionTimers.get(agentState.id) ?? 0) - 1;
			this.decisionTimers.set(agentState.id, timer);

			const fsm = this.fsms.get(agentState.id);
			const mover = this.movers.get(agentState.id);
			const distance = Math.abs(agentState.positionX - opponent.positionX);

			// ── COMBO WINDOW: auto-chain the next combo move ──
			// When the FSM is in COMBO_WINDOW, the combo tracker knows the next move.
			// Push it as REQUEST_COMBO_ATTACK to chain into the next windup immediately.
			if (fsm && fsm.inComboWindow) {
				this.tryComboChain(agentState, opponent, fsm, distance);
				continue;
			}

			// Only decide when FSM accepts input and timer expired
			if (!fsm || !fsm.acceptsInput || timer > 0) continue;

			// ── FINISHER CHECK: attempt finisher before normal attack ──
			if (this.tryFinisherTrigger(agentState, opponent, fsm, i)) {
				continue; // finisher triggered — skip normal decision
			}

			const brain = this.agents.get(agentState.id);
			if (!brain) continue;

			const mods = this.effectiveMods.get(agentState.id);

			// Build spatial context for range-aware decisions
			const ctx: DecisionContext = {
				distance,
				attackRange: mover?.range ?? 1.5
			};

			const action = brain.decide(agentState, opponent, ctx, mods);

			// Reset decision timer based on action type
			// Movement uses a shorter interval so fighters re-evaluate quickly while
			// closing distance. Combat actions use the full interval.
			const speedMod = mods ? mods.speed : 1.0;
			const baseInterval = (action.type === 'move' || action.type === 'idle')
				? MOVE_DECISION_INTERVAL
				: DECISION_INTERVAL;
			const adjustedInterval = Math.round(baseInterval / speedMod);
			this.decisionTimers.set(agentState.id, clamp(adjustedInterval, 4, 30));

			switch (action.type) {
				case 'move': {
					// AI chose to approach — move toward opponent
					if (mover) {
						mover.moveTowardOpponent(opponent.positionX);
						fsm.pushEvent({ type: 'REQUEST_MOVE', targetX: opponent.positionX });
					}
					break;
				}

				case 'mistake': {
					// Psychology-driven mistake: agent commits to a bad move
					if (!action.moveId) break;
					const move = this.moveRegistry.get(action.moveId);
					if (!move) break;

					// Log the mistake
					this.state = matchReducer(this.state, {
						type: 'MISTAKE',
						agentId: agentState.id,
						moveId: action.moveId
					});

					// Deduct reduced stamina for the whiff
					this.state = {
						...this.state,
						agents: this.state.agents.map((a) => {
							if (a.id !== agentState.id) return a;
							return {
								...a,
								stamina: clamp(a.stamina - move.staminaCost * 0.4, 0, a.maxStamina),
								stats: { ...a.stats, movesMissed: a.stats.movesMissed + 1 }
							};
						}) as [AgentState, AgentState]
					};

					// Push as a REQUEST_ATTACK into FSM — the move will be resolved as
					// a miss because we don't set a target, and recovery is extended
					// Stop movement on mistake commit
					if (mover) mover.stopMovement();

					// Push as a REQUEST_ATTACK into FSM — short whiff animation
					// Keep frames short so the fighter isn't locked out for too long
					fsm.pushEvent({
						type: 'REQUEST_ATTACK',
						moveId: action.moveId,
						windupFrames: Math.max(2, Math.round(move.windupFrames * 0.5)),
						activeFrames: 1, // minimal active
						recoveryFrames: Math.max(4, Math.round(move.recoveryFrames * 0.6))
					});
					break;
				}

				case 'attack': {
					if (!action.moveId) break;
					const move = this.moveRegistry.get(action.moveId);
					if (!move) break;
					if (move.staminaCost > agentState.stamina) break;
					if (!fsm.canAttack) break;

					// Safety net: reject attack if out of move's hitbox range
					if (distance > move.hitbox.range + 0.3) break;

					// Deduct stamina
					this.state = {
						...this.state,
						agents: this.state.agents.map((a) => {
							if (a.id !== agentState.id) return a;
							return {
								...a,
								stamina: clamp(a.stamina - move.staminaCost, 0, a.maxStamina)
							};
						}) as [AgentState, AgentState]
					};

					// Stop movement on attack commit
					if (mover) mover.stopMovement();

					// Push attack event into FSM
					fsm.pushEvent({
						type: 'REQUEST_ATTACK',
						moveId: action.moveId,
						windupFrames: move.windupFrames,
						activeFrames: move.activeFrames,
						recoveryFrames: move.recoveryFrames
					});
					break;
				}

				case 'block':
					if (mover) mover.stopMovement();
					fsm.pushEvent({ type: 'REQUEST_BLOCK' });
					break;

				case 'taunt':
					if (mover) mover.stopMovement();
					fsm.pushEvent({ type: 'REQUEST_TAUNT', durationFrames: 60 });
					break;

				case 'idle':
					// When idle, continue approaching if out of range
					if (mover && distance > mover.range + 0.1) {
						mover.moveTowardOpponent(opponent.positionX);
						fsm.pushEvent({ type: 'REQUEST_MOVE', targetX: opponent.positionX });
					} else if (mover) {
						mover.stopMovement();
						fsm.pushEvent({ type: 'REQUEST_IDLE' });
					} else {
						fsm.pushEvent({ type: 'REQUEST_IDLE' });
					}
					break;
			}
		}
	}

	/**
	 * Attempt to chain the next combo move during a COMBO_WINDOW.
	 *
	 * The combo tracker knows the expected next move. We look it up in the
	 * move registry, verify stamina, and push REQUEST_COMBO_ATTACK into
	 * the FSM. If the chain fails (no move, out of stamina, out of range),
	 * we let the window expire naturally.
	 */
	private tryComboChain(
		agent: AgentState,
		opponent: AgentState,
		fsm: FighterStateMachine,
		distance: number
	): void {
		const tracker = this.comboTrackers.get(agent.id);
		if (!tracker || !tracker.isInCombo) return;

		const nextMoveId = tracker.getNextComboMove();
		if (!nextMoveId) return;

		const move = this.moveRegistry.get(nextMoveId);
		if (!move) return;

		// Stamina check with combo scaling
		const staminaScale = tracker.getStaminaScale();
		const scaledCost = move.staminaCost * staminaScale;
		if (scaledCost > agent.stamina) return;

		// Range check — allow a generous range for combo chains
		// (fighters are typically close during combos)
		if (distance > move.hitbox.range + 0.6) return;

		// Deduct stamina (scaled)
		this.state = {
			...this.state,
			agents: this.state.agents.map((a) => {
				if (a.id !== agent.id) return a;
				return {
					...a,
					stamina: clamp(a.stamina - scaledCost, 0, a.maxStamina)
				};
			}) as [AgentState, AgentState]
		};

		// Stop movement during combo
		const mover = this.movers.get(agent.id);
		if (mover) mover.stopMovement();

		// Push the combo attack into the FSM
		fsm.pushEvent({
			type: 'REQUEST_COMBO_ATTACK',
			moveId: nextMoveId,
			windupFrames: Math.max(1, move.windupFrames - 2), // slightly faster windup in combo
			activeFrames: move.activeFrames,
			recoveryFrames: move.recoveryFrames
		});
	}

	/**
	 * Attempt to trigger a cinematic finisher.
	 *
	 * Conditions:
	 * 1. FSM is in IDLE (accepts input)
	 * 2. Momentum >= 80
	 * 3. Opponent health < 35% OR attacker emotion === 'clutch'
	 * 4. Finisher move available via FinisherTable
	 * 5. Enough stamina
	 * 6. Opponent not in finisher sequence already
	 * 7. Weighted random check passes (finisherBoost from psychology)
	 *
	 * @returns true if a finisher was triggered (caller should skip normal decision)
	 */
	private tryFinisherTrigger(
		attacker: AgentState,
		defender: AgentState,
		attackerFSM: FighterStateMachine,
		_attackerIndex: number
	): boolean {
		// 1. Momentum gate
		if (!this.finisherTable.canAttemptFinisher(attacker.momentum)) return false;

		// 2. Opponent health threshold OR clutch mode
		const defenderHealthPct = defender.health / defender.maxHealth;
		const attackerMods = this.effectiveMods.get(attacker.id);
		const isClutch = attackerMods && attackerMods.emotion === 'clutch';
		if (defenderHealthPct >= 0.45 && !isClutch) return false;

		// 3. Get finisher move from table
		const movesetId = this.agentMovesetIds.get(attacker.id);
		if (!movesetId) return false;
		const finisherMove = this.finisherTable.getFinisher(movesetId);
		if (!finisherMove) return false;

		// 4. Stamina check
		if (finisherMove.staminaCost > attacker.stamina) return false;

		// 5. Opponent not already in a finisher sequence
		const defenderFSM = this.fsms.get(defender.id);
		if (!defenderFSM) return false;
		if (defenderFSM.isFinisherLocked || defenderFSM.inFinisher) return false;
		// Also check if attacker isn't already in a finisher
		if (attackerFSM.inFinisher) return false;

		// 6. Range check (generous — finishers have cinematic close-up)
		const distance = Math.abs(attacker.positionX - defender.positionX);
		if (distance > finisherMove.hitbox.range + 0.5) return false;

		// 7. Weighted random check
		const finisherBoost = attackerMods ? attackerMods.finisherBoost : 0;
		const comebackBonus = attacker.comebackActive ? 0.25 : 0;
		const clutchBonus = isClutch ? 0.3 : 0;
		const triggerChance = 0.15 + finisherBoost * 0.4 + comebackBonus + clutchBonus;
		if (!this.rng.chance(triggerChance)) return false;

		// ── TRIGGER FINISHER ──

		// Deduct stamina
		this.state = {
			...this.state,
			agents: this.state.agents.map((a) => {
				if (a.id !== attacker.id) return a;
				return {
					...a,
					stamina: clamp(a.stamina - finisherMove.staminaCost, 0, a.maxStamina)
				};
			}) as [AgentState, AgentState]
		};

		// Stop movement
		const mover = this.movers.get(attacker.id);
		if (mover) mover.stopMovement();
		const defenderMover = this.movers.get(defender.id);
		if (defenderMover) defenderMover.stopMovement();

		// Setup frames: 30-40 depending on finisher
		const setupFrames = finisherMove.windupFrames + 20; // cinematic extension
		const impactFrames = finisherMove.activeFrames;
		const recoveryFrames = finisherMove.recoveryFrames;
		const lockFrames = setupFrames + impactFrames;

		// Push REQUEST_FINISHER into attacker FSM
		attackerFSM.pushEvent({
			type: 'REQUEST_FINISHER',
			moveId: finisherMove.id,
			setupFrames,
			impactFrames,
			recoveryFrames
		});

		// Push FINISHER_LOCK into defender FSM
		defenderFSM.pushEvent({
			type: 'FINISHER_LOCK',
			lockFrames,
			attackerId: attacker.id
		});

		// Dispatch FINISHER_START action to reducer (log entry)
		this.state = matchReducer(this.state, {
			type: 'FINISHER_START',
			attackerId: attacker.id,
			defenderId: defender.id,
			moveId: finisherMove.id,
			moveName: finisherMove.name
		});

		return true;
	}

	/**
	 * Check if a counter-finisher should occur during FINISHER_SETUP.
	 *
	 * Counter window: first 8 frames of setup only.
	 * Called once per tick for agents in FINISHER_SETUP state.
	 */
	private checkFinisherCounter(
		attacker: AgentState,
		defender: AgentState,
		attackerFSM: FighterStateMachine,
		defenderFSM: FighterStateMachine
	): boolean {
		// Only counter during the first 8 frames of setup
		const setupTimer = attackerFSM.stateTimer;
		// The timer counts DOWN from setupFrames. Counter window is the FIRST 8 frames.
		// So counter is available when (setupFrames - stateTimer) < 8, i.e. stateTimer > (setupFrames - 8).
		// Since we can't easily get setupFrames here, we approximate: only counter when timer is high (early in setup).
		// Counter window ends after 8 frames elapsed → timer < (initial - 8).
		// We track from context: original timer was set at entry, stateTimer counts down.
		// Simplest: counter only if stateTimer is within top 8 of its range.
		// But we don't know initial. Let's just check if at least (setupTimer + 8) frames remain...
		// Actually: stateTimer starts at setupFrames and counts down. Timer > (setupFrames-8) means first 8 frames.
		// We don't have setupFrames stored. Let's just compare stateTimer to a floor:
		// If stateTimer >= (total - 8), and total is typically ~34, then stateTimer >= 26.
		// Simpler approach: counter window = stateTimer > 24 (i.e., within first ~10 frames for typical 34-frame setup)
		if (setupTimer <= 24) return false;

		// Counter probability per tick
		const defenderMods = this.effectiveMods.get(defender.id);
		const reversalSkill = defender.personality.reversalSkill;
		const reversalMod = defenderMods ? defenderMods.reversal * 0.03 : 0;
		const clutchBonus = (defenderMods && defenderMods.emotion === 'clutch') ? 0.05 : 0;
		const counterChance = reversalSkill * 0.08 + reversalMod + clutchBonus;

		if (!this.rng.chance(counterChance)) return false;

		// ── COUNTER-FINISHER SUCCEEDED ──

		// Get the move name for logging
		const moveId = attackerFSM.activeMoveId ?? '';

		// Push COUNTER_FINISHER to attacker FSM (→ STUNNED)
		attackerFSM.pushEvent({
			type: 'COUNTER_FINISHER',
			stunFrames: 30 // significant stun on failed finisher
		});

		// Push FINISHER_COUNTER_SUCCESS to defender FSM (→ IDLE)
		defenderFSM.pushEvent({ type: 'FINISHER_COUNTER_SUCCESS' });

		// Dispatch FINISHER_COUNTER to reducer (momentum + log)
		this.state = matchReducer(this.state, {
			type: 'FINISHER_COUNTER',
			attackerId: attacker.id,
			defenderId: defender.id,
			moveId
		});

		return true;
	}

	/**
	 * Advance all FSMs by one tick and sync their state back into MatchState.
	 *
	 * The FSM is the source of truth for phase/phaseFrames/activeMove/positionX.
	 * After updating, we read the FSM's state and push an FSM_SYNC action
	 * to write it back into the immutable MatchState.
	 */
	private runFSMPhase(): void {
		// ── Counter-finisher check (before FSM advance) ──
		for (let i = 0; i < this.state.agents.length; i++) {
			const agent = this.state.agents[i];
			const fsm = this.fsms.get(agent.id);
			if (!fsm || fsm.stateId !== 'FINISHER_SETUP') continue;

			const opponent = this.state.agents[1 - i];
			const opponentFSM = this.fsms.get(opponent.id);
			if (!opponentFSM) continue;

			this.checkFinisherCounter(agent, opponent, fsm, opponentFSM);
		}

		for (const agentState of this.state.agents) {
			const fsm = this.fsms.get(agentState.id);
			if (!fsm) continue;

			// Sync comeback status into FSM
			fsm.setComebackActive(agentState.comebackActive);

			// Advance the FSM
			fsm.update(1);

			// Process FSM actions
			const actions = fsm.drainActions();
			for (const action of actions) {
				this.processFSMAction(agentState.id, action);
			}

			// Sync FSM state back into MatchState
			const fsmPhase = mapFSMStateToPhase(fsm.stateId);
			this.state = matchReducer(this.state, {
				type: 'FSM_SYNC',
				agentId: agentState.id,
				phase: fsmPhase,
				phaseFrames: fsm.stateTimer,
				activeMove: fsm.activeMoveId,
				positionX: fsm.positionX
			});

			// ── Populate render-facing animation fields ──
			// These are read-only by the rendering layer for move-specific animations.
			const activeMoveId = fsm.activeMoveId;
			const moveDef = activeMoveId ? this.moveRegistry.get(activeMoveId) : null;
			const comboTracker = this.comboTrackers.get(agentState.id);
			const comboStep = comboTracker?.currentStep ?? -1;
			const combo = comboTracker?.comboState;
			const comboTotalSteps = (combo?.activeComboId && comboTracker)
				? comboTracker.comboState.currentStep >= 0
					? this.comboRegistry.get(combo.activeComboId)?.steps.length ?? -1
					: -1
				: -1;

			// Compute phaseTotalFrames from move timing data
			let phaseTotalFrames = 0;
			if (moveDef) {
				switch (fsmPhase) {
					case 'windup': phaseTotalFrames = moveDef.windupFrames; break;
					case 'active': phaseTotalFrames = moveDef.activeFrames; break;
					case 'recovery': phaseTotalFrames = moveDef.recoveryFrames; break;
					default: phaseTotalFrames = fsm.stateTimer; break;
				}
			} else {
				phaseTotalFrames = fsm.stateTimer;
			}

			this.state = {
				...this.state,
				agents: this.state.agents.map((a) => {
					if (a.id !== agentState.id) return a;
					return {
						...a,
						moveCategory: moveDef?.category ?? null,
						targetRegion: moveDef?.region ?? null,
						phaseTotalFrames,
						comboStep,
						comboTotalSteps
					};
				}) as [AgentState, AgentState]
			};
		}
	}

	/**
	 * Update all movement controllers.
	 *
	 * Runs after FSM sync so we know the current FSM state.
	 * Computes kinematic movement, applies knockback decay,
	 * enforces ring boundaries and minimum separation.
	 * Writes the resulting position back into MatchState.
	 */
	private runMovementPhase(): void {
		for (let i = 0; i < this.state.agents.length; i++) {
			const agent = this.state.agents[i];
			const opponent = this.state.agents[1 - i];
			const mover = this.movers.get(agent.id);
			const fsm = this.fsms.get(agent.id);
			if (!mover || !fsm) continue;

			// Update facing direction (always face opponent)
			mover.updateFacing(opponent.positionX);

			// Auto-approach: fighters in IDLE/MOVING should always be closing distance.
			// Continuously refresh the movement target so fighters track the opponent
			// and don't stall at a static position when the opponent moves.
			const fsmState = fsm.stateId;
			if (fsmState === 'IDLE' || fsmState === 'MOVING') {
				const distance = Math.abs(agent.positionX - opponent.positionX);
				if (distance > mover.range * 0.7) {
					// Always refresh target toward opponent (track their movement)
					mover.moveTowardOpponent(opponent.positionX);
					if (fsmState === 'IDLE') {
						fsm.pushEvent({ type: 'REQUEST_MOVE', targetX: opponent.positionX });
					}
				}
			}

			// Run kinematic movement update
			mover.updateMovement(DT, fsm.stateId, opponent.positionX);

			// Sync position from movement controller back into FSM and MatchState
			const newX = mover.positionX;
			fsm.setPositionX(newX);

			// Write position into MatchState
			this.state = {
				...this.state,
				agents: this.state.agents.map((a) => {
					if (a.id !== agent.id) return a;
					return { ...a, positionX: newX };
				}) as [AgentState, AgentState]
			};
		}
	}

	/**
	 * Process a single FSM action emitted during the tick.
	 */
	private processFSMAction(agentId: string, action: FSMAction): void {
		switch (action.type) {
			case 'TAUNT_END':
				// Taunt completed successfully — grant momentum
				this.state = {
					...this.state,
					agents: this.state.agents.map((a) => {
						if (a.id !== agentId) return a;
						return {
							...a,
							momentum: clamp(a.momentum + action.momentumGain, 0, 100)
						};
					}) as [AgentState, AgentState]
				};
				break;

			case 'COMBO_WINDOW_EXPIRED': {
				// The combo window timed out — break the combo
				const tracker = this.comboTrackers.get(agentId);
				if (tracker && tracker.isInCombo) {
					const hitCount = tracker.hitCount;
					const comboId = tracker.comboState.activeComboId ?? '';
					tracker.onComboBreak('window_expired');
					this.state = matchReducer(this.state, {
						type: 'COMBO_BREAK',
						agentId,
						comboId,
						reason: 'window_expired',
						hitsLanded: hitCount
					});
				}
				break;
			}

			case 'STATE_CHANGED':
				// Log significant state transitions
				if (action.to === 'ATTACK_WINDUP' || action.to === 'BLOCKING' ||
					action.to === 'TAUNTING' || action.to === 'KNOCKED_DOWN') {
					// These transitions are already logged by other actions
				}
				break;

			case 'FINISHER_SETUP_START':
				// Finisher setup began — informational (handled by FSM)
				break;

			case 'FINISHER_IMPACT_START':
				// Finisher impact phase began — combat resolution happens in runCombatPhase()
				break;

			case 'FINISHER_COMPLETED':
				// Finisher sequence completed — clear any remaining state
				break;

			case 'FINISHER_COUNTERED': {
				// Attacker's finisher was countered — they are now stunned
				// Grant defender a momentum boost (already handled by reducer FINISHER_COUNTER)
				break;
			}

			case 'FINISHER_LOCKED':
				// Defender was locked for opponent's finisher — informational
				break;

			// Other actions (ENTER_ATTACK, ATTACK_LANDED, MOVE_TICK, etc.)
			// are informational — the match loop processes combat separately.
			default:
				break;
		}
	}

	private runCombatPhase(): void {
		// ── Garbage-collect resolved attacks for agents no longer in 'active' phase ──
		for (const agentId of this.resolvedAttacks) {
			const agent = this.state.agents.find((a) => a.id === agentId);
			if (!agent || (agent.phase !== 'active' && agent.phase !== 'finisher_impact')) {
				this.resolvedAttacks.delete(agentId);
			}
		}

		// ── Resolve finisher impacts — guaranteed hit, no dodge/reversal ──
		for (const attacker of this.state.agents) {
			if (attacker.phase !== 'finisher_impact' || !attacker.activeMove) continue;
			if (this.resolvedAttacks.has(attacker.id)) continue;
			this.resolvedAttacks.add(attacker.id);

			const movesetId = this.agentMovesetIds.get(attacker.id);
			const finisherMove = movesetId ? this.finisherTable.getFinisher(movesetId) : undefined;
			if (!finisherMove) continue;

			const defender = this.state.agents.find((a) => a.id !== attacker.id)!;
			const defenderFSM = this.fsms.get(defender.id);
			const attackerMods = this.effectiveMods.get(attacker.id);

			// Resolve finisher damage (guaranteed hit)
			const result = this.combatResolver.resolveFinisher(
				attacker, defender, finisherMove, attackerMods
			);

			// Dispatch FINISHER_IMPACT to reducer (applies damage, drains momentum, logs)
			this.state = matchReducer(this.state, {
				type: 'FINISHER_IMPACT',
				attackerId: attacker.id,
				defenderId: defender.id,
				moveId: finisherMove.id,
				damage: result.damage,
				knockdownForced: result.knockdownForced
			});

			// Push FINISHER_IMPACT_RECEIVED to defender FSM
			const stunFrames = result.knockdownForced ? 40 : 24;
			defenderFSM?.pushEvent({
				type: 'FINISHER_IMPACT_RECEIVED',
				stunFrames,
				damage: result.damage,
				knockdownForced: result.knockdownForced
			});

			// Emit max-intensity HitImpactEvent for VFX
			this._pendingHitEvents.push({
				positionX: (attacker.positionX + defender.positionX) / 2,
				attackerId: attacker.id,
				defenderId: defender.id,
				damage: result.damage,
				critical: false,
				reversed: false,
				blocked: false,
				intensity: 1.0 // max intensity for finishers
			});

			// Apply knockback to defender
			const defenderMover = this.movers.get(defender.id);
			if (defenderMover) {
				const dir = defender.positionX > attacker.positionX ? 1 : -1;
				defenderMover.applyKnockback(dir * KNOCKBACK_BASE_SPEED * 2.0);
			}
		}

		// ── Resolve attacks — ONCE per active phase (prevents duplicate hits) ──
		for (const attacker of this.state.agents) {
			if (attacker.phase !== 'active' || !attacker.activeMove) continue;

			// ★ CRITICAL: Skip if this attack was already resolved.
			// Without this guard, the same move would be resolved every tick
			// of the active window (3–12 frames), rolling RNG each time.
			if (this.resolvedAttacks.has(attacker.id)) continue;
			this.resolvedAttacks.add(attacker.id);

			const move = this.moveRegistry.get(attacker.activeMove);
			if (!move) continue;

			const defender = this.state.agents.find((a) => a.id !== attacker.id)!;
			const attackerFSM = this.fsms.get(attacker.id);
			const defenderFSM = this.fsms.get(defender.id);
			const attackerMover = this.movers.get(attacker.id);
			const defenderMover = this.movers.get(defender.id);

			// Get psychology modifiers for both participants
			const attackerMods = this.effectiveMods.get(attacker.id);
			const defenderMods = this.effectiveMods.get(defender.id);

			// Apply damage reduction if defender is blocking
			const isBlocking = defender.phase === 'blocking';

			// Resolve the combat with psychology modifiers
			const result = this.combatResolver.resolve(
				attacker, defender, move, attackerMods, defenderMods
			);

			// Get the combo tracker for this attacker
			const comboTracker = this.comboTrackers.get(attacker.id);

			if (result.reversed) {
				// ── Reversal: attacker gets stunned, defender gains momentum ──
				const stunFrames = result.stunFrames;
				this.state = matchReducer(this.state, {
					type: 'MOVE_HIT',
					attackerId: attacker.id,
					defenderId: defender.id,
					moveId: attacker.activeMove,
					damage: result.reversalDamage,
					reversed: true
				});

				// Break any active combo on reversal
				if (comboTracker?.isInCombo) {
					const hitCount = comboTracker.hitCount;
					const comboId = comboTracker.comboState.activeComboId ?? '';
					comboTracker.onComboBreak('reversed');
					this.state = matchReducer(this.state, {
						type: 'COMBO_BREAK',
						agentId: attacker.id,
						comboId,
						reason: 'reversed',
						hitsLanded: hitCount
					});
				}
				// Clear any pending combo window
				attackerFSM?.clearComboWindow();

				// Push REVERSAL_RECEIVED into attacker's FSM
				// The FSM will transition ATTACK_ACTIVE → STUNNED and clear the move
				attackerFSM?.pushEvent({
					type: 'REVERSAL_RECEIVED',
					stunFrames
				});

				// Knockback: push attacker away on reversal
				if (attackerMover) {
					const dir = attacker.positionX > defender.positionX ? 1 : -1;
					attackerMover.applyKnockback(dir * KNOCKBACK_BASE_SPEED * 0.6);
				}

				// Emit hit impact event for VFX
				this._pendingHitEvents.push({
					positionX: (attacker.positionX + defender.positionX) / 2,
					attackerId: attacker.id,
					defenderId: defender.id,
					damage: result.reversalDamage,
					critical: false,
					reversed: true,
					blocked: false,
					intensity: clamp(result.reversalDamage / 20, 0.3, 1.0)
				});
			} else if (result.hit) {
				// ── Hit confirmed — apply damage, stun, and knockback ──

				// Check combo system for damage scaling
				const comboResult = comboTracker?.onHitLanded(attacker.activeMove, result.damage);
				const comboDamageScale = comboResult?.damageScale ?? 1.0;
				const comboMomentumBonus = comboResult?.momentumBonus ?? 0;

				const rawDamage = isBlocking
					? Math.max(1, Math.round(result.damage * comboDamageScale * 0.3))
					: Math.round(result.damage * comboDamageScale);
				const actualDamage = Math.max(1, rawDamage);

				const stunFrames = isBlocking
					? Math.round(4 + actualDamage * 0.4)
					: Math.round(6 + actualDamage * 0.8);

				this.state = matchReducer(this.state, {
					type: 'MOVE_HIT',
					attackerId: attacker.id,
					defenderId: defender.id,
					moveId: attacker.activeMove,
					damage: actualDamage,
					reversed: false
				});

				// ── Update combo psychology tracking ──
				if (comboResult && comboTracker) {
					const currentHits = comboTracker.hitCount;
					// Update attacker's bestComboLanded
					if (currentHits > 0) {
						this.state = {
							...this.state,
							agents: this.state.agents.map((a) => {
								if (a.id === attacker.id && currentHits > a.psych.bestComboLanded) {
									return { ...a, psych: { ...a.psych, bestComboLanded: currentHits } };
								}
								// Update defender's worstComboReceived
								if (a.id === defender.id && currentHits > a.psych.worstComboReceived) {
									return { ...a, psych: { ...a.psych, worstComboReceived: currentHits } };
								}
								return a;
							}) as [AgentState, AgentState]
						};
					}
				}

				// ── Combo logging ──
				if (comboResult?.comboStarted) {
					this.state = matchReducer(this.state, {
						type: 'COMBO_START',
						agentId: attacker.id,
						comboId: comboResult.comboId!,
						comboName: comboResult.comboName!
					});
					this.state = matchReducer(this.state, {
						type: 'COMBO_HIT',
						agentId: attacker.id,
						comboId: comboResult.comboId!,
						comboName: comboResult.comboName!,
						step: comboResult.step,
						totalSteps: comboResult.totalSteps,
						hitCount: 1
					});
				} else if (comboResult?.comboContinued) {
					this.state = matchReducer(this.state, {
						type: 'COMBO_HIT',
						agentId: attacker.id,
						comboId: comboResult.comboId!,
						comboName: comboResult.comboName!,
						step: comboResult.step,
						totalSteps: comboResult.totalSteps,
						hitCount: comboTracker?.hitCount ?? 0
					});
				} else if (comboResult?.comboCompleted) {
					this.state = matchReducer(this.state, {
						type: 'COMBO_HIT',
						agentId: attacker.id,
						comboId: comboResult.comboId!,
						comboName: comboResult.comboName!,
						step: comboResult.step,
						totalSteps: comboResult.totalSteps,
						hitCount: comboTracker?.hitCount ?? 0
					});
					this.state = matchReducer(this.state, {
						type: 'COMBO_COMPLETE',
						agentId: attacker.id,
						comboId: comboResult.comboId!,
						comboName: comboResult.comboName!,
						totalHits: comboTracker?.hitCount ?? 0,
						totalDamage: comboTracker?.comboDamage ?? 0,
						finisherUnlocked: comboResult.finisherUnlocked
					});
					// Reset combo tracker after completion
					comboTracker?.onComboBreak('window_expired');
				}

				// ── Set up combo window if the hit was part of an active combo ──
				if (comboResult && comboResult.windowFrames > 0 && !comboResult.comboCompleted) {
					attackerFSM?.setComboWindow(comboResult.windowFrames);
				}

				// Push HIT_RECEIVED into defender's FSM
				defenderFSM?.pushEvent({
					type: 'HIT_RECEIVED',
					stunFrames,
					damage: actualDamage
				});

				// Knockback: push defender away from attacker
				if (defenderMover) {
					const dir = defender.positionX > attacker.positionX ? 1 : -1;
					const knockbackScale = isBlocking ? 0.3 : 1.0;
					const critScale = result.critical ? 1.5 : 1.0;
					defenderMover.applyKnockback(
						dir * KNOCKBACK_BASE_SPEED * knockbackScale * critScale
					);
				}

				// Emit hit impact event for VFX (with combo intensity boost)
				const comboIntensityBoost = comboResult ? comboResult.step * 0.1 : 0;
				this._pendingHitEvents.push({
					positionX: (attacker.positionX + defender.positionX) / 2,
					attackerId: attacker.id,
					defenderId: defender.id,
					damage: actualDamage,
					critical: result.critical,
					reversed: false,
					blocked: isBlocking,
					intensity: clamp(actualDamage / 20 + comboIntensityBoost, 0.2, 1.0)
				});

				// Update attacker's momentum from combat + combo bonus
				const totalMomentum = result.momentumGain + comboMomentumBonus;
				this.state = {
					...this.state,
					agents: this.state.agents.map((a) => {
						if (a.id !== attacker.id) return a;
						return {
							...a,
							momentum: clamp(a.momentum + totalMomentum, 0, 100)
						};
					}) as [AgentState, AgentState]
				};
			} else {
				// ── Miss — log it and break any active combo ──
				if (comboTracker?.isInCombo) {
					const hitCount = comboTracker.hitCount;
					const comboId = comboTracker.comboState.activeComboId ?? '';
					comboTracker.onComboBreak('miss');
					this.state = matchReducer(this.state, {
						type: 'COMBO_BREAK',
						agentId: attacker.id,
						comboId,
						reason: 'miss',
						hitsLanded: hitCount
					});
				}
				attackerFSM?.clearComboWindow();

				this.state = matchReducer(this.state, {
					type: 'MOVE_MISS',
					attackerId: attacker.id,
					moveId: attacker.activeMove
				});
				this.state = {
					...this.state,
					agents: this.state.agents.map((a) => {
						if (a.id !== attacker.id) return a;
						return {
							...a,
							stats: { ...a.stats, movesMissed: a.stats.movesMissed + 1 }
						};
					}) as [AgentState, AgentState]
				};
			}
		}
	}

	/**
	 * PHASE 7: REACTION — process combat-generated events in the same tick.
	 *
	 * After Phase 6 (Combat) pushes HIT_RECEIVED / REVERSAL_RECEIVED events
	 * into defender/attacker FSMs, this phase immediately processes them so
	 * the defender transitions to STUNNED within the SAME tick (not 1 frame late).
	 *
	 * Then checks for knockdowns (health threshold → KNOCKED_DOWN) and
	 * comeback trigger/expiry. A final FSM sync ensures all transitions
	 * are reflected in MatchState before Phase 8 (Win Check).
	 */
	private runReactionPhase(): void {
		// 7a. Process combat reaction events (second FSM pass)
		this.runFSMPhase();

		// 7b. Knockdown detection
		this.checkKnockdowns();

		// 7c. Comeback triggers and expiry
		this.checkComebacks();
	}

	private checkKnockdowns(): void {
		for (const agent of this.state.agents) {
			if (agent.phase === 'knockdown' || agent.phase === 'getting_up') continue;

			const healthPct = agent.health / agent.maxHealth;
			const fsm = this.fsms.get(agent.id);

			// Cooldown check: don't allow rapid consecutive knockdowns
			const lastKD = this.lastKnockdownTick.get(agent.id) ?? -999;
			const ticksSinceKD = this.state.tick - lastKD;
			if (ticksSinceKD < KNOCKDOWN_COOLDOWN) continue;

			// Only check knockdowns when in stun phase (just been hit)
			// This prevents constant knockdown checks every tick at low health
			if (agent.phase !== 'stun') continue;

			// Track near-knockdown events on psych state
			if (healthPct <= KNOCKDOWN_HEALTH_THRESHOLD && agent.health > 0) {
				// Increment near-knockdown counter for psychology system
				this.state = {
					...this.state,
					agents: this.state.agents.map((a) => {
						if (a.id !== agent.id) return a;
						if (a.psych.nearKnockdowns === agent.psych.nearKnockdowns) {
							return {
								...a,
								psych: {
									...a.psych,
									nearKnockdowns: a.psych.nearKnockdowns + 1
								}
							};
						}
						return a;
					}) as [AgentState, AgentState]
				};

				// Chance-based knockdown: lower health = higher knockdown chance
				// Reduced base chance, scales with health deficit
				const knockdownChance = 0.08 + (1 - healthPct) * 0.25;
				if (this.rng.chance(knockdownChance)) {
					this.state = matchReducer(this.state, {
						type: 'KNOCKDOWN',
						agentId: agent.id
					});
					fsm?.pushEvent({ type: 'KNOCKDOWN', durationFrames: 120 });
					this.lastKnockdownTick.set(agent.id, this.state.tick);
				}
			}

			// Auto-knockdown on critical health (below 5%)
			if (healthPct <= 0.05 && agent.health > 0) {
				this.state = matchReducer(this.state, {
					type: 'KNOCKDOWN',
					agentId: agent.id
				});
				fsm?.pushEvent({ type: 'KNOCKDOWN', durationFrames: 120 });
				this.lastKnockdownTick.set(agent.id, this.state.tick);
			}
		}
	}

	private checkComebacks(): void {
		// Check for new comeback trigger
		const triggeredId = this.comebackSystem.checkTrigger(this.state);
		if (triggeredId) {
			this.state = matchReducer(this.state, {
				type: 'COMEBACK_TRIGGER',
				agentId: triggeredId
			});
			this.comebackStartTicks.set(triggeredId, this.state.tick);
		}

		// Check if active comebacks should end
		for (const agent of this.state.agents) {
			if (!agent.comebackActive) continue;
			const startTick = this.comebackStartTicks.get(agent.id) ?? 0;
			if (this.comebackSystem.shouldEnd(agent, this.state.tick, startTick)) {
				this.state = matchReducer(this.state, {
					type: 'COMEBACK_END',
					agentId: agent.id
				});
				this.comebackStartTicks.delete(agent.id);
			}
		}
	}

	private checkWinConditions(): void {
		for (const agent of this.state.agents) {
			// KO: health reaches 0
			if (agent.health <= 0) {
				const winner = this.state.agents.find((a) => a.id !== agent.id)!;
				this.endMatch(winner.id, agent.id, 'knockout');
				return;
			}

			// TKO: 3 knockdowns
			if (agent.knockdowns >= TKO_KNOCKDOWN_LIMIT) {
				const winner = this.state.agents.find((a) => a.id !== agent.id)!;
				this.endMatch(winner.id, agent.id, 'tko');
				return;
			}
		}

		// Timeout
		if (this.state.elapsed >= this.state.timeLimit) {
			this.forceTimeout();
		}
	}

	private endMatch(winnerId: string, loserId: string, method: MatchResult['method']): void {
		const rating = this.calculateRating();
		this.state = matchReducer(this.state, {
			type: 'MATCH_END',
			result: {
				winnerId,
				loserId,
				method,
				duration: this.state.elapsed,
				rating
			}
		});
	}

	private forceTimeout(): void {
		const [a, b] = this.state.agents;
		const aHealthPct = a.health / a.maxHealth;
		const bHealthPct = b.health / b.maxHealth;

		let winnerId: string;
		let loserId: string;

		if (Math.abs(aHealthPct - bHealthPct) < 0.02) {
			// Near-tie: winner by total damage dealt
			winnerId = a.stats.damageDealt >= b.stats.damageDealt ? a.id : b.id;
		} else {
			winnerId = aHealthPct > bHealthPct ? a.id : b.id;
		}
		loserId = this.state.agents.find((x) => x.id !== winnerId)!.id;

		this.endMatch(winnerId, loserId, 'timeout');
	}

	/**
	 * Calculate a 0-5 star match rating based on action quality.
	 * Psychology adds drama bonuses for emotional swings.
	 */
	private calculateRating(): number {
		const [a, b] = this.state.agents;
		let rating = 2.0;

		// Total moves hit bonus (more action = better)
		const totalMoves = a.stats.movesHit + b.stats.movesHit;
		rating += clamp(totalMoves * 0.04, 0, 0.8);

		// Reversals are exciting
		const totalReversals = a.stats.reversals + b.stats.reversals;
		rating += clamp(totalReversals * 0.15, 0, 0.5);

		// Knockdowns add drama
		const totalKnockdowns = a.stats.knockdowns + b.stats.knockdowns;
		rating += clamp(totalKnockdowns * 0.2, 0, 0.6);

		// Close health differential = competitive match
		const healthDiff = Math.abs((a.health / a.maxHealth) - (b.health / b.maxHealth));
		if (healthDiff < 0.2) rating += 0.4;

		// Duration sweet spot (40-55 seconds of a 60-second match is ideal)
		if (this.state.elapsed >= 40 && this.state.elapsed <= 58) {
			rating += 0.3;
		}

		// Comebacks in the log are a big bonus
		const comebackCount = this.state.log.filter((l) => l.type === 'comeback').length;
		rating += comebackCount * 0.4;

		// Psychology drama bonus: emotional variety during the match
		const emotionChanges = this.state.log.filter((l) => l.type === 'emotion_change').length;
		rating += clamp(emotionChanges * 0.05, 0, 0.4);

		// Clutch moments are the best — bonus if anyone reached clutch state
		const clutchMoments = this.state.log.filter(
			(l) => l.type === 'emotion_change' && l.data.to === 'clutch'
		).length;
		rating += clutchMoments * 0.3;

		// Mistakes add unpredictability
		const mistakes = this.state.log.filter((l) => l.type === 'mistake').length;
		rating += clamp(mistakes * 0.08, 0, 0.3);

		// Frustrated moments add drama (wrestler "losing their cool")
		const frustratedMoments = this.state.log.filter(
			(l) => l.type === 'emotion_change' && l.data.to === 'frustrated'
		).length;
		rating += clamp(frustratedMoments * 0.1, 0, 0.3);

		// Desperate comebacks are thrilling
		const desperateMoments = this.state.log.filter(
			(l) => l.type === 'emotion_change' && l.data.to === 'desperate'
		).length;
		rating += clamp(desperateMoments * 0.15, 0, 0.3);

		// Combo chains are exciting — completed combos boost rating significantly
		const combosCompleted = a.stats.combosCompleted + b.stats.combosCompleted;
		rating += clamp(combosCompleted * 0.25, 0, 0.6);

		// Long combos are spectacular
		const longestCombo = Math.max(a.stats.longestCombo, b.stats.longestCombo);
		if (longestCombo >= 3) rating += 0.2;
		if (longestCombo >= 5) rating += 0.3;

		// Finisher completions are spectacular
		const finishersLanded = a.stats.finishersLanded + b.stats.finishersLanded;
		rating += clamp(finishersLanded * 0.4, 0, 0.8);

		// Counter-finishers are peak drama
		const finishersCaught = a.stats.finishersCaught + b.stats.finishersCaught;
		rating += clamp(finishersCaught * 0.5, 0, 0.5);

		return clamp(Math.round(rating * 10) / 10, 0, 5);
	}
}

// ─── Initial State Factory ──────────────────────────────────────────

function createInitialState(config: MatchLoopConfig): MatchState {
	return {
		seed: config.seed,
		tick: 0,
		elapsed: 0,
		timeLimit: config.timeLimit,
		running: true,
		result: null,
		comebackCooldown: 0,
		log: [{
			tick: 0,
			elapsed: 0,
			type: 'match_start',
			detail: `${config.wrestler1.name} vs ${config.wrestler2.name}`,
			data: { seed: config.seed, timeLimit: config.timeLimit }
		}],
		agents: [
			createAgentState(config.wrestler1, -2),
			createAgentState(config.wrestler2, 2)
		]
	};
}

function resolvePsychProfile(input: WrestlerInput): PsychProfile {
	// Direct override takes precedence
	if (input.psychProfile) return input.psychProfile;
	// Lookup by archetype
	if (input.psychArchetype && PSYCH_PROFILES[input.psychArchetype]) {
		return PSYCH_PROFILES[input.psychArchetype];
	}
	// Default: balanced
	return PSYCH_PROFILES.balanced;
}

function createAgentState(input: WrestlerInput, positionX: number): AgentState {
	const psychProfile = resolvePsychProfile(input);
	return {
		id: input.id,
		name: input.name,
		health: input.health,
		maxHealth: input.health,
		stamina: input.stamina,
		maxStamina: input.stamina,
		momentum: 0,
		regionDamage: { head: 0, body: 0, legs: 0 },
		phase: 'idle',
		phaseFrames: 0,
		activeMove: null,
		targetId: null,
		positionX,
		knockdowns: 0,
		comebackActive: false,
		color: input.color,
		height: input.height,
		build: input.build,
		stats: {
			movesHit: 0,
			movesMissed: 0,
			damageDealt: 0,
			damageTaken: 0,
			reversals: 0,
			knockdowns: 0,
			combosStarted: 0,
			combosCompleted: 0,
			comboHits: 0,
			longestCombo: 0,
			finishersLanded: 0,
			finishersCaught: 0
		},
		personality: input.personality,
		psychProfile,
		psych: createDefaultPsychState(psychProfile),

		// Render-facing fields (updated during FSM_SYNC)
		moveCategory: null,
		targetRegion: null,
		phaseTotalFrames: 0,
		comboStep: -1,
		comboTotalSteps: -1
	};
}

// ─── FSM ↔ AgentPhase Mapping ────────────────────────────────────────

/**
 * Map FighterStateMachine state IDs to AgentPhase values.
 * AgentPhase is the canonical phase stored in MatchState, consumed by
 * rendering, HUD, and other downstream systems.
 */
function mapFSMStateToPhase(stateId: FighterStateId): AgentPhase {
	switch (stateId) {
		case 'IDLE':              return 'idle';
		case 'MOVING':            return 'moving';
		case 'ATTACK_WINDUP':     return 'windup';
		case 'ATTACK_ACTIVE':     return 'active';
		case 'ATTACK_RECOVERY':   return 'recovery';
		case 'BLOCKING':          return 'blocking';
		case 'STUNNED':           return 'stun';
		case 'KNOCKED_DOWN':      return 'knockdown';
		case 'GETTING_UP':        return 'getting_up';
		case 'TAUNTING':          return 'taunting';
		case 'COMBO_WINDOW':      return 'combo_window';
		case 'FINISHER_SETUP':    return 'finisher_setup';
		case 'FINISHER_IMPACT':   return 'finisher_impact';
		case 'FINISHER_LOCKED':   return 'finisher_locked';
		default:                  return 'idle';
	}
}

/**
 * Map a wrestler's psych archetype to a combo style string.
 * Combo styles determine which combos from the ComboRegistry are available.
 * Falls back to 'universal' if no mapping exists.
 */
/**
 * Map a wrestler's psych archetype to a FinisherTable moveset ID.
 * Falls back to 'allrounder_a' if no mapping exists.
 */
function resolveMovesetId(input: WrestlerInput): string {
	const archetype = input.psychArchetype?.toLowerCase() ?? '';
	switch (archetype) {
		case 'powerhouse': return 'powerhouse_a';
		case 'highflyer':  return 'highflyer_a';
		case 'technician': return 'technician_a';
		case 'brawler':    return 'brawler_a';
		case 'showman':    return 'psychologist_a';
		case 'balanced':   return 'allrounder_a';
		default:           return 'allrounder_a';
	}
}

function resolveComboStyle(input: WrestlerInput): string {
	const archetype = input.psychArchetype?.toLowerCase() ?? '';
	switch (archetype) {
		case 'powerhouse': return 'powerhouse';
		case 'highflyer':  return 'highflyer';
		case 'technician': return 'technician';
		case 'brawler':    return 'brawler';
		case 'showman':    return 'brawler';   // showmen use brawler combos (crowd-pleasing strikes)
		case 'balanced':   return 'universal';
		default:           return 'universal';
	}
}
