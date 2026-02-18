import { BTNode, BTStatus, type BTContext } from './BTNode';

/**
 * Inverter decorator: flips SUCCESS to FAILURE and vice versa.
 * RUNNING passes through unchanged.
 */
export class Inverter extends BTNode {
	private readonly child: BTNode;

	constructor(child: BTNode) {
		super(`Invert(${child.name})`);
		this.child = child;
	}

	tick(context: BTContext): BTStatus {
		const status = this.child.tick(context);
		if (status === BTStatus.SUCCESS) return BTStatus.FAILURE;
		if (status === BTStatus.FAILURE) return BTStatus.SUCCESS;
		return BTStatus.RUNNING;
	}

	override reset(): void {
		this.child.reset();
	}
}

/**
 * Repeater decorator: runs the child N times.
 * Returns SUCCESS after N successful completions.
 * Returns FAILURE immediately if the child fails (unless failSafe is true).
 * RUNNING from the child pauses the repeat count until next tick.
 */
export class Repeater extends BTNode {
	private readonly child: BTNode;
	private readonly repeatCount: number;
	private readonly failSafe: boolean;
	private currentIteration: number = 0;

	/**
	 * @param child - The child node to repeat.
	 * @param repeatCount - How many times to run the child. Must be >= 1.
	 * @param failSafe - If true, continue repeating even when the child fails.
	 */
	constructor(child: BTNode, repeatCount: number, failSafe: boolean = false) {
		super(`Repeat(${child.name}, ${repeatCount})`);
		this.child = child;
		this.repeatCount = Math.max(1, repeatCount);
		this.failSafe = failSafe;
	}

	tick(context: BTContext): BTStatus {
		while (this.currentIteration < this.repeatCount) {
			const status = this.child.tick(context);

			if (status === BTStatus.RUNNING) {
				return BTStatus.RUNNING;
			}

			if (status === BTStatus.FAILURE && !this.failSafe) {
				this.currentIteration = 0;
				return BTStatus.FAILURE;
			}

			this.currentIteration++;
			this.child.reset();
		}

		this.currentIteration = 0;
		return BTStatus.SUCCESS;
	}

	override reset(): void {
		this.currentIteration = 0;
		this.child.reset();
	}
}

/**
 * UntilFail decorator: runs the child repeatedly until it returns FAILURE.
 * Always returns SUCCESS after the child fails (the failure is "expected").
 * If the child keeps succeeding, UntilFail keeps running (returns RUNNING
 * to avoid infinite loops within a single tick).
 */
export class UntilFail extends BTNode {
	private readonly child: BTNode;
	/** Maximum iterations per tick to prevent infinite loops. */
	private readonly maxPerTick: number;

	constructor(child: BTNode, maxPerTick: number = 100) {
		super(`UntilFail(${child.name})`);
		this.child = child;
		this.maxPerTick = maxPerTick;
	}

	tick(context: BTContext): BTStatus {
		let iterations = 0;

		while (iterations < this.maxPerTick) {
			const status = this.child.tick(context);

			if (status === BTStatus.FAILURE) {
				return BTStatus.SUCCESS;
			}

			if (status === BTStatus.RUNNING) {
				return BTStatus.RUNNING;
			}

			// Child succeeded — reset and try again
			this.child.reset();
			iterations++;
		}

		// Hit per-tick iteration cap: yield and come back next tick
		return BTStatus.RUNNING;
	}

	override reset(): void {
		this.child.reset();
	}
}

/**
 * Succeeder decorator: always returns SUCCESS regardless of child result.
 * Useful for optional branches that should never fail the parent.
 */
export class Succeeder extends BTNode {
	private readonly child: BTNode;

	constructor(child: BTNode) {
		super(`Succeeder(${child.name})`);
		this.child = child;
	}

	tick(context: BTContext): BTStatus {
		const status = this.child.tick(context);
		if (status === BTStatus.RUNNING) return BTStatus.RUNNING;
		return BTStatus.SUCCESS;
	}

	override reset(): void {
		this.child.reset();
	}
}
