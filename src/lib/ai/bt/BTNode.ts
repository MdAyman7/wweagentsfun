/**
 * Behavior tree node status.
 * SUCCESS: the node completed its task successfully.
 * FAILURE: the node could not complete its task.
 * RUNNING: the node is still processing (multi-frame execution).
 */
export enum BTStatus {
	SUCCESS = 'SUCCESS',
	FAILURE = 'FAILURE',
	RUNNING = 'RUNNING'
}

/**
 * Blackboard context passed through the behavior tree during a tick.
 * Contains all observable state the tree nodes need for decisions.
 */
export interface BTContext {
	/** Normalized observation vector from AgentObservation. */
	observationVector: number[];
	/** Human-readable observation labels. */
	observationLabels: string[];
	/** Result stash: leaf nodes write their chosen action here. */
	resultAction: string;
	/** Target entity for the action. */
	resultTarget: number | null;
	/** Confidence in the chosen action (0-1). */
	resultConfidence: number;
	/** Reasoning string for debugging. */
	resultReasoning: string;
	/** Arbitrary key-value store for inter-node communication. */
	blackboard: Map<string, unknown>;
}

/**
 * Create a fresh BTContext from an observation vector.
 */
export function createBTContext(
	vector: number[],
	labels: string[]
): BTContext {
	return {
		observationVector: vector,
		observationLabels: labels,
		resultAction: 'idle',
		resultTarget: null,
		resultConfidence: 0,
		resultReasoning: '',
		blackboard: new Map()
	};
}

/**
 * Abstract base class for all behavior tree nodes.
 * Subclasses must implement tick() which evaluates the node
 * and returns a BTStatus.
 */
export abstract class BTNode {
	readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	/**
	 * Evaluate this node given the current context.
	 * Must return SUCCESS, FAILURE, or RUNNING.
	 */
	abstract tick(context: BTContext): BTStatus;

	/**
	 * Reset internal state (for nodes that track RUNNING status across frames).
	 * Override in subclasses that maintain state.
	 */
	reset(): void {
		// Default: no-op. Override if the node has internal state.
	}
}
