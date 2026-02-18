import type { ComponentData } from '../../ecs/Component';
import type { EntityId } from '../../utils/types';

/**
 * Written by the AI system each decision tick.
 * Read by the combat system to execute the chosen action.
 */
export interface AgentDecision extends ComponentData {
	readonly _type: 'AgentDecision';
	action: string;
	target: EntityId | null;
	confidence: number;
	/** Debug tag for why this decision was made. */
	reasoning: string;
}

export function createAgentDecision(overrides: Partial<Omit<AgentDecision, '_type'>> = {}): AgentDecision {
	return {
		_type: 'AgentDecision',
		action: 'idle',
		target: null,
		confidence: 0,
		reasoning: '',
		...overrides
	};
}
