import type { Frame, Seed } from '../utils/types';
import { SeededRandom } from '../utils/random';

/**
 * Deterministic clock for the simulation.
 *
 * Provides:
 * - Frame counter (monotonically increasing)
 * - Fixed delta time (derived from tick rate)
 * - Seedable PRNG (all randomness goes through this)
 *
 * Never uses Date.now() or Math.random() — fully deterministic.
 */
export class Clock {
	private _frame: Frame = 0;
	private _deltaTime: number;
	readonly seed: Seed;
	readonly random: SeededRandom;

	constructor(seed: Seed, tickRate = 60) {
		this.seed = seed;
		this._deltaTime = 1 / tickRate;
		this.random = new SeededRandom(seed);
	}

	/** Current simulation frame. */
	get frame(): Frame {
		return this._frame;
	}

	/** Fixed delta time per tick (in seconds). */
	get deltaTime(): number {
		return this._deltaTime;
	}

	/** Elapsed simulation time (in seconds). */
	get elapsed(): number {
		return this._frame * this._deltaTime;
	}

	/** Advance the clock by one tick. */
	advance(): void {
		this._frame++;
	}

	/** Reset the clock to frame 0 (does NOT reset the PRNG). */
	reset(): void {
		this._frame = 0;
	}
}
