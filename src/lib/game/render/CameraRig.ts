import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CamView = 'auto' | 'hard' | 'drone' | 'free';

/** Camera rig — follows the action with switchable broadcast angles + shake. */
export class CameraRig {
	readonly camera: THREE.PerspectiveCamera;
	private view: CamView = 'auto';
	private controls: OrbitControls | null = null;

	private pos = new THREE.Vector3(0, 3, 8);
	private look = new THREE.Vector3(0, 1, 0);
	private curLook = new THREE.Vector3(0, 1, 0);
	private shakeAmt = 0;
	private t = 0;

	constructor() {
		this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 120);
		this.camera.position.copy(this.pos);
	}

	initControls(canvas: HTMLCanvasElement): void {
		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.minDistance = 3;
		this.controls.maxDistance = 20;
		this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
		this.controls.target.set(0, 1, 0);
		this.controls.enabled = false;
	}

	setView(v: CamView): void {
		this.view = v;
		if (this.controls) this.controls.enabled = v === 'free';
	}
	getView(): CamView { return this.view; }

	shake(a: number): void { this.shakeAmt = Math.max(this.shakeAmt, a); }
	setAspect(a: number): void { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

	/** focus = midpoint of the action; spread = distance between fighters. */
	update(dt: number, focus: THREE.Vector3, spread: number, intensity: number): void {
		this.t += dt;
		if (this.view === 'free' && this.controls) {
			this.controls.update();
			this.applyShake();
			return;
		}

		if (this.view === 'hard') {
			this.pos.set(0, 2.6, 8.5);
			this.look.set(focus.x * 0.4, 1.1, focus.z * 0.3);
		} else if (this.view === 'drone') {
			this.pos.set(focus.x, 7.5, focus.z + 3.6);
			this.look.set(focus.x, 0.6, focus.z);
		} else {
			// auto — a broadcast three-quarter that tightens on big moments and
			// follows the action anywhere in the ring (corners, rope runs).
			const dist = 5.5 + spread * 0.6 - intensity * 1.2;
			const orbit = Math.sin(this.t * 0.15) * 0.25;
			this.pos.set(
				focus.x * 0.6 + Math.sin(orbit) * dist,
				2.4 - intensity * 0.3,
				focus.z * 0.5 + Math.cos(orbit) * dist + 2.5
			);
			this.look.set(focus.x * 0.7, 1.0, focus.z * 0.7);
		}

		const k = 1 - Math.exp(-6 * dt);
		this.camera.position.lerp(this.pos, k);
		this.curLook.lerp(this.look, k);
		this.camera.lookAt(this.curLook);
		this.applyShake(dt);
	}

	private applyShake(dt = 0.016): void {
		if (this.shakeAmt < 0.001) return;
		const s = this.shakeAmt;
		this.camera.position.x += Math.sin(this.t * 90) * s * 0.6;
		this.camera.position.y += Math.cos(this.t * 80) * s * 0.5;
		this.shakeAmt *= Math.exp(-9 * dt);
	}

	dispose(): void { this.controls?.dispose(); }
}
