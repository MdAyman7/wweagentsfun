import type { ComponentData } from '../../ecs/Component';

/**
 * Short-term memory for the agent.
 * Tracks recent moves, opponent patterns, and counter success rate.
 * Used by AI strategies to adapt mid-match.
 */
export interface AgentMemory extends ComponentData {
	readonly _type: 'AgentMemory';
	/** Recent moves this agent has used (ring buffer semantics — newest last). */
	recentMoves: string[];
	/** Opponent's recent moves (for pattern detection). */
	opponentMoves: string[];
	/** Counter attempt success rate (0–1). */
	counterSuccessRate: number;
	/** Total counters attempted / succeeded. */
	countersAttempted: number;
	countersSucceeded: number;
	/** Moves that have been reversed against this agent recently. */
	reversedMoves: string[];
}

export function createAgentMemory(): AgentMemory {
	return {
		_type: 'AgentMemory',
		recentMoves: [],
		opponentMoves: [],
		counterSuccessRate: 0,
		countersAttempted: 0,
		countersSucceeded: 0,
		reversedMoves: []
	};
}
