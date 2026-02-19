import * as THREE from 'three';
import type { EntityId, Vec3, Quat } from '../utils/types';
import { ProceduralAnimator, type AnimStateId, type ProceduralPose } from './ProceduralAnimator';
import type { AnimationCommand } from './AnimationCommand';
import { GrappleIKController } from './GrappleIKController';

/** Build type determines stickman proportions. */
export type WrestlerBuild = 'light' | 'medium' | 'heavy';

export interface WrestlerMeshConfig {
	color: string;
	secondaryColor?: string;
	height: number;
	build: WrestlerBuild;
	name?: string;
}

/** Stickman build dimensions. */
interface StickBuildConfig {
	headRadius: number;
	torsoLength: number;
	torsoThickness: number;
	upperArmLength: number;
	forearmLength: number;
	limbThickness: number;
	upperLegLength: number;
	lowerLegLength: number;
	shoulderWidth: number;
	hipWidth: number;
	jointRadius: number;
	handRadius: number;
	footLength: number;
}

const STICK_BUILDS: Record<WrestlerBuild, StickBuildConfig> = {
	light: {
		headRadius: 0.09,
		torsoLength: 0.28,
		torsoThickness: 0.025,
		upperArmLength: 0.16,
		forearmLength: 0.14,
		limbThickness: 0.018,
		upperLegLength: 0.18,
		lowerLegLength: 0.16,
		shoulderWidth: 0.16,
		hipWidth: 0.08,
		jointRadius: 0.022,
		handRadius: 0.028,
		footLength: 0.06,
	},
	medium: {
		headRadius: 0.10,
		torsoLength: 0.32,
		torsoThickness: 0.030,
		upperArmLength: 0.18,
		forearmLength: 0.16,
		limbThickness: 0.022,
		upperLegLength: 0.20,
		lowerLegLength: 0.18,
		shoulderWidth: 0.18,
		hipWidth: 0.09,
		jointRadius: 0.026,
		handRadius: 0.032,
		footLength: 0.07,
	},
	heavy: {
		headRadius: 0.12,
		torsoLength: 0.36,
		torsoThickness: 0.035,
		upperArmLength: 0.20,
		forearmLength: 0.18,
		limbThickness: 0.026,
		upperLegLength: 0.22,
		lowerLegLength: 0.20,
		shoulderWidth: 0.22,
		hipWidth: 0.11,
		jointRadius: 0.030,
		handRadius: 0.036,
		footLength: 0.08,
	},
};

/** Cached mesh references for the stickman. */
interface StickMeshRefs {
	head: THREE.Mesh;
	torso: THREE.Mesh;
	leftUpperArm: THREE.Group;
	leftForearm: THREE.Mesh;
	leftHand: THREE.Mesh;
	rightUpperArm: THREE.Group;
	rightForearm: THREE.Mesh;
	rightHand: THREE.Mesh;
	leftUpperLeg: THREE.Group;
	leftLowerLeg: THREE.Mesh;
	leftFoot: THREE.Mesh;
	rightUpperLeg: THREE.Group;
	rightLowerLeg: THREE.Mesh;
	rightFoot: THREE.Mesh;
	nameSprite: THREE.Sprite;
}

/** Internal struct to hold per-wrestler rendering data. */
interface WrestlerData {
	group: THREE.Group;
	animator: ProceduralAnimator;
	ikController: GrappleIKController;
	meshRefs: StickMeshRefs;
	bodyRadius: number;
	build: StickBuildConfig;
	headY: number;          // head center Y
	shoulderY: number;      // shoulder pivot Y
	hipY: number;           // hip pivot Y
	handMat: THREE.MeshStandardMaterial;
	leftCannonMat: THREE.MeshStandardMaterial;
	rightCannonMat: THREE.MeshStandardMaterial;
	leftThrusterBaseX: number;
	rightThrusterBaseX: number;
}

/**
 * Creates and manages stickman wrestler meshes in the THREE.js scene.
 * Each fighter is a classic stickman figure with round head, thin limbs,
 * and glowing fist/hand effects — driven by the 21-channel ProceduralPose system.
 */
export class WrestlerRenderer {
	private wrestlers: Map<EntityId, WrestlerData> = new Map();

	constructor(private scene: THREE.Scene) {}

	createWrestler(entityId: EntityId, config: WrestlerMeshConfig): THREE.Group {
		const group = new THREE.Group();
		group.name = `wrestler_${entityId}`;

		const build = STICK_BUILDS[config.build];
		const primaryColor = new THREE.Color(config.color);
		const secondaryColor = new THREE.Color(config.secondaryColor ?? config.color);

		// Boost very dark colors for visibility
		const luminance = primaryColor.r * 0.299 + primaryColor.g * 0.587 + primaryColor.b * 0.114;
		const boostedPrimary = luminance < 0.15
			? primaryColor.clone().lerp(new THREE.Color(0x667788), 0.35)
			: primaryColor.clone();
		const boostedSecondary = secondaryColor.clone();

		// ── Materials ──
		const bodyMat = new THREE.MeshStandardMaterial({
			color: boostedPrimary,
			roughness: 0.3,
			metalness: 0.4,
			emissive: boostedPrimary.clone().multiplyScalar(0.2),
			emissiveIntensity: 1.0
		});

		const limbMat = new THREE.MeshStandardMaterial({
			color: boostedPrimary.clone().lerp(new THREE.Color(0xcccccc), 0.2),
			roughness: 0.3,
			metalness: 0.5,
			emissive: boostedPrimary.clone().multiplyScalar(0.1),
			emissiveIntensity: 0.5
		});

		const jointMat = new THREE.MeshStandardMaterial({
			color: 0xddddee,
			roughness: 0.2,
			metalness: 0.7,
			emissive: new THREE.Color(0x444466),
			emissiveIntensity: 0.3
		});

		const handMat = new THREE.MeshStandardMaterial({
			color: boostedSecondary,
			roughness: 0.2,
			metalness: 0.5,
			emissive: boostedSecondary.clone(),
			emissiveIntensity: 0.4
		});

		const headMat = new THREE.MeshStandardMaterial({
			color: 0xeeeeee,
			roughness: 0.2,
			metalness: 0.3,
			emissive: new THREE.Color(0x222222),
			emissiveIntensity: 0.3
		});

		const visorMat = new THREE.MeshStandardMaterial({
			color: boostedPrimary,
			emissive: boostedSecondary.clone(),
			emissiveIntensity: 0.8,
			roughness: 0.05,
			metalness: 0.9
		});

		const footMat = new THREE.MeshStandardMaterial({
			color: 0x333344,
			roughness: 0.4,
			metalness: 0.5
		});

		// ── Computed positions ──
		const groundY = 0; // feet at ground level
		const footH = 0.02;
		const legTotalLength = build.upperLegLength + build.lowerLegLength;
		const hipY = groundY + footH + legTotalLength;
		const shoulderY = hipY + build.torsoLength;
		const headY = shoulderY + build.headRadius * 1.1;

		// ─── Head ───
		const headGeo = new THREE.SphereGeometry(build.headRadius, 16, 12);
		const head = new THREE.Mesh(headGeo, headMat);
		head.name = 'head';
		head.position.y = headY;
		head.castShadow = true;
		group.add(head);

		// Face visor (eyes area)
		const visorGeo = new THREE.PlaneGeometry(build.headRadius * 1.4, build.headRadius * 0.5, 4, 2);
		// Curve visor slightly
		const vPos = visorGeo.attributes.position;
		for (let i = 0; i < vPos.count; i++) {
			const x = vPos.getX(i);
			const y = vPos.getY(i);
			const curve = Math.sqrt(Math.max(0, 1 - (x / (build.headRadius * 0.8)) ** 2));
			vPos.setZ(i, -build.headRadius * 0.02 * (1 - curve));
		}
		visorGeo.computeVertexNormals();
		const visor = new THREE.Mesh(visorGeo, visorMat);
		visor.position.set(0, headY + build.headRadius * 0.05, -(build.headRadius * 0.96));
		group.add(visor);

		// ─── Torso ───
		const torsoGeo = new THREE.CapsuleGeometry(build.torsoThickness, build.torsoLength * 0.7, 4, 8);
		const torso = new THREE.Mesh(torsoGeo, bodyMat);
		torso.name = 'torso';
		torso.position.y = hipY + build.torsoLength / 2;
		torso.castShadow = true;
		group.add(torso);

		// ─── Left Arm ───
		const leftUpperArm = new THREE.Group();
		leftUpperArm.name = 'leftUpperArm';
		leftUpperArm.position.set(-build.shoulderWidth, shoulderY, 0);

		// Shoulder joint
		const shoulderGeo = new THREE.SphereGeometry(build.jointRadius, 8, 6);
		const leftShoulderJoint = new THREE.Mesh(shoulderGeo, jointMat);
		leftUpperArm.add(leftShoulderJoint);

		// Upper arm segment
		const upperArmGeo = new THREE.CapsuleGeometry(build.limbThickness, build.upperArmLength * 0.6, 3, 6);
		upperArmGeo.translate(0, -build.upperArmLength / 2, 0);
		const leftUpperArmMesh = new THREE.Mesh(upperArmGeo, limbMat);
		leftUpperArmMesh.name = 'leftUpperArm_mesh';
		leftUpperArmMesh.castShadow = true;
		leftUpperArm.add(leftUpperArmMesh);

		// Elbow joint
		const elbowGeo = new THREE.SphereGeometry(build.jointRadius * 0.8, 8, 6);
		const leftElbow = new THREE.Mesh(elbowGeo, jointMat);
		leftElbow.position.y = -build.upperArmLength;
		leftUpperArm.add(leftElbow);

		// Forearm
		const forearmGeo = new THREE.CapsuleGeometry(build.limbThickness * 0.9, build.forearmLength * 0.6, 3, 6);
		forearmGeo.translate(0, -build.forearmLength / 2, 0);
		const leftForearm = new THREE.Mesh(forearmGeo, limbMat);
		leftForearm.name = 'leftForearm';
		leftForearm.position.y = -build.upperArmLength;
		leftForearm.castShadow = true;
		leftUpperArm.add(leftForearm);

		// Hand (glowing fist)
		const handGeo = new THREE.SphereGeometry(build.handRadius, 8, 6);
		const leftHand = new THREE.Mesh(handGeo, handMat.clone());
		leftHand.name = 'leftHand';
		leftHand.position.y = -build.upperArmLength - build.forearmLength;
		leftHand.castShadow = true;
		leftUpperArm.add(leftHand);

		// Fist glow light
		const leftFistGlow = new THREE.PointLight(boostedSecondary.getHex(), 0.3, 0.8);
		leftFistGlow.position.copy(leftHand.position);
		leftUpperArm.add(leftFistGlow);

		leftUpperArm.rotation.z = Math.PI * 0.15; // slight outward angle
		group.add(leftUpperArm);

		// ─── Right Arm ───
		const rightUpperArm = new THREE.Group();
		rightUpperArm.name = 'rightUpperArm';
		rightUpperArm.position.set(build.shoulderWidth, shoulderY, 0);

		const rightShoulderJoint = new THREE.Mesh(shoulderGeo.clone(), jointMat);
		rightUpperArm.add(rightShoulderJoint);

		const rightUpperArmMesh = new THREE.Mesh(upperArmGeo.clone(), limbMat);
		rightUpperArmMesh.name = 'rightUpperArm_mesh';
		rightUpperArmMesh.castShadow = true;
		rightUpperArm.add(rightUpperArmMesh);

		const rightElbow = new THREE.Mesh(elbowGeo.clone(), jointMat);
		rightElbow.position.y = -build.upperArmLength;
		rightUpperArm.add(rightElbow);

		const rightForearm = new THREE.Mesh(forearmGeo.clone(), limbMat);
		rightForearm.name = 'rightForearm';
		rightForearm.position.y = -build.upperArmLength;
		rightForearm.castShadow = true;
		rightUpperArm.add(rightForearm);

		const rightHand = new THREE.Mesh(handGeo.clone(), handMat.clone());
		rightHand.name = 'rightHand';
		rightHand.position.y = -build.upperArmLength - build.forearmLength;
		rightHand.castShadow = true;
		rightUpperArm.add(rightHand);

		const rightFistGlow = new THREE.PointLight(boostedSecondary.getHex(), 0.3, 0.8);
		rightFistGlow.position.copy(rightHand.position);
		rightUpperArm.add(rightFistGlow);

		rightUpperArm.rotation.z = -Math.PI * 0.15;
		group.add(rightUpperArm);

		// ─── Left Leg ───
		const leftUpperLeg = new THREE.Group();
		leftUpperLeg.name = 'leftUpperLeg';
		leftUpperLeg.position.set(-build.hipWidth, hipY, 0);

		const hipJointGeo = new THREE.SphereGeometry(build.jointRadius * 0.9, 8, 6);
		const leftHipJoint = new THREE.Mesh(hipJointGeo, jointMat);
		leftUpperLeg.add(leftHipJoint);

		const upperLegGeo = new THREE.CapsuleGeometry(build.limbThickness * 1.1, build.upperLegLength * 0.6, 3, 6);
		upperLegGeo.translate(0, -build.upperLegLength / 2, 0);
		const leftUpperLegMesh = new THREE.Mesh(upperLegGeo, limbMat);
		leftUpperLegMesh.name = 'leftUpperLeg_mesh';
		leftUpperLegMesh.castShadow = true;
		leftUpperLeg.add(leftUpperLegMesh);

		// Knee joint
		const kneeGeo = new THREE.SphereGeometry(build.jointRadius * 0.8, 8, 6);
		const leftKnee = new THREE.Mesh(kneeGeo, jointMat);
		leftKnee.position.y = -build.upperLegLength;
		leftUpperLeg.add(leftKnee);

		// Lower leg
		const lowerLegGeo = new THREE.CapsuleGeometry(build.limbThickness, build.lowerLegLength * 0.6, 3, 6);
		lowerLegGeo.translate(0, -build.lowerLegLength / 2, 0);
		const leftLowerLeg = new THREE.Mesh(lowerLegGeo, limbMat);
		leftLowerLeg.name = 'leftLowerLeg';
		leftLowerLeg.position.y = -build.upperLegLength;
		leftLowerLeg.castShadow = true;
		leftUpperLeg.add(leftLowerLeg);

		// Foot
		const leftFootGeo = new THREE.BoxGeometry(build.limbThickness * 2.5, footH, build.footLength);
		const leftFoot = new THREE.Mesh(leftFootGeo, footMat);
		leftFoot.name = 'leftFoot';
		leftFoot.position.set(0, -build.upperLegLength - build.lowerLegLength, build.footLength * 0.2);
		leftFoot.castShadow = true;
		leftUpperLeg.add(leftFoot);

		group.add(leftUpperLeg);

		// ─── Right Leg ───
		const rightUpperLeg = new THREE.Group();
		rightUpperLeg.name = 'rightUpperLeg';
		rightUpperLeg.position.set(build.hipWidth, hipY, 0);

		const rightHipJoint = new THREE.Mesh(hipJointGeo.clone(), jointMat);
		rightUpperLeg.add(rightHipJoint);

		const rightUpperLegMesh = new THREE.Mesh(upperLegGeo.clone(), limbMat);
		rightUpperLegMesh.name = 'rightUpperLeg_mesh';
		rightUpperLegMesh.castShadow = true;
		rightUpperLeg.add(rightUpperLegMesh);

		const rightKnee = new THREE.Mesh(kneeGeo.clone(), jointMat);
		rightKnee.position.y = -build.upperLegLength;
		rightUpperLeg.add(rightKnee);

		const rightLowerLeg = new THREE.Mesh(lowerLegGeo.clone(), limbMat);
		rightLowerLeg.name = 'rightLowerLeg';
		rightLowerLeg.position.y = -build.upperLegLength;
		rightLowerLeg.castShadow = true;
		rightUpperLeg.add(rightLowerLeg);

		const rightFootGeo = new THREE.BoxGeometry(build.limbThickness * 2.5, footH, build.footLength);
		const rightFoot = new THREE.Mesh(rightFootGeo, footMat);
		rightFoot.name = 'rightFoot';
		rightFoot.position.set(0, -build.upperLegLength - build.lowerLegLength, build.footLength * 0.2);
		rightFoot.castShadow = true;
		rightUpperLeg.add(rightFoot);

		group.add(rightUpperLeg);

		// ─── Name Label Sprite ───
		const nameSprite = this.createNameSprite(config.name ?? `P${entityId + 1}`, boostedPrimary);
		nameSprite.position.y = headY + build.headRadius + 0.15;
		nameSprite.name = 'nameLabel';
		group.add(nameSprite);

		// ─── Body glow (subtle inner glow) ───
		const coreGlowGeo = new THREE.SphereGeometry(build.torsoThickness * 3, 8, 6);
		const coreGlowMat = new THREE.MeshBasicMaterial({
			color: boostedSecondary.clone().lerp(new THREE.Color(0xffffff), 0.3),
			transparent: true,
			opacity: 0.08,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		});
		const coreGlow = new THREE.Mesh(coreGlowGeo, coreGlowMat);
		coreGlow.position.y = hipY + build.torsoLength / 2;
		group.add(coreGlow);

		this.scene.add(group);

		// ── Store refs ──
		const meshRefs: StickMeshRefs = {
			head, torso,
			leftUpperArm, leftForearm, leftHand,
			rightUpperArm, rightForearm, rightHand,
			leftUpperLeg, leftLowerLeg, leftFoot,
			rightUpperLeg, rightLowerLeg, rightFoot,
			nameSprite
		};

		const animator = new ProceduralAnimator();
		const ikController = new GrappleIKController();
		ikController.setArmLengths(build.upperArmLength, build.forearmLength);

		const leftCannonMat = leftHand.material as THREE.MeshStandardMaterial;
		const rightCannonMat = rightHand.material as THREE.MeshStandardMaterial;

		this.wrestlers.set(entityId, {
			group, animator, ikController, meshRefs,
			bodyRadius: build.headRadius,
			build,
			headY,
			shoulderY,
			hipY,
			handMat,
			leftCannonMat,
			rightCannonMat,
			leftThrusterBaseX: -build.hipWidth,
			rightThrusterBaseX: build.hipWidth,
		});

		return group;
	}

	/**
	 * Create a billboard name label sprite using canvas texture.
	 */
	private createNameSprite(name: string, color: THREE.Color): THREE.Sprite {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d')!;

		// Background pill
		ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
		const pillRadius = 16;
		ctx.beginPath();
		ctx.roundRect(8, 8, 240, 48, pillRadius);
		ctx.fill();

		// Border
		const hexColor = '#' + color.getHexString();
		ctx.strokeStyle = hexColor;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.roundRect(8, 8, 240, 48, pillRadius);
		ctx.stroke();

		// Name text
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 24px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(name.substring(0, 16), 128, 32);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;

		const spriteMat = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			depthTest: false,
			sizeAttenuation: true
		});

		const sprite = new THREE.Sprite(spriteMat);
		sprite.scale.set(0.6, 0.15, 1);
		return sprite;
	}

	updateTransform(entityId: EntityId, position: Vec3, rotation: Quat): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		data.group.position.set(position[0], position[1], position[2]);
		data.group.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
	}

	/**
	 * Set the animation command for a wrestler (rich API).
	 */
	setAnimationCommand(entityId: EntityId, cmd: AnimationCommand): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		data.animator.setCommand(cmd);
	}

	/**
	 * Legacy: set animation by clip ID string.
	 */
	setAnimation(entityId: EntityId, clipId: string): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		const stateMap: Record<string, AnimStateId> = {
			stance: 'stance', attacking: 'attacking', stunned: 'stunned',
			grounded: 'grounded', blocking: 'blocking', recovery: 'recovery',
			moving: 'moving', taunting: 'taunting', getting_up: 'getting_up'
		};
		data.animator.setState(stateMap[clipId] ?? 'stance');
	}

	setVelocity(entityId: EntityId, velocity: number): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		data.animator.setVelocity(velocity);
	}

	applyKnockback(entityId: EntityId, direction: number, intensity: number): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;
		data.animator.applyKnockback(direction, intensity);
	}

	/**
	 * Advance procedural animation for all stickmen.
	 */
	update(dt: number, opponentPositions?: Map<EntityId, THREE.Vector3>): void {
		for (const [id, data] of this.wrestlers) {
			const pose = data.animator.update(dt);
			this.applyPoseToStickman(data, pose);

			// Apply visual root motion offsets
			if (pose.rootDeltaX !== 0 || pose.rootDeltaY !== 0 || pose.rootDeltaZ !== 0) {
				data.group.position.x += pose.rootDeltaX;
				data.group.position.y += pose.rootDeltaY;
				data.group.position.z += pose.rootDeltaZ;
			}

			// Floor clamp — never let the stickman sink below the ring surface (0.3)
			if (data.group.position.y < 0.3) {
				data.group.position.y = 0.3;
			}
		}
	}

	/**
	 * Apply 21-channel ProceduralPose to the stickman mesh hierarchy.
	 *
	 * Mapping:
	 * - Body channels → torso rotation/position
	 * - Head channels → head tilt
	 * - Arm channels → arm groups (shoulder pivot + forearm bend)
	 * - Leg channels → leg groups (hip pivot + knee bend)
	 */
	private applyPoseToStickman(data: WrestlerData, pose: ProceduralPose): void {
		const refs = data.meshRefs;
		const b = data.build;

		// ── Torso ──
		refs.torso.rotation.x = pose.bodyX * 1.2;
		refs.torso.rotation.z = pose.bodyZ;
		refs.torso.rotation.y = pose.bodyRotY;
		refs.torso.position.y = data.hipY + b.torsoLength / 2 + pose.bodyY;

		// ── Head ──
		refs.head.rotation.x = pose.headX * 1.2;
		refs.head.rotation.z = pose.headZ * 1.2;
		refs.head.position.y = data.headY + pose.bodyY;

		// Name sprite follows head
		refs.nameSprite.position.y = data.headY + b.headRadius + 0.15 + pose.bodyY;

		// ── Left Arm ──
		refs.leftUpperArm.rotation.z = pose.leftArmZ;
		refs.leftUpperArm.rotation.x = pose.leftArmX;
		refs.leftForearm.rotation.x = pose.leftForearmX;

		// Fist glow intensifies during attacks
		const leftGlow = 0.3 + Math.abs(pose.leftArmX) * 1.5;
		data.leftCannonMat.emissiveIntensity = leftGlow;

		// ── Right Arm ──
		refs.rightUpperArm.rotation.z = pose.rightArmZ;
		refs.rightUpperArm.rotation.x = pose.rightArmX;
		refs.rightForearm.rotation.x = pose.rightForearmX;

		const rightGlow = 0.3 + Math.abs(pose.rightArmX) * 1.5;
		data.rightCannonMat.emissiveIntensity = rightGlow;

		// ── Left Leg ──
		refs.leftUpperLeg.rotation.x = pose.leftLegX;
		refs.leftUpperLeg.rotation.z = pose.leftLegZ;
		refs.leftLowerLeg.rotation.x = pose.leftCalfX;

		// ── Right Leg ──
		refs.rightUpperLeg.rotation.x = pose.rightLegX;
		refs.rightUpperLeg.rotation.z = pose.rightLegZ;
		refs.rightLowerLeg.rotation.x = pose.rightCalfX;
	}

	remove(entityId: EntityId): void {
		const data = this.wrestlers.get(entityId);
		if (!data) return;

		data.group.traverse((child) => {
			if ((child as THREE.Mesh).isMesh) {
				const mesh = child as THREE.Mesh;
				mesh.geometry.dispose();
				if (Array.isArray(mesh.material)) {
					mesh.material.forEach((m) => m.dispose());
				} else {
					mesh.material.dispose();
				}
			}
			if ((child as THREE.Sprite).isSprite) {
				const sprite = child as THREE.Sprite;
				sprite.material.map?.dispose();
				sprite.material.dispose();
			}
		});
		this.scene.remove(data.group);
		this.wrestlers.delete(entityId);
	}

	dispose(): void {
		for (const entityId of this.wrestlers.keys()) {
			this.remove(entityId);
		}
	}

	has(entityId: EntityId): boolean {
		return this.wrestlers.has(entityId);
	}

	getGroup(entityId: EntityId): THREE.Group | undefined {
		return this.wrestlers.get(entityId)?.group;
	}
}
