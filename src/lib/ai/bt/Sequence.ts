import { BTNode, BTStatus, type BTContext } from './BTNode';

/**
 * Sequence (AND) node: runs children left-to-right.
 * Returns FAILURE on the first child that fails.
 * Returns SUCCESS only if every child succeeds.
 * If a child returns RUNNING, the sequence returns RUNNING and
 * resumes from that child on the next tick.
 */
export class Sequence extends BTNode {
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

			if (status === BTStatus.FAILURE) {
				this.runningIndex = 0;
				return BTStatus.FAILURE;
			}

			if (status === BTStatus.RUNNING) {
				this.runningIndex = i;
				return BTStatus.RUNNING;
			}

			// SUCCESS: continue to next child
		}

		// All children succeeded
		this.runningIndex = 0;
		return BTStatus.SUCCESS;
	}

	override reset(): void {
		this.runningIndex = 0;
		for (const child of this.children) {
			child.reset();
		}
	}
}
