import type { MatchDebugger, DebugPhase } from './MatchLoop';
import type { MatchState } from './MatchState';

/**
 * ConsoleMatchDebugger — diagnostic trace logger for the match loop.
 *
 * Attach to MatchLoop via `matchLoop.setDebugger(new ConsoleMatchDebugger())`.
 *
 * Output:
 *   - State transitions: logs every FSM state change with fighter name
 *   - Distance: logs distance between fighters once per second
 *   - Velocity: logs movement velocity at decision points
 *   - Current state: logs agent phase at decision points
 *
 * Disable by calling `matchLoop.setDebugger(null)`.
 */
export class ConsoleMatchDebugger implements MatchDebugger {
	/** Previous phase per agent — to detect transitions. */
	private prevPhase: Map<string, string> = new Map();

	/** Tracks last distance log tick (log once per second = 60 ticks). */
	private lastDistanceLogTick = 0;

	/** Distance log interval in ticks. */
	private readonly distanceLogInterval: number;

	/**
	 * @param distanceLogInterval — Ticks between distance logs. Default 60 (~1 per second).
	 */
	constructor(distanceLogInterval: number = 60) {
		this.distanceLogInterval = distanceLogInterval;
	}

	onTickStart(_tick: number): void {
		// no-op
	}

	onPhase(phase: DebugPhase, state: MatchState): void {
		// ── Log state transitions after FSM phase ──
		if (phase === 'fsm') {
			for (const agent of state.agents) {
				const prev = this.prevPhase.get(agent.id);
				if (prev && prev !== agent.phase) {
					console.log(
						`[FSM] ${agent.name}: ${prev} → ${agent.phase}` +
						(agent.activeMove ? ` (move: ${agent.activeMove})` : '')
					);
				}
				this.prevPhase.set(agent.id, agent.phase);
			}
		}

		// ── Log distance once per second ──
		if (phase === 'movement' && state.tick - this.lastDistanceLogTick >= this.distanceLogInterval) {
			this.lastDistanceLogTick = state.tick;
			const [a, b] = state.agents;
			const distance = Math.abs(a.positionX - b.positionX).toFixed(2);
			console.log(
				`[DIST] tick=${state.tick} distance=${distance} ` +
				`| ${a.name}: x=${a.positionX.toFixed(2)} phase=${a.phase} hp=${a.health}/${a.maxHealth} stam=${a.stamina.toFixed(0)} ` +
				`| ${b.name}: x=${b.positionX.toFixed(2)} phase=${b.phase} hp=${b.health}/${b.maxHealth} stam=${b.stamina.toFixed(0)}`
			);
		}

		// ── Log decision outcomes ──
		if (phase === 'decision') {
			for (const agent of state.agents) {
				const prev = this.prevPhase.get(agent.id) ?? agent.phase;
				// Detect when agent transitions to a new action-phase from idle/moving
				if ((prev === 'idle' || prev === 'moving') && agent.phase !== prev) {
					const opponent = state.agents.find((a) => a.id !== agent.id)!;
					const dist = Math.abs(agent.positionX - opponent.positionX).toFixed(2);
					console.log(
						`[DECIDE] ${agent.name}: ${prev} → ${agent.phase} dist=${dist}`
					);
				}
			}
		}
	}

	onTickEnd(_state: MatchState): void {
		// no-op
	}
}
