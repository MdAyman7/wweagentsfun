import * as THREE from 'three';
import type { Vec3 } from '../utils/types';
import { lerp } from '../utils/math';

/**
 * Referee poses driven by match state.
 *
 *   standing  — Default during live action (gentle hover bob + slow rotor spin)
 *   counting  — During knockdowns (rapid bob + fast rotors + red beacon)
 *   signaling — Match end (spotlight flash + slow victory spin)
 */
export type RefereePose = 'standing' | 'counting' | 'signaling';

// ─── Pose Interpolation ─────────────────────────────────────────────

interface PoseSnapshot {
	bobAmplitude: number;  // Y oscillation amplitude
	bobSpeed: number;      // Y oscillation speed
	rotorSpeed: number;    // rotor spin speed (rad/sec)
	beaconFlash: boolean;  // whether beacon light blinks
	tiltX: number;         // body tilt forward/back
}

const POSE_TARGETS: Record<RefereePose, PoseSnapshot> = {
	standing: {
		bobAmplitude: 0.03,
		bobSpeed: 2.5,
		rotorSpeed: 12.0,
		beaconFlash: false,
		tiltX: 0
	},
	counting: {
		bobAmplitude: 0.08,
		bobSpeed: 6.0,
		rotorSpeed: 25.0,
		beaconFlash: true,
		tiltX: -0.15
	},
	signaling: {
		bobAmplitude: 0.02,
		bobSpeed: 1.5,
		rotorSpeed: 8.0,
		beaconFlash: true,
		tiltX: 0
	}
};

const LERP_SPEED = 10;

/** Drone body dimensions. */
const BODY_WIDTH = 0.14;
const BODY_HEIGHT = 0.04;
const ARM_LENGTH = 0.12;
const ARM_THICKNESS = 0.012;
const ROTOR_RADIUS = 0.06;
const HOVER_HEIGHT = 1.5; // flies well above the stickman fighters

/**
 * RefereeRenderer — a small referee drone that hovers above the action.
 *
 * The drone:
 *   - Has a flat disc body with 4 rotor arms in an X-pattern
 *   - Each arm tip has a spinning rotor disc
 *   - Has a camera lens underneath (looking down at action)
 *   - Striped black/white body for referee look
 *   - Red beacon light on top that flashes during counting/signaling
 *   - Follows the midpoint of the two bots (offset above)
 *
 * The referee has ZERO influence on match logic. It is purely cosmetic.
 */
export class RefereeRenderer {
	private group: THREE.Group;
	private currentPose: RefereePose = 'standing';
	private poseTarget: PoseSnapshot;
	private poseCurrent: PoseSnapshot;
	private phaseAccum: number = 0;
	private rotorMeshes: THREE.Mesh[] = [];
	private beaconMat: THREE.MeshStandardMaterial;
	private beaconLight: THREE.PointLight;
	private cameraLensMat: THREE.MeshStandardMaterial;
	private winnerSprite: THREE.Sprite | null = null;
	private winnerSpriteTarget: THREE.Vector3 | null = null;

	constructor(private scene: THREE.Scene) {
		this.group = new THREE.Group();
		this.group.name = 'referee';

		this.poseTarget = { ...POSE_TARGETS.standing };
		this.poseCurrent = { ...POSE_TARGETS.standing };

		this.beaconMat = new THREE.MeshStandardMaterial({
			color: 0xff2222,
			emissive: new THREE.Color(0xff0000),
			emissiveIntensity: 0.4,
			roughness: 0.2,
			metalness: 0.3
		});

		this.beaconLight = new THREE.PointLight(0xff4444, 0, 2.0);

		this.cameraLensMat = new THREE.MeshStandardMaterial({
			color: 0x111122,
			emissive: new THREE.Color(0x44aaff),
			emissiveIntensity: 0.4,
			roughness: 0.05,
			metalness: 0.95
		});

		this.buildMesh();
		scene.add(this.group);
	}

	// ─── Mesh Construction ──────────────────────────────────────────

	private buildMesh(): void {
		const bodyMat = new THREE.MeshStandardMaterial({
			map: this.createStripeTexture(),
			roughness: 0.35,
			metalness: 0.5
		});

		const frameMat = new THREE.MeshStandardMaterial({
			color: 0xddddee,
			roughness: 0.3,
			metalness: 0.7
		});

		const rotorMat = new THREE.MeshStandardMaterial({
			color: 0x888899,
			roughness: 0.3,
			metalness: 0.6,
			transparent: true,
			opacity: 0.7
		});

		// ── Flat disc body ──
		const bodyGeo = new THREE.CylinderGeometry(BODY_WIDTH, BODY_WIDTH * 0.9, BODY_HEIGHT, 12);
		const body = new THREE.Mesh(bodyGeo, bodyMat);
		body.name = 'body';
		body.castShadow = true;
		this.group.add(body);

		// ── Top dome (small rounded cap) ──
		const domeGeo = new THREE.SphereGeometry(BODY_WIDTH * 0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
		const dome = new THREE.Mesh(domeGeo, frameMat);
		dome.name = 'dome';
		dome.position.y = BODY_HEIGHT / 2;
		this.group.add(dome);

		// ── Beacon light on top ──
		const beaconGeo = new THREE.SphereGeometry(0.02, 8, 6);
		const beacon = new THREE.Mesh(beaconGeo, this.beaconMat);
		beacon.name = 'beacon';
		beacon.position.y = BODY_HEIGHT / 2 + BODY_WIDTH * 0.45;
		this.group.add(beacon);

		this.beaconLight.position.copy(beacon.position);
		this.group.add(this.beaconLight);

		// ── Camera lens underneath ──
		const lensGeo = new THREE.CylinderGeometry(BODY_WIDTH * 0.2, BODY_WIDTH * 0.15, 0.025, 8);
		const lens = new THREE.Mesh(lensGeo, this.cameraLensMat);
		lens.name = 'lens';
		lens.position.y = -(BODY_HEIGHT / 2) - 0.012;
		this.group.add(lens);

		// Camera lens glow ring
		const lensRingGeo = new THREE.TorusGeometry(BODY_WIDTH * 0.18, 0.005, 6, 12);
		const lensRingMat = new THREE.MeshBasicMaterial({
			color: 0x44ccff,
			transparent: true,
			opacity: 0.4,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		});
		const lensRing = new THREE.Mesh(lensRingGeo, lensRingMat);
		lensRing.position.y = -(BODY_HEIGHT / 2) - 0.025;
		lensRing.rotation.x = Math.PI / 2;
		this.group.add(lensRing);

		// ── 4 Rotor Arms in X pattern ──
		const armAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

		for (let i = 0; i < 4; i++) {
			const angle = armAngles[i] + Math.PI / 4; // 45° offset for X pattern

			// Arm strut
			const armGeo = new THREE.BoxGeometry(ARM_LENGTH, ARM_THICKNESS, ARM_THICKNESS);
			armGeo.translate(ARM_LENGTH / 2, 0, 0);
			const arm = new THREE.Mesh(armGeo, frameMat);
			arm.rotation.y = -angle;
			arm.position.y = BODY_HEIGHT * 0.1;
			arm.name = `arm_${i}`;
			this.group.add(arm);

			// Motor housing at tip
			const motorGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.02, 8);
			const motor = new THREE.Mesh(motorGeo, frameMat);
			motor.position.set(
				Math.cos(angle) * (ARM_LENGTH + BODY_WIDTH * 0.4),
				BODY_HEIGHT * 0.2,
				Math.sin(angle) * (ARM_LENGTH + BODY_WIDTH * 0.4)
			);
			motor.name = `motor_${i}`;
			this.group.add(motor);

			// Rotor disc (flat spinning disc)
			const rotorGeo = new THREE.CircleGeometry(ROTOR_RADIUS, 12);
			const rotor = new THREE.Mesh(rotorGeo, rotorMat.clone());
			rotor.rotation.x = -Math.PI / 2;
			rotor.position.set(
				Math.cos(angle) * (ARM_LENGTH + BODY_WIDTH * 0.4),
				BODY_HEIGHT * 0.3,
				Math.sin(angle) * (ARM_LENGTH + BODY_WIDTH * 0.4)
			);
			rotor.name = `rotor_${i}`;
			this.group.add(rotor);
			this.rotorMeshes.push(rotor);
		}

		// ── Subtle downwash glow ──
		const downwashGlow = new THREE.PointLight(0x88bbdd, 0.2, 1.5);
		downwashGlow.position.set(0, -0.1, 0);
		downwashGlow.name = 'downwash_glow';
		this.group.add(downwashGlow);

		// ── REFEREE label sprite ──
		const labelCanvas = document.createElement('canvas');
		labelCanvas.width = 128;
		labelCanvas.height = 32;
		const labelCtx = labelCanvas.getContext('2d')!;
		labelCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		labelCtx.fillRect(0, 0, 128, 32);
		labelCtx.fillStyle = '#ffffff';
		labelCtx.font = 'bold 16px sans-serif';
		labelCtx.textAlign = 'center';
		labelCtx.textBaseline = 'middle';
		labelCtx.fillText('REFEREE', 64, 16);
		const labelTexture = new THREE.CanvasTexture(labelCanvas);
		labelTexture.colorSpace = THREE.SRGBColorSpace;
		const labelMat = new THREE.SpriteMaterial({
			map: labelTexture,
			transparent: true,
			depthTest: false,
			sizeAttenuation: true
		});
		const labelSprite = new THREE.Sprite(labelMat);
		labelSprite.scale.set(0.3, 0.075, 1);
		labelSprite.position.y = BODY_HEIGHT / 2 + BODY_WIDTH * 0.5 + 0.06;
		labelSprite.name = 'referee_label';
		this.group.add(labelSprite);
	}

	/**
	 * Create a canvas texture with alternating black/white stripes.
	 */
	private createStripeTexture(): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d')!;
		const stripeH = 8;
		for (let i = 0; i < 8; i++) {
			ctx.fillStyle = i % 2 === 0 ? '#222222' : '#eeeeee';
			ctx.fillRect(0, i * stripeH, 64, stripeH);
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		return tex;
	}

	// ─── Positioning ────────────────────────────────────────────────

	/**
	 * Update the drone's position to follow the action.
	 * The drone hovers above the midpoint of the two bots.
	 */
	updatePosition(wrestlerPositions: Vec3[]): void {
		if (wrestlerPositions.length < 2) return;

		const [a, b] = wrestlerPositions;
		const midX = (a[0] + b[0]) / 2;
		const midZ = (a[2] + b[2]) / 2;
		const ringHeight = a[1];

		// Hover above and behind the action — far enough not to interfere with fighters
		this.group.position.set(midX + 1.2, ringHeight + HOVER_HEIGHT, midZ + 1.8);
	}

	// ─── Pose System ────────────────────────────────────────────────

	/**
	 * Set the referee pose. The transition is interpolated smoothly.
	 */
	setPose(pose: RefereePose): void {
		if (this.currentPose === pose) return;
		this.currentPose = pose;
		this.poseTarget = { ...POSE_TARGETS[pose] };
	}

	/**
	 * Advance pose interpolation. Call once per render frame.
	 * @param dt Delta time in seconds.
	 */
	update(dt: number): void {
		const t = 1 - Math.exp(-LERP_SPEED * dt);
		this.phaseAccum += dt;

		this.poseCurrent.bobAmplitude = lerp(this.poseCurrent.bobAmplitude, this.poseTarget.bobAmplitude, t);
		this.poseCurrent.bobSpeed = lerp(this.poseCurrent.bobSpeed, this.poseTarget.bobSpeed, t);
		this.poseCurrent.rotorSpeed = lerp(this.poseCurrent.rotorSpeed, this.poseTarget.rotorSpeed, t);
		this.poseCurrent.tiltX = lerp(this.poseCurrent.tiltX, this.poseTarget.tiltX, t);
		this.poseCurrent.beaconFlash = this.poseTarget.beaconFlash;

		// If winner display is active, fly drone toward winner
		if (this.winnerSpriteTarget) {
			const flySpeed = 1 - Math.exp(-3.0 * dt);
			this.group.position.x = lerp(this.group.position.x, this.winnerSpriteTarget.x, flySpeed);
			this.group.position.y = lerp(this.group.position.y, this.winnerSpriteTarget.y, flySpeed);
			this.group.position.z = lerp(this.group.position.z, this.winnerSpriteTarget.z, flySpeed);
		}

		// Y bob (whole drone)
		const yBob = Math.sin(this.phaseAccum * this.poseCurrent.bobSpeed) * this.poseCurrent.bobAmplitude;
		this.group.position.y += yBob * dt * 10; // soft bob via delta

		// Body tilt
		this.group.rotation.x = this.poseCurrent.tiltX;

		// Slight continuous yaw rotation (drone slowly turns to survey)
		this.group.rotation.y += dt * 0.3;

		// Spin rotors
		for (let i = 0; i < this.rotorMeshes.length; i++) {
			// Alternate direction for visual variety
			const dir = i % 2 === 0 ? 1 : -1;
			this.rotorMeshes[i].rotation.z += dir * this.poseCurrent.rotorSpeed * dt;
		}

		// Beacon flash
		if (this.poseCurrent.beaconFlash) {
			const flashOn = Math.sin(this.phaseAccum * 10) > 0;
			this.beaconMat.emissiveIntensity = flashOn ? 1.5 : 0.1;
			this.beaconLight.intensity = flashOn ? 0.5 : 0;
		} else {
			this.beaconMat.emissiveIntensity = 0.4;
			this.beaconLight.intensity = 0;
		}

		// Camera lens pulses gently
		this.cameraLensMat.emissiveIntensity = 0.3 + Math.sin(this.phaseAccum * 3) * 0.15;

		// Pulse winner display scale for emphasis
		if (this.winnerSprite) {
			const pulse = 1.0 + Math.sin(this.phaseAccum * 3) * 0.05;
			this.winnerSprite.scale.set(1.2 * pulse, 0.45 * pulse, 1);
		}
	}

	// ─── Winner Announcement ────────────────────────────────────────

	/**
	 * Show a large "WINNER" display on the drone.
	 * The drone flies to center stage above the winner and displays the name.
	 */
	showWinner(winnerName: string, winnerPosition: Vec3): void {
		// Create large winner display sprite
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 192;
		const ctx = canvas.getContext('2d')!;

		// Dark background with glow border
		ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
		ctx.fillRect(0, 0, 512, 192);

		// Gold border
		ctx.shadowColor = '#ffaa00';
		ctx.shadowBlur = 12;
		ctx.strokeStyle = '#ffcc00';
		ctx.lineWidth = 4;
		ctx.strokeRect(4, 4, 504, 184);
		ctx.shadowBlur = 0;

		// "WINNER" text
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.shadowColor = '#ffaa00';
		ctx.shadowBlur = 16;
		ctx.fillStyle = '#ffcc00';
		ctx.font = 'bold 40px "Impact", "Arial Black", sans-serif';
		ctx.fillText('WINNER', 256, 60);
		ctx.shadowBlur = 0;

		// Divider
		const divGrad = ctx.createLinearGradient(80, 0, 432, 0);
		divGrad.addColorStop(0, 'rgba(255, 200, 0, 0)');
		divGrad.addColorStop(0.3, 'rgba(255, 200, 0, 0.6)');
		divGrad.addColorStop(0.5, 'rgba(255, 220, 50, 0.9)');
		divGrad.addColorStop(0.7, 'rgba(255, 200, 0, 0.6)');
		divGrad.addColorStop(1, 'rgba(255, 200, 0, 0)');
		ctx.strokeStyle = divGrad;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(80, 90);
		ctx.lineTo(432, 90);
		ctx.stroke();

		// Winner name
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 36px "Impact", "Arial Black", sans-serif';
		ctx.fillText(winnerName.toUpperCase(), 256, 140);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;

		const spriteMat = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			depthTest: false,
			sizeAttenuation: true
		});

		this.winnerSprite = new THREE.Sprite(spriteMat);
		this.winnerSprite.scale.set(1.2, 0.45, 1);
		this.winnerSprite.position.set(0, BODY_HEIGHT + 0.3, 0);
		this.winnerSprite.name = 'winner_display';
		this.group.add(this.winnerSprite);

		// Set target position — center above the winner
		this.winnerSpriteTarget = new THREE.Vector3(
			winnerPosition[0],
			winnerPosition[1] + HOVER_HEIGHT + 0.3,
			winnerPosition[2]
		);
	}

	/**
	 * Whether the winner display is currently showing.
	 */
	get hasWinnerDisplay(): boolean {
		return this.winnerSprite !== null;
	}

	// ─── Cleanup ────────────────────────────────────────────────────

	dispose(): void {
		this.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => {
						if (m.map) m.map.dispose();
						m.dispose();
					});
				} else {
					const m = child.material as THREE.MeshStandardMaterial;
					if ('map' in m && m.map) m.map.dispose();
					m.dispose();
				}
			}
		});
		this.rotorMeshes.length = 0;
		this.group.parent?.remove(this.group);
	}
}
