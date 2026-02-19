import type { MatchState } from '../engine/MatchState';
import type {
	CinematicCue,
	DirectorConfig,
	DramaSnapshot,
	SlowMotionCue
} from './types';
import { DEFAULT_DIRECTOR_CONFIG } from './types';
import { scoreDrama } from './DramaScorer';
import { CameraDirector } from './CameraDirector';
import { ReplayManager } from './ReplayManager';
import { AtmosphereController } from './AtmosphereController';
import { SlowMotionController } from './SlowMotionController';
import { FinisherSequencer } from './FinisherSequencer';
import { SeededRandom } from '../../utils/random';

/**
 * MatchDirector — the cinematic brain.
 *
 * Sits between MatchLoop.step() and the render call in the match page.
 * Observes MatchState, computes drama, emits cinematic cues.
 *
 * The director NEVER modifies MatchState. It is a read-only observer.
 *
 * Usage in +page.svelte:
 *
 *   const director = new MatchDirector({ seed });
 *
 *   function frame(timestamp) {
 *     // Step simulation
 *     matchLoop.step();
 *
 *     // Direct cinematics
 *     const cues = director.update(matchLoop.state);
 *     applyCues(cues);
 *
 *     // Render with time dilation
 *     accumulator += rawDelta * director.timeDilation;
 *     sceneManager.render(cameraRig.camera);
 *   }
 */
export class MatchDirector {
	private prevState: MatchState | null = null;
	private readonly camera: CameraDirector;
	private readonly replay: ReplayManager;
	private readonly atmosphere: AtmosphereController;
	private readonly slowMotion: SlowMotionController;
	private readonly finisher: FinisherSequencer;
	private readonly config: DirectorConfig;

	/** Most recent drama snapshot (exposed for debug overlay). */
	lastDrama: DramaSnapshot | null = null;

	constructor(config: Partial<DirectorConfig> = {}) {
		this.config = { ...DEFAULT_DIRECTOR_CONFIG, ...config };
		const rng = new SeededRandom(this.config.seed);
		this.camera = new CameraDirector(rng, this.config.minCutInterval);
		this.replay = new ReplayManager(
			this.config.replayBufferSize,
			this.config.replayCooldownTicks
		);
		this.atmosphere = new AtmosphereController();
		this.slowMotion = new SlowMotionController();
		this.finisher = new FinisherSequencer();
	}

	/**
	 * Called once per simulation tick. Reads MatchState, returns cues.
	 * MUST NOT mutate the state parameter.
	 */
	update(state: MatchState): CinematicCue[] {
		const cues: CinematicCue[] = [];

		// 1. Record for replay
		this.replay.record(state);

		// 2. Score drama
		const drama = scoreDrama(state, this.prevState);
		this.lastDrama = drama;

		// 3. Finisher sequencer (takes over camera/atmosphere when active)
		const finisherCues = this.finisher.update(drama, state);
		for (const fc of finisherCues) cues.push(fc);

		// 4. Camera direction (suppressed during finisher sequence)
		if (!this.finisher.isActive) {
			const cameraCue = this.camera.update(drama, state);
			if (cameraCue) cues.push(cameraCue);
		}

		// 5. Atmosphere + VFX (suppressed during finisher — sequencer handles it)
		if (!this.finisher.isActive) {
			const { atmosphere, vfx } = this.atmosphere.update(drama, state);
			if (atmosphere) cues.push(atmosphere);
			for (const v of vfx) cues.push(v);
		}

		// 6. Slow motion for high-drama events (suppressed during finisher)
		if (!this.finisher.isActive) {
			this.checkSlowMotion(drama, cues);
		}

		// 7. Replay triggers
		if (this.config.replaysEnabled && !this.replay.isReplaying) {
			const replayCue = this.replay.checkTrigger(drama);
			if (replayCue) cues.push(replayCue);
		}

		// 8. Advance internal clocks
		this.slowMotion.tick();
		this.prevState = state;

		return cues;
	}

	/**
	 * Check if any drama events should trigger slow motion.
	 * More generous triggers for cinematic, dramatic matches.
	 */
	private checkSlowMotion(drama: DramaSnapshot, cues: CinematicCue[]): void {
		if (this.slowMotion.isActive) return;

		for (const event of drama.events) {
			let sloCue: SlowMotionCue | null = null;

			switch (event.type) {
				case 'knockdown':
					// Deep slow-mo on knockdown — dramatic fall
					sloCue = {
						type: 'slow_motion',
						factor: 0.15,
						durationTicks: 90,
						rampInPct: 0.08,
						rampOutPct: 0.25
					};
					break;

				case 'comeback_start':
					sloCue = {
						type: 'slow_motion',
						factor: 0.25,
						durationTicks: 60,
						rampInPct: 0.1,
						rampOutPct: 0.25
					};
					break;

				case 'big_hit':
					// Lower threshold — more hits get slow-mo treatment
					if (event.damage >= 10) {
						const factor = event.damage >= 16 ? 0.2 : 0.35;
						const duration = event.damage >= 16 ? 60 : 40;
						sloCue = {
							type: 'slow_motion',
							factor,
							durationTicks: duration,
							rampInPct: 0.1,
							rampOutPct: 0.2
						};
					}
					break;

				case 'reversal':
					// Slow-mo on reversals — dramatic counter
					sloCue = {
						type: 'slow_motion',
						factor: 0.3,
						durationTicks: 45,
						rampInPct: 0.1,
						rampOutPct: 0.2
					};
					break;

				case 'near_finish':
					// Near-death moments get slow-mo
					sloCue = {
						type: 'slow_motion',
						factor: 0.2,
						durationTicks: 50,
						rampInPct: 0.08,
						rampOutPct: 0.25
					};
					break;

				case 'match_end':
					sloCue = {
						type: 'slow_motion',
						factor: 0.12,
						durationTicks: 120,
						rampInPct: 0.05,
						rampOutPct: 0.3
					};
					break;
			}

			if (sloCue) {
				this.slowMotion.activate(
					sloCue.factor,
					sloCue.durationTicks,
					sloCue.rampInPct,
					sloCue.rampOutPct
				);
				cues.push(sloCue);
				return; // only one slow-motion per tick
			}
		}
	}

	/** Get the current time dilation factor for the render loop. */
	get timeDilation(): number {
		return this.slowMotion.factor;
	}

	/** Get the replay manager for the page to drive replay playback. */
	get replayManager(): ReplayManager {
		return this.replay;
	}

	/** Whether the director is currently in replay mode. */
	get isReplaying(): boolean {
		return this.replay.isReplaying;
	}

	dispose(): void {
		this.prevState = null;
		this.lastDrama = null;
	}
}

// ─── Re-exports ──────────────────────────────────────────────────────

export { scoreDrama } from './DramaScorer';
export { CameraDirector } from './CameraDirector';
export { ReplayManager } from './ReplayManager';
export { AtmosphereController } from './AtmosphereController';
export { SlowMotionController } from './SlowMotionController';
export { FinisherSequencer } from './FinisherSequencer';
export type {
	CinematicCue,
	CameraCue,
	SlowMotionCue,
	ReplayCue,
	AtmosphereCue,
	VFXCue,
	DramaSnapshot,
	DramaEvent,
	DramaFactors,
	DirectorConfig,
	DirectorCameraPreset,
	DirectorEffectType,
	MatchSnapshot
} from './types';
