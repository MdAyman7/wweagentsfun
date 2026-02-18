/**
 * Fixed-size circular buffer.
 * Used for replay frame storage, agent memory, and event history.
 * When full, oldest entries are overwritten.
 */
export class RingBuffer<T> {
	private buffer: (T | undefined)[];
	private head = 0;
	private _size = 0;

	constructor(readonly capacity: number) {
		this.buffer = new Array(capacity);
	}

	/** Push an item. Overwrites oldest if at capacity. */
	push(item: T): void {
		this.buffer[this.head] = item;
		this.head = (this.head + 1) % this.capacity;
		if (this._size < this.capacity) this._size++;
	}

	/** Get item at logical index (0 = oldest). */
	get(index: number): T | undefined {
		if (index < 0 || index >= this._size) return undefined;
		const realIndex = (this.head - this._size + index + this.capacity) % this.capacity;
		return this.buffer[realIndex];
	}

	/** Get the most recent item. */
	latest(): T | undefined {
		if (this._size === 0) return undefined;
		return this.buffer[(this.head - 1 + this.capacity) % this.capacity];
	}

	/** Iterate from oldest to newest. */
	*[Symbol.iterator](): Iterator<T> {
		for (let i = 0; i < this._size; i++) {
			yield this.get(i)!;
		}
	}

	/** Convert to array (oldest first). */
	toArray(): T[] {
		const result: T[] = [];
		for (const item of this) result.push(item);
		return result;
	}

	get size(): number {
		return this._size;
	}

	get isFull(): boolean {
		return this._size === this.capacity;
	}

	clear(): void {
		this.buffer.fill(undefined);
		this.head = 0;
		this._size = 0;
	}
}
