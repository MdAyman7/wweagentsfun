import type { Seed } from './types';

/**
 * Seedable xoshiro256** PRNG.
 * Deterministic: same seed always produces the same sequence.
 * Used for all game randomness — never use Math.random() in the simulation.
 */
export class SeededRandom {
	private state: [number, number, number, number];

	constructor(seed: Seed) {
		// Initialize state from seed via splitmix64
		this.state = [0, 0, 0, 0];
		let s = seed;
		for (let i = 0; i < 4; i++) {
			s += 0x9e3779b97f4a7c15;
			let z = s;
			z = (z ^ (z >>> 30)) * 0xbf58476d1ce4e5b9;
			z = (z ^ (z >>> 27)) * 0x94d049bb133111eb;
			z = z ^ (z >>> 31);
			this.state[i] = z >>> 0;
		}
	}

	/** Returns a float in [0, 1). */
	next(): number {
		const result = this.rotl(this.state[1] * 5, 7) * 9;
		const t = this.state[1] << 17;

		this.state[2] ^= this.state[0];
		this.state[3] ^= this.state[1];
		this.state[1] ^= this.state[2];
		this.state[0] ^= this.state[3];

		this.state[2] ^= t;
		this.state[3] = this.rotl(this.state[3], 45);

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
