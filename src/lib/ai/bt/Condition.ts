import { BTNode, BTStatus, type BTContext } from './BTNode';

/**
 * Predicate function type for condition checks.
 * Receives the full BT context so it can inspect the observation vector,
 * blackboard values, or any other available data.
 */
export type ConditionPredicate = (context: BTContext) => boolean;

/**
 * Condition node: leaf node that evaluates a predicate.
 * Returns SUCCESS if the predicate is true, FAILURE otherwise.
 * Never returns RUNNING — conditions are always instant.
 */
export class Condition extends BTNode {
	private readonly predicate: ConditionPredicate;

	constructor(name: string, predicate: ConditionPredicate) {
		super(name);
		this.predicate = predicate;
	}

	tick(context: BTContext): BTStatus {
		return this.predicate(context) ? BTStatus.SUCCESS : BTStatus.FAILURE;
	}
}

// ── Common pre-built condition factories ──

/**
 * Check if an observation value at a given index exceeds a threshold.
 */
export function observationAbove(
	label: string,
	index: number,
	threshold: number
): Condition {
	return new Condition(`${label} > ${threshold}`, (ctx) => {
		return (ctx.observationVector[index] ?? 0) > threshold;
	});
}

/**
 * Check if an observation value at a given index is below a threshold.
 */
export function observationBelow(
	label: string,
	index: number,
	threshold: number
): Condition {
	return new Condition(`${label} < ${threshold}`, (ctx) => {
		return (ctx.observationVector[index] ?? 0) < threshold;
	});
}

/**
 * Check a blackboard value.
 */
export function blackboardEquals(
	key: string,
	value: unknown
): Condition {
	return new Condition(`bb[${key}]==${String(value)}`, (ctx) => {
		return ctx.blackboard.get(key) === value;
	});
}

/**
 * Check if a blackboard key exists (is set to a truthy value).
 */
export function blackboardTruthy(key: string): Condition {
	return new Condition(`bb[${key}]?`, (ctx) => {
		return !!ctx.blackboard.get(key);
	});
}
