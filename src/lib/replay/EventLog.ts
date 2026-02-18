import type { Frame } from '../utils/types';

interface LoggedEvent {
	frame: Frame;
	type: string;
	payload: unknown;
	timestamp: number;
}

/**
 * Append-only event log.
 * Captures all events emitted during a match for:
 * - Post-match analytics
 * - Training data generation
 * - Commentary replay
 * - Match rating calculation
 */
export class EventLog {
	private events: LoggedEvent[] = [];
	private pendingEvents: LoggedEvent[] = [];

	/** Add an event to the pending buffer. */
	push(frame: Frame, type: string, payload: unknown): void {
		this.pendingEvents.push({
			frame,
			type,
			payload,
			timestamp: performance.now()
		});
	}

	/** Flush pending events into the main log. Called once per tick. */
	flush(): void {
		this.events.push(...this.pendingEvents);
		this.pendingEvents.length = 0;
	}

	/** Get all events of a specific type. */
	getByType(type: string): LoggedEvent[] {
		return this.events.filter((e) => e.type === type);
	}

	/** Get all events in a frame range. */
	getRange(startFrame: Frame, endFrame: Frame): LoggedEvent[] {
		return this.events.filter((e) => e.frame >= startFrame && e.frame <= endFrame);
	}

	/** Get the most recent N events. */
	getRecent(count: number): LoggedEvent[] {
		return this.events.slice(-count);
	}

	/** Export all events (for replay files or training data). */
	exportAll(): LoggedEvent[] {
		return [...this.events];
	}

	get size(): number {
		return this.events.length;
	}

	clear(): void {
		this.events.length = 0;
		this.pendingEvents.length = 0;
	}
}
