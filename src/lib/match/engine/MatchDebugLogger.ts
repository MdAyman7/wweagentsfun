import type { MatchState } from './MatchState';
import type { MatchDebugger, DebugPhase } from './MatchLoop';

/**
 * Verbosity levels for debug output.
 */
export type DebugVerbosity = 'minimal' | 'normal' | 'verbose';

/**
 * Snapshot of one agent's state for debug comparison.
 */
interface AgentSnapshot {
	id: string;
	health: number;
	stamina: number;
	momentum: number;
	phase: string;
	positionX: number;
	activeMove: string | null;
}

/**
 * ConsoleMatchDebugger — concrete MatchDebugger that logs to console
 * with configurable verbosity and optional filtering.
 *
 * USAGE:
 *   const dbg = new ConsoleMatchDebugger({ verbosity: 'normal' });
 *   matchLoop.setDebugger(dbg);
 *   matchLoop.step(); // logs phase-by-phase trace
 *
 *   // Filter to only specific phases:
 *   const dbg = new ConsoleMatchDebugger({ phases: ['combat', 'reaction'] });
 *
 *   // Get stats after simulation:
 *   console.log(dbg.getSummary());
 */
export class ConsoleMatchDebugger implements MatchDebugger {
	private readonly verbosity: DebugVerbosity;
	private readonly phaseFilter: Set<DebugPhase> | null;

	/** Previous snapshot for diff detection. */
	private prevSnapshots: Map<string, AgentSnapshot> = new Map();

	/** Accumulated stats for summary. */
	private stats = {
		totalTicks: 0,
		phaseChanges: 0,
		hitsLanded: 0,
		misses: 0,
		knockdowns: 0,
		comebacks: 0,
		emotionChanges: 0,
		maxHealthDelta: 0,
		longestPhase: { phase: '' as string, agent: '', duration: 0 }
	};

	/** Current tick's log entries (built up across phases). */
	private tickLog: string[] = [];
	private currentTick = 0;

	/** Phase timing for the current agent. */
	private phaseDurations: Map<string, number> = new Map();

	constructor(options?: {
		verbosity?: DebugVerbosity;
		phases?: DebugPhase[];
	}) {
		this.verbosity = options?.verbosity ?? 'normal';
		this.phaseFilter = options?.phases ? new Set(options.phases) : null;
	}

	onTickStart(tick: number): void {
		this.currentTick = tick;
		this.tickLog = [];
		this.stats.totalTicks++;

		if (this.verbosity === 'verbose') {
			this.tickLog.push(`\n══════ TICK ${tick} (${(tick / 60).toFixed(2)}s) ══════`);
		}
	}

	onPhase(phase: DebugPhase, state: MatchState): void {
		// Skip filtered-out phases
		if (this.phaseFilter && !this.phaseFilter.has(phase)) return;

		switch (phase) {
			case 'tick':
				this.logTickPhase(state);
				break;
			case 'psychology':
				this.logPsychologyPhase(state);
				break;
			case 'decision':
				this.logDecisionPhase(state);
				break;
			case 'fsm':
				this.logFSMPhase(state);
				break;
			case 'movement':
				this.logMovementPhase(state);
				break;
			case 'combat':
				this.logCombatPhase(state);
				break;
			case 'reaction':
				this.logReactionPhase(state);
				break;
			case 'win_check':
				this.logWinCheckPhase(state);
				break;
		}
	}

	onTickEnd(state: MatchState): void {
		// Track phase durations
		for (const agent of state.agents) {
			const key = `${agent.id}:${agent.phase}`;
			const dur = (this.phaseDurations.get(key) ?? 0) + 1;
			this.phaseDurations.set(key, dur);
			if (dur > this.stats.longestPhase.duration) {
				this.stats.longestPhase = { phase: agent.phase, agent: agent.id, duration: dur };
			}
		}

		// Save snapshots for next tick diff
		for (const agent of state.agents) {
			this.prevSnapshots.set(agent.id, {
				id: agent.id,
				health: agent.health,
				stamina: agent.stamina,
				momentum: agent.momentum,
				phase: agent.phase,
				positionX: agent.positionX,
				activeMove: agent.activeMove
			});
		}

		// Flush tick log if there's anything interesting
		if (this.tickLog.length > 0) {
			if (this.verbosity === 'minimal') {
				// Minimal: only print if something happened
				if (this.tickLog.some(l => !l.startsWith('\n'))) {
					console.log(this.tickLog.join('\n'));
				}
			} else {
				console.log(this.tickLog.join('\n'));
			}
		}
	}

	/**
	 * Get a summary of the entire simulation.
	 */
	getSummary(): string {
		const lines: string[] = [
			'\n╔════════════════════════════════════╗',
			'║      MATCH SIMULATION SUMMARY      ║',
			'╚════════════════════════════════════╝',
			`  Total ticks: ${this.stats.totalTicks} (${(this.stats.totalTicks / 60).toFixed(1)}s)`,
			`  Phase changes: ${this.stats.phaseChanges}`,
			`  Hits landed: ${this.stats.hitsLanded}`,
			`  Misses: ${this.stats.misses}`,
			`  Knockdowns: ${this.stats.knockdowns}`,
			`  Comebacks: ${this.stats.comebacks}`,
			`  Emotion changes: ${this.stats.emotionChanges}`,
			`  Max health delta/tick: ${this.stats.maxHealthDelta}`,
			`  Longest phase: ${this.stats.longestPhase.agent} in ${this.stats.longestPhase.phase} (${this.stats.longestPhase.duration} ticks)`
		];
		return lines.join('\n');
	}

	// ─── Per-Phase Logging ───────────────────────────────────────

	private logTickPhase(state: MatchState): void {
		if (this.verbosity !== 'verbose') return;

		for (const agent of state.agents) {
			const prev = this.prevSnapshots.get(agent.id);
			if (!prev) continue;

			const staminaDelta = agent.stamina - prev.stamina;
			if (Math.abs(staminaDelta) > 0.01) {
				this.tickLog.push(`  [TICK] ${agent.name}: stamina ${prev.stamina.toFixed(1)} → ${agent.stamina.toFixed(1)} (${staminaDelta > 0 ? '+' : ''}${staminaDelta.toFixed(2)})`);
			}
		}
	}

	private logPsychologyPhase(state: MatchState): void {
		// Check for emotion changes in the last log entries
		const recentLogs = state.log.slice(-4);
		for (const log of recentLogs) {
			if (log.tick === state.tick && log.type === 'emotion_change') {
				this.tickLog.push(`  [PSYCH] ${log.detail}`);
				this.stats.emotionChanges++;
			}
		}
	}

	private logDecisionPhase(state: MatchState): void {
		if (this.verbosity === 'minimal') return;

		// Look for new action logs in this tick
		const recentLogs = state.log.slice(-4);
		for (const log of recentLogs) {
			if (log.tick !== state.tick) continue;
			if (log.type === 'taunt' || log.type === 'mistake') {
				this.tickLog.push(`  [AI] ${log.detail}`);
			}
		}
	}

	private logFSMPhase(state: MatchState): void {
		for (const agent of state.agents) {
			const prev = this.prevSnapshots.get(agent.id);
			if (!prev) continue;

			if (agent.phase !== prev.phase) {
				this.stats.phaseChanges++;
				if (this.verbosity !== 'minimal' || agent.phase === 'active' || agent.phase === 'stun' || agent.phase === 'knockdown') {
					const moveInfo = agent.activeMove ? ` [${agent.activeMove}]` : '';
					this.tickLog.push(`  [FSM] ${agent.name}: ${prev.phase} → ${agent.phase}${moveInfo}`);
				}
			}
		}
	}

	private logMovementPhase(state: MatchState): void {
		if (this.verbosity !== 'verbose') return;

		for (const agent of state.agents) {
			const prev = this.prevSnapshots.get(agent.id);
			if (!prev) continue;

			const dx = Math.abs(agent.positionX - prev.positionX);
			if (dx > 0.01) {
				this.tickLog.push(`  [MOVE] ${agent.name}: x=${prev.positionX.toFixed(2)} → ${agent.positionX.toFixed(2)} (Δ${dx.toFixed(3)})`);
			}
		}
	}

	private logCombatPhase(state: MatchState): void {
		const recentLogs = state.log.slice(-4);
		for (const log of recentLogs) {
			if (log.tick !== state.tick) continue;

			if (log.type === 'move_hit') {
				this.stats.hitsLanded++;
				const healthDelta = (log.data.damage as number) ?? 0;
				this.stats.maxHealthDelta = Math.max(this.stats.maxHealthDelta, healthDelta);
				this.tickLog.push(`  [COMBAT] ✦ ${log.detail}`);
			} else if (log.type === 'move_miss') {
				this.stats.misses++;
				if (this.verbosity !== 'minimal') {
					this.tickLog.push(`  [COMBAT] ✗ ${log.detail}`);
				}
			} else if (log.type === 'reversal') {
				this.tickLog.push(`  [COMBAT] ⚡ ${log.detail}`);
			}
		}
	}

	private logReactionPhase(state: MatchState): void {
		const recentLogs = state.log.slice(-4);
		for (const log of recentLogs) {
			if (log.tick !== state.tick) continue;

			if (log.type === 'knockdown') {
				this.stats.knockdowns++;
				this.tickLog.push(`  [REACTION] 💥 ${log.detail}`);
			} else if (log.type === 'comeback') {
				this.stats.comebacks++;
				this.tickLog.push(`  [REACTION] 🔥 ${log.detail}`);
			}
		}
	}

	private logWinCheckPhase(state: MatchState): void {
		if (!state.running && state.result) {
			this.tickLog.push(`  [WIN] 🏆 ${state.result.winnerId} wins by ${state.result.method}!`);
			this.tickLog.push(`  [WIN] Rating: ${'★'.repeat(Math.floor(state.result.rating))}${'☆'.repeat(5 - Math.floor(state.result.rating))} (${state.result.rating.toFixed(1)})`);
		}
	}
}

/**
 * BufferMatchDebugger — collects all debug output into a buffer
 * instead of printing to console. Useful for tests and batch analysis.
 */
export class BufferMatchDebugger implements MatchDebugger {
	readonly entries: Array<{
		tick: number;
		phase: DebugPhase;
		agents: Array<{ id: string; phase: string; health: number; positionX: number }>;
	}> = [];

	onTickStart(_tick: number): void {}

	onPhase(phase: DebugPhase, state: MatchState): void {
		this.entries.push({
			tick: state.tick,
			phase,
			agents: state.agents.map(a => ({
				id: a.id,
				phase: a.phase,
				health: a.health,
				positionX: a.positionX
			}))
		});
	}

	onTickEnd(_state: MatchState): void {}

	/** Return all entries for a specific phase. */
	getPhaseEntries(phase: DebugPhase) {
		return this.entries.filter(e => e.phase === phase);
	}

	/** Return the tick numbers where a specific agent changed phase. */
	getPhaseChanges(agentId: string): Array<{ tick: number; phase: string }> {
		const changes: Array<{ tick: number; phase: string }> = [];
		let lastPhase = '';
		for (const entry of this.entries) {
			const agent = entry.agents.find(a => a.id === agentId);
			if (agent && agent.phase !== lastPhase) {
				changes.push({ tick: entry.tick, phase: agent.phase });
				lastPhase = agent.phase;
			}
		}
		return changes;
	}
}
