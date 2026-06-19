import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../utils/types';

/** Available camera angle presets for cinematography. */
export type CameraPreset =
	| 'wide'
	| 'closeup'
	| 'over_shoulder'
	| 'crowd'
	| 'top_down'
	| 'hard_cam'
	| 'entrance'
	| 'drone';

export type CameraMode = 'auto' | 'free';

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
		offset: new THREE.Vector3(5, 4, 5),
		tracksTarget: true
	},
	closeup: {
		offset: new THREE.Vector3(0.9, 0.4, 1.2),
		tracksTarget: true
	},
	over_shoulder: {
		offset: new THREE.Vector3(-0.7, 0.9, -0.9),
		tracksTarget: true
	},
	crowd: {
		offset: new THREE.Vector3(7, 2.5, 0),
		tracksTarget: true
	},
	top_down: {
		offset: new THREE.Vector3(0, 7, 0.01),
		tracksTarget: true
	},
	hard_cam: {
		offset: new THREE.Vector3(0, 2.5, 6),
		tracksTarget: false,
		fixedLookAt: new THREE.Vector3(0, 0.5, 0)
	},
	entrance: {
		offset: new THREE.Vector3(0, 1.5, -7),
		tracksTarget: false,
		fixedLookAt: new THREE.Vector3(0, 0.5, 0)
	},
	// High three-quarter overhead "ref-drone" shot that follows the action.
	drone: {
		offset: new THREE.Vector3(0.4, 4.6, 3.2),
		tracksTarget: true
	}
};

/**
 * Camera system supporting multiple cinematic presets with smooth transitions.
 * Used by the cinematic system to cut between dramatic angles during the match.
 * Supports a free-camera mode via OrbitControls for user-controlled viewing.
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

	/** Free-camera mode state */
	private _mode: CameraMode = 'auto';
	private _controls: OrbitControls | null = null;
	private _transitioningToAuto = false;
	private _transitionAlpha = 0;

	constructor() {
		this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 80);
		this.camera.position.copy(PRESET_CONFIGS.wide.offset);
		this.camera.lookAt(0, 0.5, 0);
		this._currentLookAt.set(0, 0.5, 0);
	}

	/**
	 * Create OrbitControls for free-camera mode. Must be called after
	 * construction with the canvas element used for rendering.
	 */
	initControls(domElement: HTMLCanvasElement): void {
		this._controls = new OrbitControls(this.camera, domElement);
		this._controls.enableDamping = true;
		this._controls.dampingFactor = 0.08;
		this._controls.minDistance = 1.5;
		this._controls.maxDistance = 18;
		this._controls.maxPolarAngle = Math.PI / 2 - 0.05; // prevent going underground
		this._controls.minPolarAngle = 0.1;
		this._controls.target.set(0, 0.3, 0); // ring center
		this._controls.enabled = false; // start in auto mode
	}

	/** Switch between auto (director-driven) and free (user-controlled) camera. */
	setMode(mode: CameraMode): void {
		if (mode === this._mode) return;
		this._mode = mode;

		if (mode === 'free') {
			if (this._controls) {
				// Sync OrbitControls target to current look-at so the transition is seamless
				this._controls.target.copy(this._currentLookAt);
				this._controls.enabled = true;
			}
			this._transitioningToAuto = false;
		} else {
			if (this._controls) {
				this._controls.enabled = false;
			}
			// Smooth blend back to director-driven position
			this._transitioningToAuto = true;
			this._transitionAlpha = 0;
		}
	}

	getMode(): CameraMode {
		return this._mode;
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
		if (this._mode === 'free' && !this._transitioningToAuto) {
			// Free mode: OrbitControls drives position/orientation
			if (this._controls) {
				this._controls.update();
			}
			this._applyShake(dt);
			return;
		}

		if (this._transitioningToAuto) {
			// Smooth blend from current free-cam position back to auto target
			this._transitionAlpha += dt * 2.0; // ~0.5 second blend
			if (this._transitionAlpha >= 1.0) {
				this._transitionAlpha = 1.0;
				this._transitioningToAuto = false;
			}
			const t = 1 - Math.exp(-this.transitionSpeed * dt) * (1 - this._transitionAlpha);
			this.camera.position.lerp(this.targetPosition, t);
			this._currentLookAt.lerp(this.targetLookAt, t);
		} else {
			// Normal auto-mode lerp
			const t = 1 - Math.exp(-this.transitionSpeed * dt);
			this._lerpPos.copy(this.camera.position).lerp(this.targetPosition, t);
			this.camera.position.copy(this._lerpPos);
			this._lerpLookAt.copy(this._currentLookAt).lerp(this.targetLookAt, t);
			this._currentLookAt.copy(this._lerpLookAt);
		}

		this._applyShake(dt);
		this.camera.lookAt(this._currentLookAt);
	}

	/** Apply camera shake offset (works in both auto and free modes). */
	private _applyShake(dt: number): void {
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

	/** Dispose OrbitControls and release event listeners. */
	dispose(): void {
		this._controls?.dispose();
		this._controls = null;
	}
}
