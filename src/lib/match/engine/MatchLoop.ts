import type { MatchState, AgentState, AgentPhase, MatchResult, AgentPersonality } from './MatchState';
import type { MoveDef } from '../../combat/MoveRegistry';
import type { PsychProfile, AgentPsychState } from './PsychologyTypes';
import type { EffectiveModifiers } from './TraitFormulas';
import type { FighterStateId, FSMAction } from './fsm';
import { MoveRegistry } from '../../combat/MoveRegistry';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';
import { Agent } from './Agent';
import { CombatResolver } from './CombatResolver';
import { ComebackSystem } from './ComebackSystem';
import { EmotionMachine } from './EmotionMachine';
import { FighterStateMachine } from './fsm';
import { MovementController } from './movement';
import { computeEffectiveModifiers } from './TraitFormulas';
import { createDefaultPsychState, PSYCHOLOGY_EVAL_INTERVAL } from './PsychologyTypes';
import { PSYCH_PROFILES } from './BalanceConfig';
import { matchReducer } from './MatchReducer';
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

/** Decision cooldown in ticks between AI actions */
const DECISION_INTERVAL = 20; // ~3 decisions per second

/** Health threshold for knockdown check */
const KNOCKDOWN_HEALTH_THRESHOLD = 0.15;

/** TKO: 3 knockdowns = automatic loss */
const TKO_KNOCKDOWN_LIMIT = 3;

/** Base knockback speed applied to defender on hit (units/second). */
const KNOCKBACK_BASE_SPEED = 3.0;

/** Fixed delta time for 60Hz simulation (seconds). */
const DT = 1 / 60;

// ─── Match Loop ─────────────────────────────────────────────────────

/**
 * MatchLoop — the core simulation driver.
 *
 * Creates the initial state, then runs tick-by-tick.
 * Each tick:
 *   1. Advance timers (TICK action via reducer)
 *   2. Psychology evaluation (emotional state machine + modifiers)
 *   3. AI decision phase (agents choose actions, influenced by psychology)
 *   4. Combat resolution (attacks resolve via CombatResolver with psych mods)
 *   5. Knockdown detection (health drops → knockdown)
 *   6. Comeback check (rare dramatic moment)
 *   7. Win condition check (KO, TKO, timeout)
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

		// Create initial state
		this.state = createInitialState(config);

		// Create agent brains, FSMs, movement controllers, and initial psychology modifiers
		const allMoves = this.moveRegistry.getAll();
		for (let i = 0; i < this.state.agents.length; i++) {
			const agent = this.state.agents[i];
			this.agents.set(agent.id, new Agent(this.rng, allMoves));
			this.decisionTimers.set(agent.id, 0);

			// Create FSM for this fighter
			this.fsms.set(agent.id, new FighterStateMachine(agent.id, agent.positionX));

			// Create movement controller and teleport to initial position
			const mover = new MovementController();
			mover.teleport(agent.positionX);
			this.movers.set(agent.id, mover);

			// Compute initial effective modifiers
			const opponent = this.state.agents[1 - i];
			const mods = computeEffectiveModifiers(
				agent, opponent, agent.psych, agent.psychProfile
			);
			this.effectiveMods.set(agent.id, mods);
		}
	}

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
	 * Advance the match by one tick (1/60th of a second).
	 * Returns true if the match is still running.
	 */
	step(): boolean {
		if (!this.state.running) return false;

		// 1. Tick — advance timers, stamina regen, decay
		this.state = matchReducer(this.state, { type: 'TICK' });

		// 2. Psychology evaluation (every PSYCHOLOGY_EVAL_INTERVAL ticks)
		if (this.state.tick % PSYCHOLOGY_EVAL_INTERVAL === 0) {
			this.runPsychologyPhase();
		}

		// 3. AI decisions → pushed into FSMs as events
		this.runDecisionPhase();

		// 4. Advance FSMs and sync state back to MatchState
		this.runFSMPhase();

		// 5. Movement phase — update positions, knockback, facing
		this.runMovementPhase();

		// 6. Combat resolution — resolve active moves that reach 'active' phase.
		//    This pushes HIT_RECEIVED/REVERSAL_RECEIVED events into defender/attacker FSMs.
		this.runCombatPhase();

		// 7. ★ SECOND FSM PASS — process combat reaction events (HIT_RECEIVED,
		//    REVERSAL_RECEIVED, KNOCKDOWN) within the SAME tick so the defender
		//    transitions to STUNNED immediately, not 1 frame late.
		this.runFSMPhase();

		// 8. Knockdown detection (pushes KNOCKDOWN events into FSMs)
		this.checkKnockdowns();

		// 9. Comeback check
		this.checkComebacks();

		// 10. Win conditions
		this.checkWinConditions();

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

			// Evaluate the emotional state machine
			const newPsych = this.emotionMachine.evaluate(
				agent, opponent, prevPsych, profile
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

			// ── Auto-approach: when idle/moving and outside attack range, move toward opponent ──
			// This runs every tick regardless of decision timer, so fighters always close distance.
			if (fsm && mover) {
				const fsmState = fsm.stateId;
				if (fsmState === 'IDLE' || fsmState === 'MOVING') {
					const distance = Math.abs(agentState.positionX - opponent.positionX);
					if (distance > mover.range + 0.1) {
						// Outside attack range — approach
						mover.moveTowardOpponent(opponent.positionX);
					} else {
						// Inside attack range — stop approaching
						mover.stopMovement();
					}
				}
			}

			// Only decide when FSM accepts input and timer expired
			if (!fsm || !fsm.acceptsInput || timer > 0) continue;

			const brain = this.agents.get(agentState.id);
			if (!brain) continue;

			const mods = this.effectiveMods.get(agentState.id);
			const action = brain.decide(agentState, opponent, mods);

			// Reset decision timer
			this.decisionTimers.set(agentState.id, DECISION_INTERVAL);

			switch (action.type) {
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

					// Deduct stamina, then push a short attack that will auto-miss
					this.state = {
						...this.state,
						agents: this.state.agents.map((a) => {
							if (a.id !== agentState.id) return a;
							return {
								...a,
								stamina: clamp(a.stamina - move.staminaCost * 0.7, 0, a.maxStamina),
								stats: { ...a.stats, movesMissed: a.stats.movesMissed + 1 }
							};
						}) as [AgentState, AgentState]
					};

					// Push as a REQUEST_ATTACK into FSM — the move will be resolved as
					// a miss because we don't set a target, and recovery is extended
					fsm.pushEvent({
						type: 'REQUEST_ATTACK',
						moveId: action.moveId,
						windupFrames: move.windupFrames,
						activeFrames: 1, // minimal active
						recoveryFrames: move.recoveryFrames + 12 // extra recovery penalty
					});
					break;
				}

				case 'attack': {
					if (!action.moveId) break;
					const move = this.moveRegistry.get(action.moveId);
					if (!move) break;
					if (move.staminaCost > agentState.stamina) break;
					if (!fsm.canAttack) break;

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
					fsm.pushEvent({ type: 'REQUEST_BLOCK' });
					break;

				case 'idle':
					fsm.pushEvent({ type: 'REQUEST_IDLE' });
					break;
			}
		}
	}

	/**
	 * Advance all FSMs by one tick and sync their state back into MatchState.
	 *
	 * The FSM is the source of truth for phase/phaseFrames/activeMove/positionX.
	 * After updating, we read the FSM's state and push an FSM_SYNC action
	 * to write it back into the immutable MatchState.
	 */
	private runFSMPhase(): void {
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

			case 'STATE_CHANGED':
				// Log significant state transitions
				if (action.to === 'ATTACK_WINDUP' || action.to === 'BLOCKING' ||
					action.to === 'TAUNTING' || action.to === 'KNOCKED_DOWN') {
					// These transitions are already logged by other actions
				}
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
			if (!agent || agent.phase !== 'active') {
				this.resolvedAttacks.delete(agentId);
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
				const actualDamage = isBlocking
					? Math.max(1, Math.round(result.damage * 0.3)) // 70% reduction while blocking
					: result.damage;
				const stunFrames = isBlocking
					? Math.round(4 + actualDamage * 0.4) // shorter stun when blocked
					: Math.round(6 + actualDamage * 0.8);

				this.state = matchReducer(this.state, {
					type: 'MOVE_HIT',
					attackerId: attacker.id,
					defenderId: defender.id,
					moveId: attacker.activeMove,
					damage: actualDamage,
					reversed: false
				});

				// Push HIT_RECEIVED into defender's FSM
				// The FSM will transition the defender to STUNNED state
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

				// Emit hit impact event for VFX
				this._pendingHitEvents.push({
					positionX: (attacker.positionX + defender.positionX) / 2,
					attackerId: attacker.id,
					defenderId: defender.id,
					damage: actualDamage,
					critical: result.critical,
					reversed: false,
					blocked: isBlocking,
					intensity: clamp(actualDamage / 20, 0.2, 1.0)
				});

				// Update attacker's momentum from the combat result
				this.state = {
					...this.state,
					agents: this.state.agents.map((a) => {
						if (a.id !== attacker.id) return a;
						return {
							...a,
							momentum: clamp(a.momentum + result.momentumGain, 0, 100)
						};
					}) as [AgentState, AgentState]
				};
			} else {
				// ── Miss — log it and let the FSM continue the active→recovery flow ──
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

	private checkKnockdowns(): void {
		for (const agent of this.state.agents) {
			if (agent.phase === 'knockdown' || agent.phase === 'getting_up') continue;

			const healthPct = agent.health / agent.maxHealth;
			const fsm = this.fsms.get(agent.id);

			// Knockdown when health drops below threshold
			if (healthPct <= KNOCKDOWN_HEALTH_THRESHOLD && agent.health > 0) {
				// Chance-based: lower health = higher knockdown chance
				const knockdownChance = 0.15 + (1 - healthPct) * 0.4;
				if (this.rng.chance(knockdownChance)) {
					this.state = matchReducer(this.state, {
						type: 'KNOCKDOWN',
						agentId: agent.id
					});
					// Push knockdown into FSM
					fsm?.pushEvent({ type: 'KNOCKDOWN', durationFrames: 120 });
				}
			}

			// Auto-knockdown on big hits (health dropped >25% in one hit)
			if (agent.phase === 'stun' && healthPct <= 0.08) {
				this.state = matchReducer(this.state, {
					type: 'KNOCKDOWN',
					agentId: agent.id
				});
				fsm?.pushEvent({ type: 'KNOCKDOWN', durationFrames: 120 });
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
			knockdowns: 0
		},
		personality: input.personality,
		psychProfile,
		psych: createDefaultPsychState(psychProfile)
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
		default:                  return 'idle';
	}
}
