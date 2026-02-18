import type { AgentObservation } from '../components/agent/AgentObservation';
import type { SeededRandom } from '../utils/random';
import type { EntityId } from '../utils/types';

/**
 * Result of an AI strategy decision.
 * Consumed by the combat system to execute the chosen action.
 */
export interface ActionResult {
	action: string;
	target: EntityId | null;
	confidence: number;
	reasoning: string;
}

/**
 * Strategy interface — the core decision-making contract.
 * Each strategy implementation encapsulates a different AI approach
 * (scripted, behavior tree, utility AI, RL, or hybrid).
 */
export interface Strategy {
	readonly id: string;
	decide(observation: AgentObservation, random: SeededRandom): ActionResult;
}
