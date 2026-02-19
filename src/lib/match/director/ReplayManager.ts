import type { MatchState } from '../engine/MatchState';
import type { DramaSnapshot, DramaEvent, ReplayCue, MatchSnapshot, DirectorCameraPreset } from './types';
import { RingBuffer } from '../../utils/ringbuffer';

/** Number of lead frames to capture before the event (1.5s at 60fps). */
const REPLAY_LEAD_FRAMES = 90;

/** Number of trail frames after the event (0.5s at 60fps). */
const REPLAY_TRAIL_FRAMES = 30;

/** Default playback speed for replays (30% = slow-motion). */
const DEFAULT_REPLAY_SPEED = 0.3;

/** Extended lead frames for finisher replays (2.5s at 60fps to capture setup). */
const FINISHER_REPLAY_LEAD_FRAMES = 150;

/** Priority lookup for replay-worthy events. Higher = more replay-worthy. */
const REPLAY_PRIORITIES: Partial<Record<DramaEvent['type'], number>> = {
	finisher_impact: 6,
	match_end: 5,
	counter_finisher: 5,
	knockdown: 4,
	comeback_start: 3,
	big_hit: 2,
	reversal: 1
};

/**
 * ReplayManager — captures state snapshots and triggers instant replays.
 *
 * Records lightweight MatchSnapshots into a RingBuffer every tick.
 * When a drama event is replay-worthy, it extracts a window of snapshots
 * (1.5s lead + 0.5s trail) and emits a replay_start cue.
 *
 * During replay:
 *   - Simulation pauses (page stops calling step())
 *   - Renderer reads snapshots from advanceReplay() at slow speed
 *   - A cinematic camera angle is used (different from live)
 *   - When complete, replay_end cue is emitted
 *   - Renderer returns to live camera
 */
export class ReplayManager {
	private readonly buffer: RingBuffer<MatchSnapshot>;
	private readonly cooldownTicks: number;
	private cooldownRemaining = 0;
	private _inReplay = false;

	// Replay playback state
	private replaySnapshots: MatchSnapshot[] = [];
	private replayIndex = 0;
	private replayAccumulator = 0;
	private replaySpeed = DEFAULT_REPLAY_SPEED;
	private replayPreset: DirectorCameraPreset = 'closeup';

	constructor(
		bufferSize = 600,
		cooldownTicks = 300
	) {
		this.buffer = new RingBuffer<MatchSnapshot>(bufferSize);
		this.cooldownTicks = cooldownTicks;
	}

	/**
	 * Record current state as a lightweight snapshot. Called every tick.
	 */
	record(state: MatchState): void {
		if (this._inReplay) return; // don't record during replay

		// Decrement cooldown
		if (this.cooldownRemaining > 0) this.cooldownRemaining--;

		const snapshot: MatchSnapshot = {
			tick: state.tick,
			agents: state.agents.map((a) => ({
				id: a.id,
				name: a.name,
				positionX: a.positionX,
				phase: a.phase,
				health: a.health,
				maxHealth: a.maxHealth,
				stamina: a.stamina,
				maxStamina: a.maxStamina,
				momentum: a.momentum,
				activeMove: a.activeMove,
				comebackActive: a.comebackActive,
				knockdowns: a.knockdowns
			}))
		};

		this.buffer.push(snapshot);
	}

	/**
	 * Check drama events for replay-worthy moments.
	 * Returns a ReplayCue if a replay should start, null otherwise.
	 */
	checkTrigger(drama: DramaSnapshot): ReplayCue | null {
		if (this._inReplay) return null;
		if (this.cooldownRemaining > 0) return null;

		// Find the highest-priority replay-worthy event
		let bestEvent: DramaEvent | null = null;
		let bestPriority = 0;

		for (const event of drama.events) {
			const priority = REPLAY_PRIORITIES[event.type] ?? 0;
			if (priority > bestPriority) {
				bestPriority = priority;
				bestEvent = event;
			}
		}

		if (!bestEvent || bestPriority === 0) return null;

		// Compute replay window (extended for finisher replays to capture setup)
		const currentTick = drama.tick;
		const isFinisher = bestEvent.type === 'finisher_impact' || bestEvent.type === 'counter_finisher';
		const leadFrames = isFinisher ? FINISHER_REPLAY_LEAD_FRAMES : REPLAY_LEAD_FRAMES;
		const startTick = Math.max(0, currentTick - leadFrames);
		const endTick = currentTick + REPLAY_TRAIL_FRAMES;

		// Select camera preset for the replay (different from what was live)
		const preset = this.selectReplayPreset(bestEvent);

		return {
			type: 'replay_start',
			startTick,
			endTick,
			replayPreset: preset,
			playbackSpeed: DEFAULT_REPLAY_SPEED
		};
	}

	/**
	 * Start replay from captured snapshots.
	 */
	startReplay(startTick: number, endTick: number, preset?: DirectorCameraPreset, speed?: number): void {
		// Extract snapshots in the tick range
		const allSnapshots = this.buffer.toArray();
		this.replaySnapshots = allSnapshots.filter(
			(s) => s.tick >= startTick && s.tick <= endTick
		);

		if (this.replaySnapshots.length === 0) return;

		this._inReplay = true;
		this.replayIndex = 0;
		this.replayAccumulator = 0;
		this.replaySpeed = speed ?? DEFAULT_REPLAY_SPEED;
		this.replayPreset = preset ?? 'closeup';
	}

	/**
	 * Advance replay playback. Returns the snapshot to render,
	 * or null if replay is complete.
	 *
	 * @param dt Wall-clock delta in ms
	 */
	advanceReplay(dt: number): MatchSnapshot | null {
		if (!this._inReplay || this.replaySnapshots.length === 0) return null;

		// Advance accumulator (60fps nominal, slowed by replaySpeed)
		const tickMs = (1000 / 60) / this.replaySpeed;
		this.replayAccumulator += dt;

		while (this.replayAccumulator >= tickMs && this.replayIndex < this.replaySnapshots.length - 1) {
			this.replayIndex++;
			this.replayAccumulator -= tickMs;
		}

		// Check if replay is complete
		if (this.replayIndex >= this.replaySnapshots.length - 1) {
			return null; // signal completion
		}

		return this.replaySnapshots[this.replayIndex];
	}

	/**
	 * End replay and return to live camera. Returns a replay_end cue.
	 */
	endReplay(): ReplayCue {
		this._inReplay = false;
		this.replaySnapshots = [];
		this.replayIndex = 0;
		this.replayAccumulator = 0;
		this.cooldownRemaining = this.cooldownTicks;

		return { type: 'replay_end' };
	}

	get isReplaying(): boolean {
		return this._inReplay;
	}

	get currentReplayPreset(): DirectorCameraPreset {
		return this.replayPreset;
	}

	get replayProgress(): number {
		if (this.replaySnapshots.length === 0) return 0;
		return this.replayIndex / (this.replaySnapshots.length - 1);
	}

	// ─── Internal ────────────────────────────────────────────────────

	private selectReplayPreset(event: DramaEvent): DirectorCameraPreset {
		switch (event.type) {
			case 'finisher_impact': return 'closeup';
			case 'counter_finisher': return 'over_shoulder';
			case 'match_end': return 'wide';
			case 'knockdown': return 'top_down';
			case 'comeback_start': return 'crowd';
			case 'big_hit': return 'closeup';
			case 'reversal': return 'over_shoulder';
			default: return 'closeup';
		}
	}
}
