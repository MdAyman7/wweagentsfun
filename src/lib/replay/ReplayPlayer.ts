import type { World } from '../ecs/World';
import { WorldSerializer, type WorldSnapshot } from '../ecs/Serializer';
import type { Frame } from '../utils/types';

/**
 * Replays recorded frames by restoring world state from snapshots.
 * Supports play, pause, scrub, and variable speed.
 */
export class ReplayPlayer {
	private frames: WorldSnapshot[] = [];
	private currentIndex = 0;
	private playing = false;
	private _speed = 1.0;
	private accumulator = 0;

	/** Load frames for playback. */
	load(frames: WorldSnapshot[]): void {
		this.frames = frames;
		this.currentIndex = 0;
		this.playing = false;
	}

	/** Restore the world to the current frame's state. */
	applyFrame(world: World): void {
		const snapshot = this.frames[this.currentIndex];
		if (snapshot) {
			WorldSerializer.restore(world, snapshot);
		}
	}

	/** Advance playback by dt milliseconds. Returns true if a new frame was applied. */
	update(dt: number): boolean {
		if (!this.playing || this.frames.length === 0) return false;

		this.accumulator += dt * this._speed;
		const frameMs = 1000 / 60; // assumes 60fps recording

		if (this.accumulator >= frameMs) {
			this.accumulator -= frameMs;
			this.currentIndex++;
			if (this.currentIndex >= this.frames.length) {
				this.currentIndex = this.frames.length - 1;
				this.playing = false;
			}
			return true;
		}
		return false;
	}

	/** Scrub to a specific frame index. */
	seekToIndex(index: number): void {
		this.currentIndex = Math.max(0, Math.min(index, this.frames.length - 1));
	}

	/** Scrub to a specific frame number. */
	seekToFrame(frame: Frame): void {
		const index = this.frames.findIndex((f) => f.frame >= frame);
		if (index >= 0) this.currentIndex = index;
	}

	play(): void {
		this.playing = true;
	}

	pause(): void {
		this.playing = false;
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	get currentFrame(): Frame {
		return this.frames[this.currentIndex]?.frame ?? 0;
	}

	get totalFrames(): number {
		return this.frames.length;
	}

	get progress(): number {
		if (this.frames.length === 0) return 0;
		return this.currentIndex / (this.frames.length - 1);
	}

	set speed(s: number) {
		this._speed = Math.max(0.1, Math.min(4, s));
	}

	get speed(): number {
		return this._speed;
	}
}
