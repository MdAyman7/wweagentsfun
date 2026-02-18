import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, Frame } from '../../utils/types';

interface FinisherHitEvent {
	attacker: EntityId;
	defender: EntityId;
	finisherId: string;
	damage: number;
}

interface NearFallEvent {
	pinned: EntityId;
	count: number;
	tension: number;
}

interface ReversalEvent {
	reverser: EntityId;
	originalMove: string;
	reversalMove: string;
}

/**
 * Replay request queued by event listeners.
 */
interface ReplayRequest {
	triggerEvent: string;
	timestamp: number; // Wall-clock time of the event
}

/**
 * ReplayTriggerSystem
 *
 * Watches for highlight-worthy moments and triggers instant replays.
 * This models the TV production truck deciding "that was a big moment,
 * let's show it again."
 *
 * Replay-worthy moments:
 *   - Finisher landing
 *   - Near-fall kickout (count >= 2)
 *   - Dramatic reversal sequences
 *
 * The system maintains a cooldown between replays to avoid overwhelming
 * the viewer. In a real broadcast, you would not see more than one
 * replay per 30 seconds.
 *
 * When triggered, the system emits 'cinematic:replay_start' with a frame
 * range. The presentation layer captures frames in a ring buffer and
 * can play them back in slow motion.
 */
export class ReplayTriggerSystem extends System {
	readonly name = 'ReplayTriggerSystem';
	readonly phase: Phase = 'cinematic';
	readonly priority = 10;

	/** Minimum frames between replays. */
	private static readonly REPLAY_COOLDOWN_FRAMES = 300; // ~5 seconds at 60fps

	/** How many frames before the event to include in replay. */
	private static readonly REPLAY_LEAD_FRAMES = 90; // ~1.5 seconds

	/** How many frames after the event to include in replay. */
	private static readonly REPLAY_TRAIL_FRAMES = 30; // ~0.5 seconds

	private pendingReplays: ReplayRequest[] = [];
	private lastReplayFrame = -ReplayTriggerSystem.REPLAY_COOLDOWN_FRAMES;
	private currentFrame: Frame = 0;

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:finisher_hit', (_ev: FinisherHitEvent) => {
			this.pendingReplays.push({
				triggerEvent: 'finisher_hit',
				timestamp: this.currentFrame
			});
		});

		eventBus.on('match:nearfall', (ev: NearFallEvent) => {
			if (ev.count >= 2) {
				this.pendingReplays.push({
					triggerEvent: 'nearfall',
					timestamp: this.currentFrame
				});
			}
		});

		eventBus.on('combat:reversal', (_ev: ReversalEvent) => {
			this.pendingReplays.push({
				triggerEvent: 'reversal',
				timestamp: this.currentFrame
			});
		});
	}

	execute(world: World, _dt: number, eventBus: EventBus): void {
		this.currentFrame++;

		if (this.pendingReplays.length === 0) return;

		// Check cooldown
		if (this.currentFrame - this.lastReplayFrame < ReplayTriggerSystem.REPLAY_COOLDOWN_FRAMES) {
			this.pendingReplays.length = 0;
			return;
		}

		// Take the highest priority replay request
		// Priority: finisher > nearfall > reversal
		let bestReplay: ReplayRequest | null = null;
		for (const replay of this.pendingReplays) {
			if (!bestReplay) {
				bestReplay = replay;
				continue;
			}
			if (this.getReplayPriority(replay.triggerEvent) > this.getReplayPriority(bestReplay.triggerEvent)) {
				bestReplay = replay;
			}
		}

		if (bestReplay) {
			const startFrame = Math.max(0, bestReplay.timestamp - ReplayTriggerSystem.REPLAY_LEAD_FRAMES);
			const endFrame = bestReplay.timestamp + ReplayTriggerSystem.REPLAY_TRAIL_FRAMES;

			eventBus.emit('cinematic:replay_start', {
				startFrame,
				endFrame
			});

			this.lastReplayFrame = this.currentFrame;
		}

		this.pendingReplays.length = 0;
	}

	private getReplayPriority(triggerEvent: string): number {
		switch (triggerEvent) {
			case 'finisher_hit': return 3;
			case 'nearfall': return 2;
			case 'reversal': return 1;
			default: return 0;
		}
	}

	destroy(_world: World): void {
		this.pendingReplays.length = 0;
		this.lastReplayFrame = -ReplayTriggerSystem.REPLAY_COOLDOWN_FRAMES;
		this.currentFrame = 0;
	}
}
