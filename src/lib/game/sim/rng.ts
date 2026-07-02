/**
 * Deterministic PRNG (mulberry32) — same seed always yields the same sequence.
 * Kept free of TS constructor parameter-properties so `node --experimental-strip-types`
 * can execute the sim headlessly.
 */
export class Rng {
	private state: number;

	constructor(seed: number) {
		// Mix the seed so small/adjacent seeds diverge immediately.
		let s = (seed ^ 0x9e3779b9) >>> 0;
		s = Math.imul(s ^ (s >>> 16), 0x21f0aaad) >>> 0;
		this.state = s >>> 0;
	}

	/** float in [0, 1) */
	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** float in [min, max) */
	range(min: number, max: number): number {
		return min + this.next() * (max - min);
	}

	/** integer in [min, max] inclusive */
	int(min: number, max: number): number {
		return Math.floor(this.range(min, max + 1));
	}

	/** true with probability p (0..1) */
	chance(p: number): boolean {
		return this.next() < p;
	}

	/** pick a random element */
	pick<T>(arr: readonly T[]): T {
		return arr[Math.floor(this.next() * arr.length)];
	}

	/**
	 * Weighted pick. `items` paired with `weights`. Returns the chosen index.
	 * Falls back to the last index if weights sum to ~0.
	 */
	weightedIndex(weights: readonly number[]): number {
		let total = 0;
		for (const w of weights) total += Math.max(0, w);
		if (total <= 0) return weights.length - 1;
		let roll = this.next() * total;
		for (let i = 0; i < weights.length; i++) {
			roll -= Math.max(0, weights[i]);
			if (roll <= 0) return i;
		}
		return weights.length - 1;
	}
}
