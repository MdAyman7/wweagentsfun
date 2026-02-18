/**
 * Generic object pool for zero-allocation hot paths.
 * Pre-allocates objects and recycles them to avoid GC pressure during the game loop.
 */
export class ObjectPool<T> {
	private pool: T[] = [];
	private factory: () => T;
	private reset: (obj: T) => void;

	constructor(factory: () => T, reset: (obj: T) => void, initialSize = 32) {
		this.factory = factory;
		this.reset = reset;
		for (let i = 0; i < initialSize; i++) {
			this.pool.push(factory());
		}
	}

	/** Acquire an object from the pool (or create a new one if empty). */
	acquire(): T {
		if (this.pool.length > 0) {
			return this.pool.pop()!;
		}
		return this.factory();
	}

	/** Return an object to the pool after use. Resets it to default state. */
	release(obj: T): void {
		this.reset(obj);
		this.pool.push(obj);
	}

	get available(): number {
		return this.pool.length;
	}

	clear(): void {
		this.pool.length = 0;
	}
}
