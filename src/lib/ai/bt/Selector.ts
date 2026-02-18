import { BTNode, BTStatus, type BTContext } from './BTNode';

/**
 * Selector (OR) node: tries children left-to-right.
 * Returns SUCCESS on the first child that succeeds.
 * Returns FAILURE only if every child fails.
 * If a child returns RUNNING, the selector returns RUNNING and
 * resumes from that child on the next tick.
 */
export class Selector extends BTNode {
	private readonly children: BTNode[];
	/** Index of the child that last returned RUNNING (for resumption). */
	private runningIndex: number = 0;

	constructor(name: string, children: BTNode[]) {
		super(name);
		this.children = children;
	}

	tick(context: BTContext): BTStatus {
		for (let i = this.runningIndex; i < this.children.length; i++) {
			const status = this.children[i].tick(context);

			if (status === BTStatus.SUCCESS) {
				this.runningIndex = 0;
				return BTStatus.SUCCESS;
			}

			if (status === BTStatus.RUNNING) {
				this.runningIndex = i;
				return BTStatus.RUNNING;
			}

			// FAILURE: continue to next child
		}

		// All children failed
		this.runningIndex = 0;
		return BTStatus.FAILURE;
	}

	override reset(): void {
		this.runningIndex = 0;
		for (const child of this.children) {
			child.reset();
		}
	}
}
