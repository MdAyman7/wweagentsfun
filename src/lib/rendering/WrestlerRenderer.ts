import * as THREE from 'three';
import type { EntityId, Vec3, Quat } from '../utils/types';
import { lerp } from '../utils/math';

/** Build type determines mesh proportions. */
export type WrestlerBuild = 'light' | 'medium' | 'heavy';

export interface WrestlerMeshConfig {
	color: string;
	height: number;
	build: WrestlerBuild;
}

/** Pose-based body adjustments with smooth interpolation. */
type PoseId = 'stance' | 'attacking' | 'stunned' | 'grounded' | 'blocking' | 'recovery';

/** Scale factors per build type. */
const BUILD_SCALE: Record<WrestlerBuild, { bodyRadius: number; shoulderWidth: number; limbRadius: number }> = {
	light: { bodyRadius: 0.22, shoulderWidth: 0.35, limbRadius: 0.07 },
	medium: { bodyRadius: 0.28, shoulderWidth: 0.42, limbRadius: 0.09 },
	heavy: { bodyRadius: 0.36, shoulderWidth: 0.52, limbRadius: 0.11 }
};

// ─── Pose Interpolation ─────────────────────────────────────────────

/** Snapshot of target body-part rotations/positions for a pose. */
interface PoseSnapshot {
	leftArmZ: number;
	rightArmZ: number;
	bodyX: number;
	/** Head Y position override. -1 = use default (don't override). */
	headY: number;
}

/**
 * Static lookup table for pose targets.
 * headY = -1 means "use the default head position" (computed at creation time).
 */
const POSE_TARGETS: Record<PoseId, PoseSnapshot> = {
	stance:    { leftArmZ: Math.PI * 0.15,  rightArmZ: -Math.PI * 0.15,  bodyX: 0,                headY: -1 },
	attacking: { leftArmZ: Math.PI * 0.45,  rightArmZ: -Math.PI * 0.45,  bodyX: -0.1,             headY: -1 },
	stunned:   { leftArmZ: Math.PI * 0.05,  rightArmZ: -Math.PI * 0.05,  bodyX: 0.15,             headY: -1 },
	grounded:  { leftArmZ: Math.PI * 0.15,  rightArmZ: -Math.PI * 0.15,  bodyX: Math.PI * 0.5,    headY: 0.15 },
	blocking:  { leftArmZ: Math.PI * 0.6,   rightArmZ: -Math.PI * 0.6,   bodyX: -0.05,            headY: -1 },
	recovery:  { leftArmZ: Math.PI * 0.08,  rightArmZ: -Math.PI * 0.08,  bodyX: 0.2,              headY: -1 }
};

/** Interpolation speed. Higher = faster transitions (~10 frames at 60fps to reach target). */
const LERP_SPEED = 12;

/**
 * Creates and manages simple wrestler meshes (capsule body, sphere head,
 * cylinder limbs) in the THREE.js scene. Each wrestler is a Group
 * addressable by EntityId.
 *
 * Poses interpolate smoothly via update(dt) — no more instant snapping.
 */
export class WrestlerRenderer {
	private meshes: Map<EntityId, THREE.Group> = new Map();
	private poses: Map<EntityId, PoseId> = new Map();
	private targetPoses: Map<EntityId, PoseSnapshot> = new Map();
	private currentPoses: Map<EntityId, PoseSnapshot> = new Map();
	/** Default head Y per entity (captured at creation time for pose resets). */
	private defaultHeadY: Map<EntityId, number> = new Map();

	constructor(private scene: THREE.Scene) {}

	/**
	 * Build a wrestler mesh hierarchy and add it to the scene.
	 * Returns the created Group so callers can further customise it.
	 */
	createWrestler(entityId: EntityId, config: WrestlerMeshConfig): THREE.Group {
		const group = new THREE.Group();
		group.name = `wrestler_${entityId}`;

		const scale = BUILD_SCALE[config.build];
		const color = new THREE.Color(config.color);
		const mat = new THREE.MeshStandardMaterial({
			color,
			roughness: 0.6,
			metalness: 0.1
		});
		const skinMat = new THREE.MeshStandardMaterial({
			color: 0xdeb887,
			roughness: 0.7,
			metalness: 0.0
		});

		const totalHeight = config.height;
		const headRadius = totalHeight * 0.1;
		const bodyHeight = totalHeight * 0.35;
		const legHeight = totalHeight * 0.35;
		const bodyCenter = legHeight + bodyHeight * 0.5;

		// --- Body (capsule = cylinder + two hemispheres) ---
		const bodyGeo = new THREE.CapsuleGeometry(scale.bodyRadius, bodyHeight - scale.bodyRadius * 2, 8, 16);
		const body = new THREE.Mesh(bodyGeo, mat);
		body.name = 'body';
		body.position.y = bodyCenter;
		body.castShadow = true;
		group.add(body);

		// --- Head ---
		const headGeo = new THREE.SphereGeometry(headRadius, 16, 12);
		const head = new THREE.Mesh(headGeo, skinMat);
		head.name = 'head';
		const defaultHeadYPos = bodyCenter + bodyHeight * 0.5 + headRadius * 0.8;
		head.position.y = defaultHeadYPos;
		head.castShadow = true;
		group.add(head);

		// --- Arms ---
		const armLength = totalHeight * 0.28;
		const armGeo = new THREE.CylinderGeometry(scale.limbRadius, scale.limbRadius * 0.85, armLength, 8);

		const leftArm = new THREE.Mesh(armGeo, skinMat);
		leftArm.name = 'leftArm';
		leftArm.position.set(-scale.shoulderWidth, bodyCenter + bodyHeight * 0.35, 0);
		leftArm.rotation.z = Math.PI * 0.15;
		leftArm.castShadow = true;
		group.add(leftArm);

		const rightArm = new THREE.Mesh(armGeo, skinMat);
		rightArm.name = 'rightArm';
		rightArm.position.set(scale.shoulderWidth, bodyCenter + bodyHeight * 0.35, 0);
		rightArm.rotation.z = -Math.PI * 0.15;
		rightArm.castShadow = true;
		group.add(rightArm);

		// --- Legs ---
		const legGeo = new THREE.CylinderGeometry(scale.limbRadius * 1.1, scale.limbRadius * 0.9, legHeight, 8);

		const leftLeg = new THREE.Mesh(legGeo, mat);
		leftLeg.name = 'leftLeg';
		leftLeg.position.set(-scale.bodyRadius * 0.5, legHeight * 0.5, 0);
		leftLeg.castShadow = true;
		group.add(leftLeg);

		const rightLeg = new THREE.Mesh(legGeo, mat);
		rightLeg.name = 'rightLeg';
		rightLeg.position.set(scale.bodyRadius * 0.5, legHeight * 0.5, 0);
		rightLeg.castShadow = true;
		group.add(rightLeg);

		this.scene.add(group);
		this.meshes.set(entityId, group);
		this.poses.set(entityId, 'stance');
		this.defaultHeadY.set(entityId, defaultHeadYPos);

		// Initialise pose interpolation state at stance
		const stancePose = { ...POSE_TARGETS.stance };
		this.targetPoses.set(entityId, stancePose);
		this.currentPoses.set(entityId, { ...stancePose });

		return group;
	}

	/**
	 * Update world transform of a wrestler mesh from ECS transform data.
	 */
	updateTransform(entityId: EntityId, position: Vec3, rotation: Quat): void {
		const group = this.meshes.get(entityId);
		if (!group) return;

		group.position.set(position[0], position[1], position[2]);
		group.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
	}

	/**
	 * Set the target pose for a wrestler. The actual body-part rotations
	 * are interpolated smoothly toward the target in update().
	 */
	setAnimation(entityId: EntityId, clipId: string): void {
		const group = this.meshes.get(entityId);
		if (!group) return;

		const pose = clipId as PoseId;
		const current = this.poses.get(entityId);
		if (current === pose) return;
		this.poses.set(entityId, pose);

		// Set interpolation target — actual motion happens in update()
		const target = POSE_TARGETS[pose] ?? POSE_TARGETS.stance;
		this.targetPoses.set(entityId, { ...target });
	}

	/**
	 * Advance pose interpolation for all wrestlers. Call once per render frame.
	 * @param dt Delta time in seconds (real wall-clock, NOT dilated).
	 */
	update(dt: number): void {
		const t = 1 - Math.exp(-LERP_SPEED * dt);

		for (const [entityId, target] of this.targetPoses) {
			const group = this.meshes.get(entityId);
			if (!group) continue;

			let current = this.currentPoses.get(entityId);
			if (!current) {
				current = { ...target };
				this.currentPoses.set(entityId, current);
			}

			// Lerp each property toward target
			current.leftArmZ = lerp(current.leftArmZ, target.leftArmZ, t);
			current.rightArmZ = lerp(current.rightArmZ, target.rightArmZ, t);
			current.bodyX = lerp(current.bodyX, target.bodyX, t);

			// Head Y: -1 means "use default position"
			const defHeadY = this.defaultHeadY.get(entityId) ?? 1.0;
			const targetHeadY = target.headY >= 0 ? target.headY : defHeadY;
			const currentHeadY = current.headY >= 0 ? current.headY : defHeadY;
			current.headY = target.headY >= 0
				? lerp(currentHeadY, targetHeadY, t)
				: -1; // stay at default

			// Apply to mesh parts
			const body = group.getObjectByName('body') as THREE.Mesh | undefined;
			const leftArm = group.getObjectByName('leftArm') as THREE.Mesh | undefined;
			const rightArm = group.getObjectByName('rightArm') as THREE.Mesh | undefined;
			const head = group.getObjectByName('head') as THREE.Mesh | undefined;

			if (body) body.rotation.x = current.bodyX;
			if (leftArm) leftArm.rotation.z = current.leftArmZ;
			if (rightArm) rightArm.rotation.z = current.rightArmZ;
			if (head) {
				head.position.y = current.headY >= 0 ? current.headY : defHeadY;
			}
		}
	}

	/**
	 * Remove a single wrestler from the scene and free GPU resources.
	 */
	remove(entityId: EntityId): void {
		const group = this.meshes.get(entityId);
		if (!group) return;

		group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => m.dispose());
				} else {
					child.material.dispose();
				}
			}
		});

		this.scene.remove(group);
		this.meshes.delete(entityId);
		this.poses.delete(entityId);
		this.targetPoses.delete(entityId);
		this.currentPoses.delete(entityId);
		this.defaultHeadY.delete(entityId);
	}

	/**
	 * Remove all wrestlers and free all GPU resources.
	 */
	dispose(): void {
		for (const entityId of this.meshes.keys()) {
			this.remove(entityId);
		}
	}

	/** Check whether a mesh exists for the given entity. */
	has(entityId: EntityId): boolean {
		return this.meshes.has(entityId);
	}

	/** Get the THREE.Group for an entity (or undefined). */
	getGroup(entityId: EntityId): THREE.Group | undefined {
		return this.meshes.get(entityId);
	}
}
