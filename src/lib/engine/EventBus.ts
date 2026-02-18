import type { Frame } from '../utils/types';
import type { EventMap } from '../events';

type Handler<T> = (payload: T) => void;
type Unsubscribe = () => void;

interface QueuedEvent {
	type: string;
	payload: unknown;
	frame: Frame;
}

/**
 * Typed, queued, phase-flushed event bus.
 *
 * Events are never dispatched immediately. They queue up during system execution
 * and are flushed by the GameLoop between phases. This prevents cascading
 * side-effects and maintains deterministic ordering.
 */
export class EventBus {
	private handlers = new Map<string, Set<Handler<any>>>();
	private queue: QueuedEvent[] = [];
	private frame: Frame = 0;
	private eventLog: QueuedEvent[] = [];
	private logEnabled = false;

	/** Subscribe to an event type. Returns an unsubscribe function. */
	on<K extends keyof EventMap>(type: K, handler: Handler<EventMap[K]>): Unsubscribe {
		if (!this.handlers.has(type)) {
			this.handlers.set(type, new Set());
		}
		const set = this.handlers.get(type)!;
		set.add(handler);
		return () => set.delete(handler);
	}

	/** Queue an event for delivery on next flush. */
	emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
		const event: QueuedEvent = { type, payload, frame: this.frame };
		this.queue.push(event);
		if (this.logEnabled) {
			this.eventLog.push(event);
		}
	}

	/**
	 * Deliver all queued events to subscribers.
	 * Events emitted during handler execution are queued for the NEXT flush.
	 */
	flush(): void {
		const batch = this.queue.splice(0);
		for (const { type, payload } of batch) {
			const set = this.handlers.get(type);
			if (set) {
				for (const handler of set) {
					handler(payload);
				}
			}
		}
	}

	/** Drain all queued events without delivering them (for replay capture). */
	drain(): QueuedEvent[] {
		return this.queue.splice(0);
	}

	/** Get and clear the event log (for training data export). */
	drainLog(): QueuedEvent[] {
		return this.eventLog.splice(0);
	}

	setFrame(frame: Frame): void {
		this.frame = frame;
	}

	enableLogging(enabled: boolean): void {
		this.logEnabled = enabled;
	}

	reset(): void {
		this.queue.length = 0;
		this.handlers.clear();
		this.eventLog.length = 0;
		this.frame = 0;
	}
}
