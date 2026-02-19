import type { Seed } from './types';

/**
 * Seedable xoshiro128** PRNG (32-bit variant).
 * Deterministic: same seed always produces the same sequence.
 * Used for all game randomness — never use Math.random() in the simulation.
 *
 * Uses xoshiro128** which is designed for 32-bit JavaScript bitwise operations.
 * The 64-bit xoshiro256** variant does NOT work in JS because JS bitwise
 * operators truncate to 32-bit signed integers.
 */
export class SeededRandom {
	private s0: number;
	private s1: number;
	private s2: number;
	private s3: number;

	constructor(seed: Seed) {
		// Initialize state via splitmix32 (32-bit compatible)
		// This properly seeds all 4 state words from a single integer seed
		let s = seed | 0; // force to 32-bit integer
		this.s0 = this.splitmix32(s);
		s = (s + 0x9e3779b9) | 0;
		this.s1 = this.splitmix32(s);
		s = (s + 0x9e3779b9) | 0;
		this.s2 = this.splitmix32(s);
		s = (s + 0x9e3779b9) | 0;
		this.s3 = this.splitmix32(s);

		// Warm up: discard first 20 values to decorrelate from seed
		for (let i = 0; i < 20; i++) this.next();
	}

	/**
	 * SplitMix32 — generates a well-distributed 32-bit hash from an integer.
	 * Used to seed the PRNG state from a single seed value.
	 */
	private splitmix32(s: number): number {
		s = (s + 0x9e3779b9) | 0;
		let t = s ^ (s >>> 16);
		t = Math.imul(t, 0x21f0aaad);
		t = t ^ (t >>> 15);
		t = Math.imul(t, 0x735a2d97);
		t = t ^ (t >>> 15);
		return t >>> 0;
	}

	/**
	 * Returns a float in [0, 1).
	 * xoshiro128** algorithm — designed for 32-bit JS bitwise operations.
	 */
	next(): number {
		const s0 = this.s0;
		const s1 = this.s1;
		const s2 = this.s2;
		const s3 = this.s3;

		// xoshiro128** output function
		const result = Math.imul(this.rotl(Math.imul(s1, 5), 7), 9);

		// State update
		const t = s1 << 9;
		this.s2 ^= s0;
		this.s3 ^= s1;
		this.s1 ^= s2;
		this.s0 ^= s3;
		this.s2 ^= t;
		this.s3 = this.rotl(s3, 11);

		return (result >>> 0) / 0x100000000;
	}

	/** Returns an integer in [min, max] inclusive. */
	int(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	/** Returns a float in [min, max). */
	float(min: number, max: number): number {
		return this.next() * (max - min) + min;
	}

	/** Returns true with the given probability [0, 1]. */
	chance(probability: number): boolean {
		return this.next() < probability;
	}

	/** Pick a random element from an array. */
	pick<T>(array: T[]): T {
		return array[this.int(0, array.length - 1)];
	}

	/** Shuffle an array in place (Fisher-Yates). */
	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = this.int(0, i);
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}

	private rotl(x: number, k: number): number {
		return ((x << k) | (x >>> (32 - k))) >>> 0;
	}
}
