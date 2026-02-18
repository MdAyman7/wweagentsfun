import * as THREE from 'three';
import type { Vec3 } from '../utils/types';
import { lerp } from '../utils/math';

/**
 * Referee poses driven by match state.
 *
 *   standing  — Default during live action (hands on hips)
 *   counting  — During knockdowns (bent forward, arm down)
 *   signaling — Match end (arms raised in X formation)
 */
export type RefereePose = 'standing' | 'counting' | 'signaling';

// ─── Pose Interpolation ─────────────────────────────────────────────

interface PoseSnapshot {
	leftArmZ: number;
	rightArmZ: number;
	leftArmX: number;
	rightArmX: number;
	bodyX: number;
}

const POSE_TARGETS: Record<RefereePose, PoseSnapshot> = {
	standing: {
		leftArmZ: Math.PI * 0.25,
		rightArmZ: -Math.PI * 0.25,
		leftArmX: 0,
		rightArmX: 0,
		bodyX: 0
	},
	counting: {
		leftArmZ: Math.PI * 0.15,
		rightArmZ: -Math.PI * 0.05,
		leftArmX: 0,
		rightArmX: -Math.PI * 0.6, // right arm extends down
		bodyX: -0.2 // bent forward
	},
	signaling: {
		leftArmZ: Math.PI * 0.8,
		rightArmZ: -Math.PI * 0.8,
		leftArmX: -Math.PI * 0.15,
		rightArmX: -Math.PI * 0.15,
		bodyX: 0
	}
};

const LERP_SPEED = 10;

/** Referee dimensions. */
const REF_HEIGHT = 1.55;
const HEAD_RADIUS = REF_HEIGHT * 0.09;
const BODY_HEIGHT = REF_HEIGHT * 0.35;
const BODY_RADIUS = 0.18;
const LEG_HEIGHT = REF_HEIGHT * 0.35;
const ARM_LENGTH = REF_HEIGHT * 0.26;
const LIMB_RADIUS = 0.05;
const SHOULDER_WIDTH = 0.28;

/**
 * RefereeRenderer — a rendering-only referee that follows match action.
 *
 * The referee:
 *   - Is a smaller mesh than wrestlers with black-and-white striped body
 *   - Follows the midpoint of the two wrestlers (offset to the side)
 *   - Changes pose based on match state (standing/counting/signaling)
 *   - Uses smooth interpolation for pose transitions
 *
 * The referee has ZERO influence on match logic. It is purely cosmetic.
 */
export class RefereeRenderer {
	private group: THREE.Group;
	private currentPose: RefereePose = 'standing';
	private poseTarget: PoseSnapshot;
	private poseCurrent: PoseSnapshot;

	constructor(private scene: THREE.Scene) {
		this.group = new THREE.Group();
		this.group.name = 'referee';

		this.poseTarget = { ...POSE_TARGETS.standing };
		this.poseCurrent = { ...POSE_TARGETS.standing };

		this.buildMesh();
		scene.add(this.group);
	}

	// ─── Mesh Construction ──────────────────────────────────────────

	private buildMesh(): void {
		const stripeMat = new THREE.MeshStandardMaterial({
			map: this.createStripeTexture(),
			roughness: 0.7,
			metalness: 0.0
		});
		const skinMat = new THREE.MeshStandardMaterial({
			color: 0xdeb887,
			roughness: 0.7,
			metalness: 0.0
		});
		const pantsMat = new THREE.MeshStandardMaterial({
			color: 0x111111,
			roughness: 0.8,
			metalness: 0.0
		});

		const bodyCenter = LEG_HEIGHT + BODY_HEIGHT * 0.5;

		// Body (striped shirt)
		const bodyGeo = new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT - BODY_RADIUS * 2, 8, 16);
		const body = new THREE.Mesh(bodyGeo, stripeMat);
		body.name = 'body';
		body.position.y = bodyCenter;
		body.castShadow = true;
		this.group.add(body);

		// Head
		const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 16, 12);
		const head = new THREE.Mesh(headGeo, skinMat);
		head.name = 'head';
		head.position.y = bodyCenter + BODY_HEIGHT * 0.5 + HEAD_RADIUS * 0.8;
		head.castShadow = true;
		this.group.add(head);

		// Arms
		const armGeo = new THREE.CylinderGeometry(LIMB_RADIUS, LIMB_RADIUS * 0.85, ARM_LENGTH, 8);

		const leftArm = new THREE.Mesh(armGeo, skinMat);
		leftArm.name = 'leftArm';
		leftArm.position.set(-SHOULDER_WIDTH, bodyCenter + BODY_HEIGHT * 0.3, 0);
		leftArm.rotation.z = POSE_TARGETS.standing.leftArmZ;
		leftArm.castShadow = true;
		this.group.add(leftArm);

		const rightArm = new THREE.Mesh(armGeo, skinMat);
		rightArm.name = 'rightArm';
		rightArm.position.set(SHOULDER_WIDTH, bodyCenter + BODY_HEIGHT * 0.3, 0);
		rightArm.rotation.z = POSE_TARGETS.standing.rightArmZ;
		rightArm.castShadow = true;
		this.group.add(rightArm);

		// Legs (black pants)
		const legGeo = new THREE.CylinderGeometry(LIMB_RADIUS * 1.1, LIMB_RADIUS * 0.9, LEG_HEIGHT, 8);

		const leftLeg = new THREE.Mesh(legGeo, pantsMat);
		leftLeg.name = 'leftLeg';
		leftLeg.position.set(-BODY_RADIUS * 0.5, LEG_HEIGHT * 0.5, 0);
		leftLeg.castShadow = true;
		this.group.add(leftLeg);

		const rightLeg = new THREE.Mesh(legGeo, pantsMat);
		rightLeg.name = 'rightLeg';
		rightLeg.position.set(BODY_RADIUS * 0.5, LEG_HEIGHT * 0.5, 0);
		rightLeg.castShadow = true;
		this.group.add(rightLeg);
	}

	/**
	 * Create a canvas texture with alternating black/white horizontal stripes
	 * for the referee's shirt.
	 */
	private createStripeTexture(): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 128;
		const ctx = canvas.getContext('2d')!;
		const stripeHeight = 16;
		for (let i = 0; i < 8; i++) {
			ctx.fillStyle = i % 2 === 0 ? '#111111' : '#eeeeee';
			ctx.fillRect(0, i * stripeHeight, 64, stripeHeight);
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		return tex;
	}

	// ─── Positioning ────────────────────────────────────────────────

	/**
	 * Update the referee's position to follow the action.
	 * The referee stays near the midpoint of the two wrestlers,
	 * offset to the side so it doesn't block the camera.
	 *
	 * @param wrestlerPositions - [wrestler1Pos, wrestler2Pos] in world-space
	 */
	updatePosition(wrestlerPositions: Vec3[]): void {
		if (wrestlerPositions.length < 2) return;

		const [a, b] = wrestlerPositions;
		const midX = (a[0] + b[0]) / 2;
		const midZ = (a[2] + b[2]) / 2;
		const ringHeight = a[1]; // wrestlers already at ring height

		// Offset referee to Z+2 (to the side, not between wrestlers and camera)
		this.group.position.set(midX, ringHeight, midZ + 2.0);

		// Face the action centre
		this.group.lookAt(midX, ringHeight + 0.8, midZ);
	}

	// ─── Pose System ────────────────────────────────────────────────

	/**
	 * Set the referee pose. The transition is interpolated smoothly
	 * in update().
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

		this.poseCurrent.leftArmZ = lerp(this.poseCurrent.leftArmZ, this.poseTarget.leftArmZ, t);
		this.poseCurrent.rightArmZ = lerp(this.poseCurrent.rightArmZ, this.poseTarget.rightArmZ, t);
		this.poseCurrent.leftArmX = lerp(this.poseCurrent.leftArmX, this.poseTarget.leftArmX, t);
		this.poseCurrent.rightArmX = lerp(this.poseCurrent.rightArmX, this.poseTarget.rightArmX, t);
		this.poseCurrent.bodyX = lerp(this.poseCurrent.bodyX, this.poseTarget.bodyX, t);

		// Apply to mesh parts
		const body = this.group.getObjectByName('body') as THREE.Mesh | undefined;
		const leftArm = this.group.getObjectByName('leftArm') as THREE.Mesh | undefined;
		const rightArm = this.group.getObjectByName('rightArm') as THREE.Mesh | undefined;

		if (body) body.rotation.x = this.poseCurrent.bodyX;
		if (leftArm) {
			leftArm.rotation.z = this.poseCurrent.leftArmZ;
			leftArm.rotation.x = this.poseCurrent.leftArmX;
		}
		if (rightArm) {
			rightArm.rotation.z = this.poseCurrent.rightArmZ;
			rightArm.rotation.x = this.poseCurrent.rightArmX;
		}
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
					if (m.map) m.map.dispose();
					m.dispose();
				}
			}
		});
		this.group.parent?.remove(this.group);
	}
}
