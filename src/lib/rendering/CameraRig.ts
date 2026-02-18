import * as THREE from 'three';
import type { Vec3 } from '../utils/types';

/** Available camera angle presets for cinematography. */
export type CameraPreset =
	| 'wide'
	| 'closeup'
	| 'over_shoulder'
	| 'crowd'
	| 'top_down'
	| 'hard_cam'
	| 'entrance';

/** Defines offset from target and the look-at rule for a preset. */
interface PresetConfig {
	/** Camera position offset relative to the focal target. */
	offset: THREE.Vector3;
	/** If true, look-at tracks the target; otherwise uses a fixed point. */
	tracksTarget: boolean;
	/** Fixed look-at point (only used when tracksTarget is false). */
	fixedLookAt?: THREE.Vector3;
}

const PRESET_CONFIGS: Record<CameraPreset, PresetConfig> = {
	wide: {
		offset: new THREE.Vector3(12, 8, 12),
		tracksTarget: true
	},
	closeup: {
		offset: new THREE.Vector3(1.5, 0.4, 2),
		tracksTarget: true
	},
	over_shoulder: {
		offset: new THREE.Vector3(-1.2, 1.8, -1.5),
		tracksTarget: true
	},
	crowd: {
		offset: new THREE.Vector3(18, 5, 0),
		tracksTarget: true
	},
	top_down: {
		offset: new THREE.Vector3(0, 20, 0.01),
		tracksTarget: true
	},
	hard_cam: {
		offset: new THREE.Vector3(0, 6, 16),
		tracksTarget: false,
		fixedLookAt: new THREE.Vector3(0, 1.2, 0)
	},
	entrance: {
		offset: new THREE.Vector3(0, 3, -18),
		tracksTarget: false,
		fixedLookAt: new THREE.Vector3(0, 2, 0)
	}
};

/**
 * Camera system supporting multiple cinematic presets with smooth transitions.
 * Used by the cinematic system to cut between dramatic angles during the match.
 */
export class CameraRig {
	readonly camera: THREE.PerspectiveCamera;

	private currentPreset: CameraPreset = 'wide';
	private targetPosition: THREE.Vector3 = new THREE.Vector3();
	private targetLookAt: THREE.Vector3 = new THREE.Vector3();
	private focalTarget: THREE.Vector3 = new THREE.Vector3();
	private transitionSpeed: number = 4.0;

	private readonly _lerpPos = new THREE.Vector3();
	private readonly _lerpLookAt = new THREE.Vector3();
	private readonly _currentLookAt = new THREE.Vector3();

	/** Camera shake state */
	private _shakeIntensity = 0;
	private _shakeDecay = 8.0;
	private readonly _shakeOffset = new THREE.Vector3();
	/** Simple seeded-ish counter for deterministic shake noise */
	private _shakePhase = 0;

	constructor() {
		this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
		this.camera.position.copy(PRESET_CONFIGS.wide.offset);
		this.camera.lookAt(0, 1.2, 0);
		this._currentLookAt.set(0, 1.2, 0);
	}

	/**
	 * Switch to a camera preset. Optionally provide a world-space target the
	 * camera should focus on (e.g. a wrestler position).
	 */
	setPreset(preset: CameraPreset, targetPosition?: Vec3): void {
		this.currentPreset = preset;
		const config = PRESET_CONFIGS[preset];

		if (targetPosition) {
			this.focalTarget.set(targetPosition[0], targetPosition[1], targetPosition[2]);
		}

		// Compute desired camera world position
		this.targetPosition.copy(this.focalTarget).add(config.offset);

		// Compute desired look-at point
		if (config.tracksTarget) {
			this.targetLookAt.copy(this.focalTarget);
		} else {
			this.targetLookAt.copy(config.fixedLookAt ?? this.focalTarget);
		}
	}

	/**
	 * Trigger camera shake. Intensity stacks (max-wins) for overlapping hits.
	 * @param intensity Shake strength (0–1 range is typical; 0.04 = light, 0.08 = heavy).
	 */
	shake(intensity: number): void {
		this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
	}

	/**
	 * Smoothly interpolate the camera toward its target position and look-at
	 * every frame, then layer on shake displacement.
	 * @param dt Delta time in seconds.
	 */
	update(dt: number): void {
		const t = 1 - Math.exp(-this.transitionSpeed * dt);

		// Lerp position
		this._lerpPos.copy(this.camera.position).lerp(this.targetPosition, t);
		this.camera.position.copy(this._lerpPos);

		// Lerp look-at
		this._lerpLookAt.copy(this._currentLookAt).lerp(this.targetLookAt, t);
		this._currentLookAt.copy(this._lerpLookAt);

		// Apply camera shake offset
		if (this._shakeIntensity > 0.0001) {
			this._shakePhase += dt * 120; // fast oscillation
			const s = this._shakeIntensity;
			// Pseudo-random offset using sin/cos at different frequencies
			this._shakeOffset.set(
				Math.sin(this._shakePhase * 1.1) * s * 0.7 + Math.cos(this._shakePhase * 2.3) * s * 0.3,
				Math.cos(this._shakePhase * 1.7) * s * 0.5 + Math.sin(this._shakePhase * 3.1) * s * 0.2,
				Math.sin(this._shakePhase * 0.9) * s * 0.3
			);
			this.camera.position.add(this._shakeOffset);

			// Exponential decay
			this._shakeIntensity *= Math.exp(-this._shakeDecay * dt);
			if (this._shakeIntensity < 0.0001) {
				this._shakeIntensity = 0;
			}
		}

		this.camera.lookAt(this._currentLookAt);
	}

	/**
	 * Set the world-space focal point that presets orbit around.
	 * Does not change the preset but updates positions for presets that
	 * track the target.
	 */
	setTarget(position: Vec3): void {
		this.focalTarget.set(position[0], position[1], position[2]);

		const config = PRESET_CONFIGS[this.currentPreset];
		this.targetPosition.copy(this.focalTarget).add(config.offset);

		if (config.tracksTarget) {
			this.targetLookAt.copy(this.focalTarget);
		}
	}

	/** Get the current preset name. */
	getPreset(): CameraPreset {
		return this.currentPreset;
	}

	/** Adjust transition speed (higher = faster cuts). */
	setTransitionSpeed(speed: number): void {
		this.transitionSpeed = speed;
	}

	/** Update the camera aspect ratio (call on window resize). */
	setAspect(aspect: number): void {
		this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix();
	}
}
