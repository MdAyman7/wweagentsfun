import type { AgentObservation } from '../../components/agent/AgentObservation';
import type { SeededRandom } from '../../utils/random';
import type { EntityId } from '../../utils/types';
import type { ActionResult, Strategy } from '../Strategy';

/**
 * A single step in a scripted sequence.
 */
export interface ScriptedAction {
	/** The action string (from ActionSpace). */
	action: string;
	/** Optional target entity. */
	target?: EntityId | null;
	/** Optional confidence override. */
	confidence?: number;
}

/**
 * ScriptedStrategy: executes a fixed sequence of actions in order.
 * When the sequence is exhausted, it cycles back to the beginning.
 *
 * Useful for:
 * - Tutorial/training scenarios with predetermined outcomes.
 * - Testing specific move sequences.
 * - Scripted "spots" in a match (e.g., a planned finishing sequence).
 * - Cutscene-like control of a wrestler.
 */
export class ScriptedStrategy implements Strategy {
	readonly id = 'scripted';
	private readonly sequence: ScriptedAction[];
	private currentIndex: number = 0;

	/**
	 * @param sequence - The ordered list of actions to execute. Must have at least one action.
	 */
	constructor(sequence: ScriptedAction[]) {
		if (sequence.length === 0) {
			throw new Error('ScriptedStrategy requires at least one action in the sequence.');
		}
		this.sequence = sequence;
	}

	decide(_observation: AgentObservation, _random: SeededRandom): ActionResult {
		const step = this.sequence[this.currentIndex];

		const result: ActionResult = {
			action: step.action,
			target: step.target ?? null,
			confidence: step.confidence ?? 1.0,
			reasoning: `scripted:step_${this.currentIndex}/${this.sequence.length}`
		};

		// Advance to next step, wrapping around
		this.currentIndex = (this.currentIndex + 1) % this.sequence.length;

		return result;
	}

	/**
	 * Reset the sequence back to the beginning.
	 */
	reset(): void {
		this.currentIndex = 0;
	}

	/**
	 * Get the current position in the sequence (0-indexed).
	 */
	getCurrentIndex(): number {
		return this.currentIndex;
	}

	/**
	 * Get the total number of steps in the sequence.
	 */
	getSequenceLength(): number {
		return this.sequence.length;
	}
}
