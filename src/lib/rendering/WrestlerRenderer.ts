import * as THREE from 'three';
import type { EntityId, Vec3, Quat } from '../utils/types';
import { ProceduralAnimator, type AnimStateId, type ProceduralPose } from './ProceduralAnimator';

/** Build type determines mesh proportions. */
export type WrestlerBuild = 'light' | 'medium' | 'heavy';

export interface WrestlerMeshConfig {
	color: string;
	height: number;
	build: WrestlerBuild;
}

/** Scale factors per build type. */
const BUILD_SCALE: Record<WrestlerBuild, { bodyRadius: number; shoulderWidth: number; limbRadius: number }> = {
	light: { bodyRadius: 0.22, shoulderWidth: 0.35, limbRadius: 0.07 },
	medium: { bodyRadius: 0.28, shoulderWidth: 0.42, limbRadius: 0.09 },
	heavy: { bodyRadius: 0.36, shoulderWidth: 0.52, limbRadius: 0.11 }
};

/** Internal struct to hold per-wrestler rendering data. */
interface WrestlerData {
	group: THREE.Group;
	animator: ProceduralAnimator;
	defaultHeadY: number;
	bodyBaseY: number;
	/** Shoulder Y position (arm attachment point). */
	shoulderY: number;
}

/**
 * Creates and manages simple wrestler meshes (capsule body, sphere head,
 * cylinder limbs) in the THREE.js scene. Each wrestler is a Group
 * addressable by EntityId.
 *
 * Procedural animation is driven by ProceduralAnimator — supporting
 * breathing, walk cycles, punch extensions, knockback tilts, and more.
 */
export class WrestlerRenderer {
	private wrestlers: Map<EntityId, WrestlerData> = new Map();

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

		// Shift pivot to top of cylinder so rotation swings from shoulder
		armGeo.translate(0, -armLength * 0.5, 0);

		const shoulderY = bodyCenter + bodyHeight * 0.35;

		const leftArm = new THREE.Mesh(armGeo, skinMat);
		leftArm.name = 'leftArm';
		leftArm.position.set(-scale.shoulderWidth, shoulderY, 0);
		leftArm.rotation.z = Math.PI * 0.15;
		leftArm.castShadow = true;
		group.add(leftArm);

		const rightArm = new THREE.Mesh(armGeo.clone(), skinMat);
		rightArm.name = 'rightArm';
		rightArm.position.set(scale.shoulderWidth, shoulderY, 0);
		rightArm.rotation.z = -Math.PI * 0.15;
		rightArm.castShadow = true;
		group.add(rightArm);

		// --- Legs ---
		const legGeo = new THREE.CylinderGeometry(scale.limbRadius * 1.1, scale.limbRadius * 0.9, legHeight, 8);

		// Shift pivot to top of cylinder so rotation swings from hip
		legGeo.translate(0, -legHeight * 0.5, 0);

		const leftLeg = new THREE.Mesh(legGeo, mat);
		leftLeg.name = 'leftLeg';
		leftLeg.position.set(-scale.bodyRadius * 0.5, legHeight, 0);
		leftLeg.castShadow = true;
		group.add(leftLeg);

		const rightLeg = new THREE.Mesh(legGeo.clone(), mat);
		rightLeg.name = 'rightLeg';
		rightLeg.position.set(scale.bodyRadius * 0.5, legHeight, 0);
		rightLeg.castShadow = true;
		group.add(rightLeg);

		this.scene.add(group);

		const animator = new ProceduralAnimator();

		this.wrestlers.set(entityId, {
			group,
			animator,
			defaultHeadY: defaultHeadYPos,
			bodyBaseY: bodyCenter,
			shoulderY
		});

		return group;
	}

	/**
	 * Update world transform of a wrestler mesh from ECS transform data.
	 */
	updateTransform(entityId: EntityId, position: Vec3, rotation: Quat): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;

		data.group.position.set(position[0], position[1], position[2]);
		data.group.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
	}

	/**
	 * Set the animation state for a wrestler. Maps combat phases to
	 * ProceduralAnimator states. The actual body-part motion is computed
	 * procedurally in update().
	 */
	setAnimation(entityId: EntityId, clipId: string): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;

		// Map incoming clip IDs to animator states
		const stateMap: Record<string, AnimStateId> = {
			stance: 'stance',
			attacking: 'attacking',
			stunned: 'stunned',
			grounded: 'grounded',
			blocking: 'blocking',
			recovery: 'recovery',
			moving: 'moving',
			taunting: 'taunting',
			getting_up: 'getting_up'
		};

		const animState = stateMap[clipId] ?? 'stance';
		data.animator.setState(animState);
	}

	/**
	 * Set the movement velocity for walk cycle animation.
	 * @param entityId The wrestler entity.
	 * @param velocity Normalized velocity magnitude (0 = still, 1 = full speed).
	 */
	setVelocity(entityId: EntityId, velocity: number): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		data.animator.setVelocity(velocity);
	}

	/**
	 * Apply a visual knockback tilt on hit.
	 * @param entityId The wrestler entity.
	 * @param direction -1 = tilt left, +1 = tilt right.
	 * @param intensity 0–1 range.
	 */
	applyKnockback(entityId: EntityId, direction: number, intensity: number): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		data.animator.applyKnockback(direction, intensity);
	}

	/**
	 * Advance procedural animation for all wrestlers. Call once per render frame.
	 * @param dt Delta time in seconds (real wall-clock, NOT dilated).
	 */
	update(dt: number): void {
		for (const [, data] of this.wrestlers) {
			const pose = data.animator.update(dt);
			this.applyPoseToMesh(data, pose);
		}
	}

	/**
	 * Apply a ProceduralPose to the mesh hierarchy.
	 */
	private applyPoseToMesh(data: WrestlerData, pose: ProceduralPose): void {
		const { group, defaultHeadY, bodyBaseY } = data;

		const body = group.getObjectByName('body') as THREE.Mesh | undefined;
		const head = group.getObjectByName('head') as THREE.Mesh | undefined;
		const leftArm = group.getObjectByName('leftArm') as THREE.Mesh | undefined;
		const rightArm = group.getObjectByName('rightArm') as THREE.Mesh | undefined;
		const leftLeg = group.getObjectByName('leftLeg') as THREE.Mesh | undefined;
		const rightLeg = group.getObjectByName('rightLeg') as THREE.Mesh | undefined;

		// ── Body ──
		if (body) {
			body.rotation.x = pose.bodyX;
			body.rotation.z = pose.bodyZ;
			body.position.y = bodyBaseY + pose.bodyY;
		}

		// ── Head ──
		if (head) {
			const targetY = pose.headY >= 0 ? pose.headY : defaultHeadY;
			head.position.y = targetY + pose.bodyY; // head follows body bob
		}

		// ── Arms ──
		if (leftArm) {
			leftArm.rotation.z = pose.leftArmZ;
			leftArm.rotation.x = pose.leftArmX;
		}
		if (rightArm) {
			rightArm.rotation.z = pose.rightArmZ;
			rightArm.rotation.x = pose.rightArmX;
		}

		// ── Legs ──
		if (leftLeg) {
			leftLeg.rotation.x = pose.leftLegX;
		}
		if (rightLeg) {
			rightLeg.rotation.x = pose.rightLegX;
		}
	}

	/**
	 * Remove a single wrestler from the scene and free GPU resources.
	 */
	remove(entityId: EntityId): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;

		data.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => m.dispose());
				} else {
					child.material.dispose();
				}
			}
		});

		this.scene.remove(data.group);
		this.wrestlers.delete(entityId);
	}

	/**
	 * Remove all wrestlers and free all GPU resources.
	 */
	dispose(): void {
		for (const entityId of this.wrestlers.keys()) {
			this.remove(entityId);
		}
	}

	/** Check whether a mesh exists for the given entity. */
	has(entityId: EntityId): boolean {
		return this.wrestlers.has(entityId);
	}

	/** Get the THREE.Group for an entity (or undefined). */
	getGroup(entityId: EntityId): THREE.Group | undefined {
		return this.wrestlers.get(entityId)?.group;
	}
}
