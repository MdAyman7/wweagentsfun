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

		// 3. Camera direction
		const cameraCue = this.camera.update(drama, state);
		if (cameraCue) cues.push(cameraCue);

		// 4. Atmosphere + VFX
		const { atmosphere, vfx } = this.atmosphere.update(drama, state);
		if (atmosphere) cues.push(atmosphere);
		for (const v of vfx) cues.push(v);

		// 5. Slow motion for high-drama events
		this.checkSlowMotion(drama, cues);

		// 6. Replay triggers
		if (this.config.replaysEnabled && !this.replay.isReplaying) {
			const replayCue = this.replay.checkTrigger(drama);
			if (replayCue) cues.push(replayCue);
		}

		// 7. Advance internal clocks
		this.slowMotion.tick();
		this.prevState = state;

		return cues;
	}

	/**
	 * Check if any drama events should trigger slow motion.
	 */
	private checkSlowMotion(drama: DramaSnapshot, cues: CinematicCue[]): void {
		if (this.slowMotion.isActive) return;

		for (const event of drama.events) {
			let sloCue: SlowMotionCue | null = null;

			switch (event.type) {
				case 'knockdown':
					sloCue = {
						type: 'slow_motion',
						factor: 0.25,
						durationTicks: 60,
						rampInPct: 0.1,
						rampOutPct: 0.2
					};
					break;

				case 'comeback_start':
					sloCue = {
						type: 'slow_motion',
						factor: 0.3,
						durationTicks: 45,
						rampInPct: 0.1,
						rampOutPct: 0.25
					};
					break;

				case 'big_hit':
					if (event.damage >= 18) {
						sloCue = {
							type: 'slow_motion',
							factor: 0.4,
							durationTicks: 30,
							rampInPct: 0.15,
							rampOutPct: 0.25
						};
					}
					break;

				case 'match_end':
					sloCue = {
						type: 'slow_motion',
						factor: 0.2,
						durationTicks: 90,
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
