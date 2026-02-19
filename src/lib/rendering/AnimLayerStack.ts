import type { ProceduralPose } from './ProceduralAnimator';
import type { BodyMask } from './BodyMask';
import { FULL_BODY, UPPER_BODY, LOWER_BODY } from './BodyMask';
import { zeroPose } from './ProceduralAnimator';

/**
 * Blend modes for animation layers.
 * - override: weighted replacement (result = lerp(current, layer, weight * mask))
 * - additive: added on top (result += layer * weight * mask)
 */
export type BlendMode = 'override' | 'additive';

/**
 * A single animation layer in the blend stack.
 */
export interface AnimLayer {
	/** Layer name for debugging. */
	name: string;
	/** The pose computed for this layer. */
	pose: ProceduralPose;
	/** 0-1 global weight for this layer. */
	weight: number;
	/** Body region mask. */
	mask: BodyMask;
	/** How this layer blends with layers below it. */
	blendMode: BlendMode;
}

/**
 * 4-layer animation blend stack.
 *
 * | Layer | Name           | Default Mask | Blend Mode | Purpose                          |
 * |-------|----------------|-------------|------------|----------------------------------|
 * | 0     | BASE_POSE      | FULL_BODY    | override   | Foundation pose for current state |
 * | 1     | LOCOMOTION     | LOWER_BODY   | override   | Walking/shuffling legs            |
 * | 2     | COMBAT_UPPER   | UPPER_BODY   | override   | Move-specific attack/block poses  |
 * | 3     | PROCEDURAL     | FULL_BODY    | additive   | Breathing, wobble, bounce, tilt   |
 */
export class AnimLayerStack {
	readonly layers: AnimLayer[];

	constructor() {
		this.layers = [
			{ name: 'BASE_POSE',    pose: zeroPose(), weight: 1.0, mask: FULL_BODY,  blendMode: 'override' },
			{ name: 'LOCOMOTION',   pose: zeroPose(), weight: 0.0, mask: LOWER_BODY, blendMode: 'override' },
			{ name: 'COMBAT_UPPER', pose: zeroPose(), weight: 0.0, mask: UPPER_BODY, blendMode: 'override' },
			{ name: 'PROCEDURAL',   pose: zeroPose(), weight: 1.0, mask: FULL_BODY,  blendMode: 'additive' },
		];
	}

	/** Get a layer by index. */
	getLayer(index: number): AnimLayer {
		return this.layers[index];
	}

	/** Set weight for a layer. */
	setWeight(index: number, weight: number): void {
		this.layers[index].weight = weight;
	}

	/** Set pose for a layer. */
	setPose(index: number, pose: ProceduralPose): void {
		this.layers[index].pose = pose;
	}

	/**
	 * Compute the final blended pose from all layers.
	 * Override layers replace proportionally; additive layers add on top.
	 */
	computeFinalPose(): ProceduralPose {
		const result = zeroPose();

		for (const layer of this.layers) {
			if (layer.weight < 0.001) continue;

			const w = layer.weight;
			const m = layer.mask;
			const p = layer.pose;

			if (layer.blendMode === 'override') {
				// Weighted override: blend toward this layer's pose
				// Arms
				result.leftArmZ  += (p.leftArmZ  - result.leftArmZ)  * w * m.leftArm;
				result.leftArmX  += (p.leftArmX  - result.leftArmX)  * w * m.leftArm;
				result.rightArmZ += (p.rightArmZ - result.rightArmZ) * w * m.rightArm;
				result.rightArmX += (p.rightArmX - result.rightArmX) * w * m.rightArm;
				result.leftForearmX  += (p.leftForearmX  - result.leftForearmX)  * w * m.leftArm;
				result.rightForearmX += (p.rightForearmX - result.rightForearmX) * w * m.rightArm;

				// Legs
				result.leftLegX  += (p.leftLegX  - result.leftLegX)  * w * m.leftLeg;
				result.rightLegX += (p.rightLegX - result.rightLegX) * w * m.rightLeg;
				result.leftLegZ  += (p.leftLegZ  - result.leftLegZ)  * w * m.leftLeg;
				result.rightLegZ += (p.rightLegZ - result.rightLegZ) * w * m.rightLeg;
				result.leftCalfX  += (p.leftCalfX  - result.leftCalfX)  * w * m.leftLeg;
				result.rightCalfX += (p.rightCalfX - result.rightCalfX) * w * m.rightLeg;

				// Torso
				result.bodyX    += (p.bodyX    - result.bodyX)    * w * m.torso;
				result.bodyZ    += (p.bodyZ    - result.bodyZ)    * w * m.torso;
				result.bodyRotY += (p.bodyRotY - result.bodyRotY) * w * m.torso;

				// Hips
				result.bodyY += (p.bodyY - result.bodyY) * w * m.hips;

				// Head
				result.headY += (p.headY - result.headY) * w * m.head;
				result.headX += (p.headX - result.headX) * w * m.head;
				result.headZ += (p.headZ - result.headZ) * w * m.head;

				// Root motion
				result.rootDeltaX += (p.rootDeltaX - result.rootDeltaX) * w;
				result.rootDeltaY += (p.rootDeltaY - result.rootDeltaY) * w;
				result.rootDeltaZ += (p.rootDeltaZ - result.rootDeltaZ) * w;
			} else {
				// Additive: add scaled values on top
				result.leftArmZ  += p.leftArmZ  * w * m.leftArm;
				result.leftArmX  += p.leftArmX  * w * m.leftArm;
				result.rightArmZ += p.rightArmZ * w * m.rightArm;
				result.rightArmX += p.rightArmX * w * m.rightArm;
				result.leftForearmX  += p.leftForearmX  * w * m.leftArm;
				result.rightForearmX += p.rightForearmX * w * m.rightArm;

				result.leftLegX  += p.leftLegX  * w * m.leftLeg;
				result.rightLegX += p.rightLegX * w * m.rightLeg;
				result.leftLegZ  += p.leftLegZ  * w * m.leftLeg;
				result.rightLegZ += p.rightLegZ * w * m.rightLeg;
				result.leftCalfX  += p.leftCalfX  * w * m.leftLeg;
				result.rightCalfX += p.rightCalfX * w * m.rightLeg;

				result.bodyX    += p.bodyX    * w * m.torso;
				result.bodyZ    += p.bodyZ    * w * m.torso;
				result.bodyRotY += p.bodyRotY * w * m.torso;
				result.bodyY    += p.bodyY    * w * m.hips;

				result.headY += p.headY * w * m.head;
				result.headX += p.headX * w * m.head;
				result.headZ += p.headZ * w * m.head;

				result.rootDeltaX += p.rootDeltaX * w;
				result.rootDeltaY += p.rootDeltaY * w;
				result.rootDeltaZ += p.rootDeltaZ * w;
			}
		}

		return result;
	}
}
