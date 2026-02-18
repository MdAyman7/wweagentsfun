import type { MatchState, MatchAction, AgentState, MatchLogEntry, MatchResult, AgentPhase } from './MatchState';
import { clamp } from '../../utils/math';

/**
 * Pure reducer: (state, action) → newState
 *
 * Every state transition is deterministic and traceable.
 * The match loop dispatches actions; this reducer applies them.
 * No side effects, no mutation — returns a fresh state object.
 */
export function matchReducer(state: MatchState, action: MatchAction): MatchState {
	switch (action.type) {
		case 'TICK':
			return tickReducer(state);

		case 'AGENT_ATTACK':
			return agentAttackReducer(state, action.agentId, action.moveId);

		case 'AGENT_BLOCK':
			return updateAgent(state, action.agentId, (a) => ({
				...a,
				phase: 'blocking' as AgentPhase,
				phaseFrames: 30 // block stance lasts 0.5 seconds
			}));

		case 'AGENT_IDLE':
			return state; // no-op, agent stays idle

		case 'AGENT_MOVE':
			return updateAgent(state, action.agentId, (a) => ({
				...a,
				phase: 'moving' as AgentPhase,
				phaseFrames: 0
			}));

		case 'AGENT_TAUNT':
			return addLog(
				updateAgent(state, action.agentId, (a) => ({
					...a,
					phase: 'taunting' as AgentPhase,
					phaseFrames: action.durationFrames
				})),
				'taunt',
				`${getAgentName(state, action.agentId)} taunts the crowd!`,
				{ agentId: action.agentId }
			);

		case 'MOVE_HIT':
			return moveHitReducer(state, action);

		case 'MOVE_MISS':
			return addLog(state, 'move_miss', `${getAgentName(state, action.attackerId)} missed ${action.moveId}`, {
				attackerId: action.attackerId,
				moveId: action.moveId
			});

		case 'KNOCKDOWN':
			return knockdownReducer(state, action.agentId);

		case 'RECOVERY':
			return updateAgent(state, action.agentId, (a) => ({
				...a,
				phase: 'idle' as AgentPhase,
				phaseFrames: 0
			}));

		case 'FSM_SYNC':
			return updateAgent(state, action.agentId, (a) => ({
				...a,
				phase: action.phase,
				phaseFrames: action.phaseFrames,
				activeMove: action.activeMove,
				positionX: action.positionX
			}));

		case 'COMEBACK_TRIGGER':
			return comebackTriggerReducer(state, action.agentId);

		case 'COMEBACK_END':
			return updateAgent(state, action.agentId, (a) => ({
				...a,
				comebackActive: false
			}));

		case 'EMOTION_CHANGE':
			return addLog(
				updateAgent(state, action.agentId, (a) => ({
					...a,
					psych: { ...a.psych, emotion: action.to }
				})),
				'emotion_change',
				`${getAgentName(state, action.agentId)} is now ${action.to.toUpperCase()}!`,
				{ agentId: action.agentId, from: action.from, to: action.to }
			);

		case 'MISTAKE':
			return addLog(state, 'mistake',
				`${getAgentName(state, action.agentId)} makes a mistake with ${action.moveId}!`,
				{ agentId: action.agentId, moveId: action.moveId }
			);

		case 'MATCH_END':
			return {
				...state,
				running: false,
				result: action.result,
				log: [...state.log, createLog(state, 'match_end',
					`${action.result.winnerId} wins by ${action.result.method}!`,
					{ ...action.result }
				)]
			};

		default:
			return state;
	}
}

// ─── Sub-reducers ───────────────────────────────────────────────────

function tickReducer(state: MatchState): MatchState {
	let s = { ...state, tick: state.tick + 1, elapsed: (state.tick + 1) / 60 };

	// Advance phase timers and stamina regen for each agent
	s = {
		...s,
		agents: s.agents.map((a) => {
			let agent = { ...a };

			// ── Phase timer countdown ──
			// NOTE: When using the FSM (FighterStateMachine), phase transitions
			// are driven by the FSM and synced via FSM_SYNC actions. The timer
			// countdown here is kept for backward compatibility with non-FSM mode.
			if (agent.phaseFrames > 0) {
				agent.phaseFrames--;
				if (agent.phaseFrames <= 0) {
					// Phase expired — transition
					switch (agent.phase) {
						case 'windup':
							agent.phase = 'active';
							agent.phaseFrames = 6; // active window
							break;
						case 'active':
							agent.phase = 'recovery';
							agent.phaseFrames = 12;
							agent.activeMove = null;
							agent.targetId = null;
							break;
						case 'recovery':
							agent.phase = 'idle';
							agent.activeMove = null;
							agent.targetId = null;
							break;
						case 'blocking':
							agent.phase = 'idle';
							break;
						case 'stun':
							agent.phase = 'idle';
							break;
						case 'knockdown':
							agent.phase = 'getting_up';
							agent.phaseFrames = 24; // brief vulnerability window
							break;
						case 'getting_up':
							agent.phase = 'idle';
							break;
						case 'taunting':
							agent.phase = 'idle';
							break;
						default:
							break;
					}
				}
			}

			// ── Stamina regeneration ──
			// Rate depends on phase: idle = full, active phases = reduced
			let regenRate = 0;
			switch (agent.phase) {
				case 'idle': regenRate = 0.35; break;        // ~21 per second
				case 'moving': regenRate = 0.2; break;       // ~12 per second (light movement)
				case 'recovery': regenRate = 0.15; break;    // ~9 per second
				case 'blocking': regenRate = -0.3; break;    // DRAINS stamina while blocking
				case 'stun': regenRate = 0.2; break;         // ~12 per second
				case 'knockdown': regenRate = 0.25; break;   // ~15 per second
				case 'getting_up': regenRate = 0.15; break;  // ~9 per second (slow recovery)
				case 'taunting': regenRate = 0.1; break;     // ~6 per second (minimal)
				default: regenRate = 0; break;               // no regen during attack
			}
			// Comeback: 3× regen rate
			if (agent.comebackActive) regenRate *= 3;

			agent.stamina = clamp(agent.stamina + regenRate, 0, agent.maxStamina);

			// ── Momentum natural decay (0.05 per tick when idle/moving) ──
			if ((agent.phase === 'idle' || agent.phase === 'moving') && agent.momentum > 0) {
				agent.momentum = clamp(agent.momentum - 0.05, 0, 100);
			}

			return agent;
		}) as [AgentState, AgentState]
	};

	// Decrement comeback cooldown
	if (s.comebackCooldown > 0) {
		s = { ...s, comebackCooldown: s.comebackCooldown - 1 };
	}

	return s;
}

function agentAttackReducer(state: MatchState, agentId: string, moveId: string): MatchState {
	return updateAgent(state, agentId, (a) => ({
		...a,
		phase: 'windup' as AgentPhase,
		phaseFrames: 10, // will be overridden by the match loop with actual move data
		activeMove: moveId,
		targetId: state.agents.find((o) => o.id !== agentId)?.id ?? null
	}));
}

function moveHitReducer(state: MatchState, action: Extract<MatchAction, { type: 'MOVE_HIT' }>): MatchState {
	let s = state;

	if (action.reversed) {
		// Reversal: attacker takes damage, defender gains momentum.
		// NOTE: We do NOT set phase/phaseFrames/activeMove here.
		// The FSM is authoritative for phase transitions — the MatchLoop pushes
		// REVERSAL_RECEIVED into the attacker's FSM, which transitions to STUNNED.
		// Writing phase here would conflict with FSM_SYNC on the next tick.
		s = updateAgent(s, action.attackerId, (a) => ({
			...a,
			health: clamp(a.health - action.damage, 0, a.maxHealth),
			stats: { ...a.stats, damageTaken: a.stats.damageTaken + action.damage },
			psych: { ...a.psych, hitStreak: 0, takenStreak: a.psych.takenStreak + 1 }
		}));
		s = updateAgent(s, action.defenderId, (a) => ({
			...a,
			momentum: clamp(a.momentum + 10, 0, 100),
			stats: { ...a.stats, reversals: a.stats.reversals + 1, damageDealt: a.stats.damageDealt + action.damage },
			psych: { ...a.psych, hitStreak: a.psych.hitStreak + 1, takenStreak: 0 }
		}));
		s = addLog(s, 'reversal', `${getAgentName(s, action.defenderId)} reversed the ${action.moveId}!`, {
			attackerId: action.attackerId,
			defenderId: action.defenderId,
			reversalDamage: action.damage
		});
	} else {
		// Normal hit: defender takes damage, attacker gains momentum.
		// NOTE: Phase transitions (defender→STUNNED, attacker→RECOVERY) are
		// handled by the FSM via HIT_RECEIVED events and the natural
		// ATTACK_ACTIVE timer expiry. We only update health, stats, and psych here.
		s = updateAgent(s, action.defenderId, (a) => {
			const newHealth = clamp(a.health - action.damage, 0, a.maxHealth);
			const region = 'body' as keyof typeof a.regionDamage;
			return {
				...a,
				health: newHealth,
				regionDamage: {
					...a.regionDamage,
					[region]: clamp(a.regionDamage[region] + action.damage * 0.5, 0, 100)
				},
				stats: { ...a.stats, damageTaken: a.stats.damageTaken + action.damage },
				psych: { ...a.psych, takenStreak: a.psych.takenStreak + 1, hitStreak: 0 }
			};
		});
		s = updateAgent(s, action.attackerId, (a) => ({
			...a,
			momentum: clamp(a.momentum + 8, 0, 100),
			stats: { ...a.stats, movesHit: a.stats.movesHit + 1, damageDealt: a.stats.damageDealt + action.damage },
			psych: { ...a.psych, hitStreak: a.psych.hitStreak + 1, takenStreak: 0 }
		}));
		s = addLog(s, 'move_hit', `${getAgentName(s, action.attackerId)} hits ${action.moveId} for ${action.damage}`, {
			attackerId: action.attackerId,
			defenderId: action.defenderId,
			moveId: action.moveId,
			damage: action.damage
		});
	}

	return s;
}

function knockdownReducer(state: MatchState, agentId: string): MatchState {
	let s = updateAgent(state, agentId, (a) => ({
		...a,
		phase: 'knockdown' as AgentPhase,
		phaseFrames: 120, // 2 seconds to get up
		knockdowns: a.knockdowns + 1,
		stats: { ...a.stats, knockdowns: a.stats.knockdowns + 1 }
	}));
	s = addLog(s, 'knockdown', `${getAgentName(s, agentId)} is knocked down!`, {
		agentId,
		knockdownCount: getAgent(s, agentId)?.knockdowns ?? 0
	});
	return s;
}

function comebackTriggerReducer(state: MatchState, agentId: string): MatchState {
	let s = updateAgent(state, agentId, (a) => ({
		...a,
		comebackActive: true,
		momentum: clamp(a.momentum + 30, 0, 100) // surge of momentum
	}));
	s = { ...s, comebackCooldown: 1200 }; // 20-second global cooldown
	s = addLog(s, 'comeback', `${getAgentName(s, agentId)} is making a COMEBACK!`, {
		agentId,
		health: getAgent(s, agentId)?.health ?? 0
	});
	return s;
}

// ─── Helper Functions ───────────────────────────────────────────────

function updateAgent(
	state: MatchState,
	agentId: string,
	updater: (agent: AgentState) => AgentState
): MatchState {
	return {
		...state,
		agents: state.agents.map((a) =>
			a.id === agentId ? updater(a) : a
		) as [AgentState, AgentState]
	};
}

function getAgent(state: MatchState, agentId: string): AgentState | undefined {
	return state.agents.find((a) => a.id === agentId);
}

function getAgentName(state: MatchState, agentId: string): string {
	return getAgent(state, agentId)?.name ?? agentId;
}

function addLog(
	state: MatchState,
	type: string,
	detail: string,
	data: Record<string, unknown>
): MatchState {
	return {
		...state,
		log: [...state.log, createLog(state, type, detail, data)]
	};
}

function createLog(
	state: MatchState,
	type: string,
	detail: string,
	data: Record<string, unknown>
): MatchLogEntry {
	return {
		tick: state.tick,
		elapsed: state.elapsed,
		type,
		detail,
		data
	};
}
