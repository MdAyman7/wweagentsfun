import type { ComponentData } from '../../ecs/Component';

/**
 * Flattened observation vector for RL and decision-making.
 * Populated by ObservationSystem each AI tick from raw components.
 * This is the "eyes" of the agent — what it can perceive.
 */
export interface AgentObservation extends ComponentData {
	readonly _type: 'AgentObservation';
	/** Normalized float vector. Exact layout defined by ObservationSpace. */
	vector: number[];
	/** Human-readable labels for debugging. */
	labels: string[];
}

export function createAgentObservation(): AgentObservation {
	return {
		_type: 'AgentObservation',
		vector: [],
		labels: []
	};
}
