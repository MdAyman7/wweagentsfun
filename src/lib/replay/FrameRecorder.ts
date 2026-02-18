import type { World } from '../ecs/World';
import type { Frame } from '../utils/types';
import { WorldSerializer, type WorldSnapshot } from '../ecs/Serializer';
import { RingBuffer } from '../utils/ringbuffer';

/**
 * Records world snapshots each tick into a ring buffer.
 * Used for instant replay, determinism verification, and training data.
 */
export class FrameRecorder {
	private buffer: RingBuffer<WorldSnapshot>;
	private recording = false;

	/** @param capacity Max frames stored. Older frames are overwritten. */
	constructor(capacity = 3600) {
		this.buffer = new RingBuffer(capacity);
	}

	start(): void {
		this.recording = true;
	}

	stop(): void {
		this.recording = false;
	}

	/** Record the current world state. Called once per tick by GameLoop. */
	record(world: World, frame: Frame): void {
		if (!this.recording) return;
		const snapshot = WorldSerializer.snapshot(world, frame);
		this.buffer.push(snapshot);
	}

	/** Get a snapshot by logical index (0 = oldest recorded). */
	getFrame(index: number): WorldSnapshot | undefined {
		return this.buffer.get(index);
	}

	/** Get the most recently recorded frame. */
	getLatest(): WorldSnapshot | undefined {
		return this.buffer.latest();
	}

	/** Get a range of frames (for replay segments). */
	getRange(startFrame: Frame, endFrame: Frame): WorldSnapshot[] {
		const results: WorldSnapshot[] = [];
		for (const snapshot of this.buffer) {
			if (snapshot.frame >= startFrame && snapshot.frame <= endFrame) {
				results.push(snapshot);
			}
		}
		return results;
	}

	/** Export all recorded frames as an array. */
	exportAll(): WorldSnapshot[] {
		return this.buffer.toArray();
	}

	get frameCount(): number {
		return this.buffer.size;
	}

	get isRecording(): boolean {
		return this.recording;
	}

	clear(): void {
		this.buffer.clear();
	}
}
