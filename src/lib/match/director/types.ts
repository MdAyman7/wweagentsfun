/**
 * Cinematic Match Director — Type Definitions
 *
 * The director observes match state (read-only) and emits typed
 * CinematicCue objects. The match page applies cues to THREE.js
 * objects. This keeps the director rendering-agnostic.
 */

// ─── Director Configuration ─────────────────────────────────────────

export interface DirectorConfig {
	/** SeededRandom seed for deterministic camera choices */
	seed: number;
	/** Whether replays are enabled */
	replaysEnabled: boolean;
	/** Max MatchState snapshots to keep in ring buffer */
	replayBufferSize: number;
	/** Minimum ticks between camera cuts */
	minCutInterval: number;
	/** Minimum ticks between replays */
	replayCooldownTicks: number;
}

export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
	seed: 12345,
	replaysEnabled: true,
	replayBufferSize: 600,
	minCutInterval: 20,
	replayCooldownTicks: 300
};

// ─── Camera Presets (mirror of CameraRig union, no imports) ─────────

/** Camera preset identifiers. Must match CameraRig's CameraPreset type. */
export type DirectorCameraPreset =
	| 'wide'
	| 'closeup'
	| 'over_shoulder'
	| 'crowd'
	| 'top_down'
	| 'hard_cam'
	| 'entrance';

/** VFX effect types. Must match EffectsRenderer's EffectType. */
export type DirectorEffectType = 'impact' | 'sweat' | 'dust' | 'flash' | 'sparks';

// ─── Drama Scoring ──────────────────────────────────────────────────

/** A snapshot of dramatic tension at a given tick. */
export interface DramaSnapshot {
	tick: number;
	/** Overall drama score (0.0 – 1.0) */
	tension: number;
	/** Contributing factor scores for debugging/tuning */
	factors: DramaFactors;
	/** Tagged dramatic events detected this tick */
	events: DramaEvent[];
}

export interface DramaFactors {
	/** 0-1: closeness of health percentages (closer = more dramatic) */
	healthDifferential: number;
	/** 0-1: recent momentum change magnitude */
	momentumSwing: number;
	/** 0-1: hit/taken streak significance */
	streakIntensity: number;
	/** 0-1: emotional state transition score */
	emotionalVolatility: number;
	/** 0-1: active comeback detection */
	comebackIntensity: number;
	/** 0-1: time pressure (late match = higher) */
	lateMatchUrgency: number;
}

export type DramaEvent =
	| { type: 'big_hit'; agentId: string; damage: number; moveId: string }
	| { type: 'reversal'; agentId: string; moveId: string }
	| { type: 'knockdown'; agentId: string; knockdownCount: number }
	| { type: 'comeback_start'; agentId: string }
	| { type: 'comeback_end'; agentId: string }
	| { type: 'emotion_shift'; agentId: string; from: string; to: string }
	| { type: 'near_finish'; agentId: string; healthPct: number }
	| { type: 'momentum_peak'; agentId: string; momentum: number }
	| { type: 'mistake'; agentId: string }
	| { type: 'match_end'; winnerId: string; method: string }
	| { type: 'finisher_trigger'; attackerId: string; defenderId: string; moveId: string; moveName: string }
	| { type: 'finisher_impact'; attackerId: string; damage: number; knockdownForced: boolean }
	| { type: 'counter_finisher'; defenderId: string; attackerId: string };

// ─── Cinematic Cues ─────────────────────────────────────────────────

/** Union of all cinematic cues the director can emit. */
export type CinematicCue =
	| CameraCue
	| SlowMotionCue
	| ReplayCue
	| AtmosphereCue
	| VFXCue;

export interface CameraCue {
	type: 'camera';
	preset: DirectorCameraPreset;
	/** World-space focal point [x, y, z] */
	target: [number, number, number];
	/** CameraRig transition speed (2=slow, 10=snap) */
	transitionSpeed: number;
	/** Minimum frames to hold this angle before allowing another cut */
	hold: number;
}

export interface SlowMotionCue {
	type: 'slow_motion';
	/** Time dilation factor (0.25 = quarter speed) */
	factor: number;
	/** Duration in simulation ticks */
	durationTicks: number;
	/** Fraction of duration for ramp-in (0.0 – 0.3) */
	rampInPct: number;
	/** Fraction of duration for ramp-out (0.0 – 0.3) */
	rampOutPct: number;
}

export interface ReplayCue {
	type: 'replay_start' | 'replay_end';
	/** For replay_start: first tick to replay */
	startTick?: number;
	/** For replay_start: last tick to replay */
	endTick?: number;
	/** Camera preset during replay (different from live) */
	replayPreset?: DirectorCameraPreset;
	/** Playback speed (e.g. 0.3 = 30% speed) */
	playbackSpeed?: number;
}

export interface AtmosphereCue {
	type: 'atmosphere';
	/** Tone mapping exposure (normal ≈ 1.2, bright ≈ 2.0, flash ≈ 3.0) */
	exposure?: number;
	/** Arena spotlight intensity multiplier */
	spotlightIntensity?: number;
	/** Titantron emissive intensity */
	titantronIntensity?: number;
	/** Exponential fog density */
	fogDensity?: number;
	/** Duration in ticks to lerp to these values */
	transitionTicks: number;
}

export interface VFXCue {
	type: 'vfx';
	/** Effect type to spawn */
	effect: DirectorEffectType;
	/** World-space position [x, y, z] */
	position: [number, number, number];
	/** Intensity multiplier */
	intensity: number;
}

// ─── Replay Snapshot ────────────────────────────────────────────────

/** Lightweight match state snapshot for replay rendering. */
export interface MatchSnapshot {
	tick: number;
	agents: ReadonlyArray<{
		id: string;
		name: string;
		positionX: number;
		phase: string;
		health: number;
		maxHealth: number;
		stamina: number;
		maxStamina: number;
		momentum: number;
		activeMove: string | null;
		comebackActive: boolean;
		knockdowns: number;
	}>;
}
