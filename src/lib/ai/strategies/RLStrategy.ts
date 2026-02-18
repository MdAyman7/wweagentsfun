import type { AgentObservation } from '../../components/agent/AgentObservation';
import type { SeededRandom } from '../../utils/random';
import type { ActionResult, Strategy } from '../Strategy';
import { ACTION_COUNT, idToAction } from '../rl/ActionSpace';
import { OBSERVATION_SIZE } from '../rl/ObservationSpace';

/**
 * Simple linear policy: action_logits = W * observation + b
 * This is a minimal policy representation that can be replaced
 * with a neural network (ONNX/TF.js) in production.
 */
export interface LinearPolicy {
	/** Weight matrix: ACTION_COUNT rows x OBSERVATION_SIZE columns (flat row-major). */
	weights: number[];
	/** Bias vector: one per action. */
	biases: number[];
}

/**
 * Create an initialized (random) linear policy.
 * Weights are drawn from a small normal-ish distribution.
 */
export function createRandomPolicy(random: SeededRandom): LinearPolicy {
	const totalWeights = ACTION_COUNT * OBSERVATION_SIZE;
	const weights = new Array<number>(totalWeights);
	const biases = new Array<number>(ACTION_COUNT);

	// Xavier-like initialization: scale by 1/sqrt(input_size)
	const scale = 1 / Math.sqrt(OBSERVATION_SIZE);

	for (let i = 0; i < totalWeights; i++) {
		// Approximate normal distribution from uniform
		weights[i] = (random.float(-1, 1) + random.float(-1, 1)) * 0.5 * scale;
	}

	for (let i = 0; i < ACTION_COUNT; i++) {
		biases[i] = 0;
	}

	return { weights, biases };
}

/**
 * Softmax: convert raw logits to a probability distribution.
 */
function softmax(logits: number[]): number[] {
	const maxLogit = Math.max(...logits);
	const exps = logits.map((l) => Math.exp(l - maxLogit));
	const sumExps = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / sumExps);
}

/**
 * Sample an index from a probability distribution.
 */
function sampleCategorical(probs: number[], random: SeededRandom): number {
	const r = random.next();
	let cumulative = 0;
	for (let i = 0; i < probs.length; i++) {
		cumulative += probs[i];
		if (r < cumulative) return i;
	}
	return probs.length - 1;
}

/**
 * Forward pass through the linear policy.
 * Returns raw logits (one per action).
 */
function forwardPass(policy: LinearPolicy, observation: number[]): number[] {
	const logits = new Array<number>(ACTION_COUNT);

	for (let a = 0; a < ACTION_COUNT; a++) {
		let sum = policy.biases[a];
		const rowStart = a * OBSERVATION_SIZE;

		for (let i = 0; i < observation.length && i < OBSERVATION_SIZE; i++) {
			sum += policy.weights[rowStart + i] * observation[i];
		}

		logits[a] = sum;
	}

	return logits;
}

/**
 * RLStrategy: reinforcement learning-based decision making.
 *
 * Uses a simple linear policy (W*obs + b -> softmax -> sample)
 * for initial development and testing. The policy structure is
 * designed to be replaced with an ONNX runtime or TF.js model
 * for production training.
 *
 * Key features:
 * - Deterministic or stochastic action selection (via temperature).
 * - Policy can be hot-swapped via setPolicy().
 * - Epsilon-greedy exploration for training.
 * - Structured for future neural network integration.
 */
export class RLStrategy implements Strategy {
	readonly id = 'rl';
	private policy: LinearPolicy | null = null;
	/** Temperature for softmax sampling. Higher = more random. */
	private temperature: number = 1.0;
	/** Epsilon for epsilon-greedy exploration. 0 = no exploration. */
	private epsilon: number = 0.1;
	/** Whether to use greedy (argmax) selection instead of sampling. */
	private greedy: boolean = false;

	/**
	 * @param policy - Initial policy weights. Null means random action selection.
	 * @param temperature - Softmax temperature. Default 1.0.
	 * @param epsilon - Exploration rate. Default 0.1.
	 */
	constructor(policy?: LinearPolicy, temperature: number = 1.0, epsilon: number = 0.1) {
		this.policy = policy ?? null;
		this.temperature = temperature;
		this.epsilon = epsilon;
	}

	decide(observation: AgentObservation, random: SeededRandom): ActionResult {
		const vec = observation.vector;

		// If no policy is loaded, use purely random actions
		if (!this.policy) {
			const actionId = random.int(0, ACTION_COUNT - 1);
			return {
				action: idToAction(actionId),
				target: null,
				confidence: 1.0 / ACTION_COUNT,
				reasoning: 'rl:no_policy:random'
			};
		}

		// Epsilon-greedy exploration
		if (random.next() < this.epsilon) {
			const actionId = random.int(0, ACTION_COUNT - 1);
			return {
				action: idToAction(actionId),
				target: null,
				confidence: this.epsilon / ACTION_COUNT,
				reasoning: 'rl:epsilon_explore'
			};
		}

		// Forward pass through policy
		const logits = forwardPass(this.policy, vec);

		// Apply temperature
		const temperedLogits = logits.map((l) => l / this.temperature);

		if (this.greedy) {
			// Argmax selection (deterministic)
			let bestIdx = 0;
			let bestVal = temperedLogits[0];
			for (let i = 1; i < temperedLogits.length; i++) {
				if (temperedLogits[i] > bestVal) {
					bestVal = temperedLogits[i];
					bestIdx = i;
				}
			}

			const probs = softmax(temperedLogits);
			return {
				action: idToAction(bestIdx),
				target: null,
				confidence: probs[bestIdx],
				reasoning: `rl:greedy:${idToAction(bestIdx)}(${probs[bestIdx].toFixed(3)})`
			};
		}

		// Stochastic sampling
		const probs = softmax(temperedLogits);
		const sampledIdx = sampleCategorical(probs, random);

		return {
			action: idToAction(sampledIdx),
			target: null,
			confidence: probs[sampledIdx],
			reasoning: `rl:sample:${idToAction(sampledIdx)}(p=${probs[sampledIdx].toFixed(3)})`
		};
	}

	/**
	 * Hot-swap the policy weights (e.g., after a training update).
	 */
	setPolicy(policy: LinearPolicy): void {
		this.policy = policy;
	}

	/**
	 * Set the softmax temperature.
	 * Lower values make the policy more deterministic.
	 */
	setTemperature(temp: number): void {
		this.temperature = Math.max(0.01, temp);
	}

	/**
	 * Set the exploration rate.
	 */
	setEpsilon(eps: number): void {
		this.epsilon = Math.max(0, Math.min(1, eps));
	}

	/**
	 * Switch between greedy (argmax) and stochastic (sampling) mode.
	 */
	setGreedy(greedy: boolean): void {
		this.greedy = greedy;
	}

	/**
	 * Get the current policy (for serialization / training bridge).
	 */
	getPolicy(): LinearPolicy | null {
		return this.policy;
	}

	/**
	 * Initialize a random policy using the provided RNG.
	 */
	initializeRandomPolicy(random: SeededRandom): void {
		this.policy = createRandomPolicy(random);
	}
}
