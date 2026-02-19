import type { AnimationCommand } from './AnimationCommand';
import type { ProceduralPose } from './ProceduralAnimator';
import { zeroPose } from './ProceduralAnimator';

/**
 * FinisherAnimController — generates coordinated attacker/defender poses
 * during cinematic finisher sequences.
 *
 * Finisher phases and animation mapping:
 *
 * | Sim Phase        | Attacker Anim            | Defender Anim     |
 * |------------------|--------------------------|-------------------|
 * | finisher_setup   | Approach → grab → lift   | Frozen/locked     |
 * | finisher_impact  | Impact strike pose       | Crash/collapse    |
 * | recovery (post)  | Celebration              | Grounded          |
 *
 * Counter-finisher: attacker → stunned, defender → idle + taunt.
 */
export class FinisherAnimController {
	private _active = false;

	/** Whether the finisher controller is currently active. */
	get isActive(): boolean {
		return this._active;
	}

	/**
	 * Evaluate finisher pose for a wrestler.
	 *
	 * @param cmd Animation command for this wrestler.
	 * @returns Pose and weight, or null if finisher is not active for this wrestler.
	 */
	evaluate(cmd: AnimationCommand): { pose: ProceduralPose; weight: number } | null {
		if (cmd.finisherRole === 'none') {
			this._active = false;
			return null;
		}

		this._active = true;

		if (cmd.finisherRole === 'attacker') {
			return this.evaluateAttacker(cmd);
		} else {
			return this.evaluateDefender(cmd);
		}
	}

	/**
	 * Attacker finisher poses.
	 */
	private evaluateAttacker(cmd: AnimationCommand): { pose: ProceduralPose; weight: number } {
		const pose = zeroPose();
		const totalFrames = Math.max(1, cmd.phaseTotalFrames);
		const elapsed = totalFrames - cmd.phaseFrames;
		const progress = Math.min(elapsed / totalFrames, 1);

		switch (cmd.phase) {
			case 'finisher_setup': {
				// Phase 1: Approach and grab (first half), Lift (second half)
				if (progress < 0.4) {
					// Approach: crouch + reach forward
					const t = progress / 0.4;
					pose.bodyX = -0.2 * t;
					pose.bodyY = -0.05 * t;
					pose.leftArmX = -0.6 * t;
					pose.rightArmX = -0.6 * t;
					pose.rootDeltaX = 0.1 * t;
				} else if (progress < 0.7) {
					// Grab: lock arms around opponent
					const t = (progress - 0.4) / 0.3;
					pose.bodyX = -0.2;
					pose.bodyY = -0.05 + 0.1 * t;
					pose.leftArmX = -0.6 - 0.2 * t;
					pose.rightArmX = -0.6 - 0.2 * t;
					pose.bodyRotY = 0.1 * t;
					pose.rootDeltaX = 0.1;
				} else {
					// Lift: arch back, elevate
					const t = (progress - 0.7) / 0.3;
					pose.bodyX = -0.2 + 0.5 * t;
					pose.bodyY = 0.05 + 0.2 * t;
					pose.leftArmX = -0.8;
					pose.rightArmX = -0.8;
					pose.bodyRotY = 0.1 + 0.1 * t;
					pose.leftLegX = -0.15 * t;
					pose.rightLegX = 0.15 * t;
					pose.rootDeltaX = 0.1 - 0.05 * t;
					pose.rootDeltaY = 0.05 * t;
				}
				break;
			}

			case 'finisher_impact': {
				// Impact: slam down with full commitment
				pose.bodyX = 0.4 * (1 - progress * 0.3);
				pose.bodyY = 0.25 - 0.25 * progress;
				pose.leftArmX = -0.8 + 0.3 * progress;
				pose.rightArmX = -0.8 + 0.3 * progress;
				pose.bodyRotY = 0.2 - 0.2 * progress;
				pose.rootDeltaX = -0.1 * progress;
				pose.rootDeltaY = -0.1 * progress;
				break;
			}

			default: {
				// Post-finisher: celebration stance
				pose.leftArmZ = Math.PI * 0.6;
				pose.rightArmZ = -Math.PI * 0.6;
				pose.leftArmX = -0.2;
				pose.rightArmX = -0.2;
				pose.bodyX = -0.1;
				pose.bodyY = 0.05;
				break;
			}
		}

		return { pose, weight: 1.0 };
	}

	/**
	 * Defender finisher poses (locked/receiving).
	 */
	private evaluateDefender(cmd: AnimationCommand): { pose: ProceduralPose; weight: number } {
		const pose = zeroPose();
		const totalFrames = Math.max(1, cmd.phaseTotalFrames);
		const elapsed = totalFrames - cmd.phaseFrames;
		const progress = Math.min(elapsed / totalFrames, 1);

		switch (cmd.phase) {
			case 'finisher_locked': {
				// Locked: frozen in stunned pose, gradually elevated
				if (progress < 0.5) {
					// Stunned freeze
					pose.bodyX = 0.2;
					pose.bodyZ = 0.08;
					pose.leftArmX = 0.1;
					pose.rightArmX = 0.1;
					pose.leftArmZ = Math.PI * 0.05;
					pose.rightArmZ = -Math.PI * 0.05;
				} else {
					// Elevated (being lifted)
					const t = (progress - 0.5) / 0.5;
					pose.bodyX = 0.2 + 0.3 * t;
					pose.bodyZ = 0.08;
					pose.bodyY = 0.15 * t;
					pose.leftArmX = 0.1 + 0.2 * t;
					pose.rightArmX = 0.1 + 0.2 * t;
					pose.leftArmZ = Math.PI * 0.15 * t;
					pose.rightArmZ = -Math.PI * 0.15 * t;
					pose.leftLegX = 0.1 * t;
					pose.rightLegX = -0.1 * t;
				}
				break;
			}

			case 'stun': {
				// Post-impact: stunned from finisher
				pose.bodyX = 0.3;
				pose.bodyZ = 0.1;
				pose.bodyY = -0.1;
				pose.leftArmX = 0.2;
				pose.rightArmX = 0.2;
				break;
			}

			case 'knockdown': {
				// Collapsed on mat from finisher
				pose.bodyX = Math.PI * 0.5;
				pose.bodyZ = 0.1;
				pose.bodyY = -0.6;
				pose.leftArmZ = Math.PI * 0.4;
				pose.rightArmZ = -Math.PI * 0.4;
				pose.headY = 0.15;
				break;
			}

			default: {
				// Default: stunned pose
				pose.bodyX = 0.25;
				pose.bodyZ = 0.08;
				pose.leftArmX = 0.15;
				pose.rightArmX = 0.15;
				break;
			}
		}

		return { pose, weight: 1.0 };
	}
}
