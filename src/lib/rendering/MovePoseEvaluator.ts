import type { AnimationCommand } from './AnimationCommand';
import type { ProceduralPose } from './ProceduralAnimator';
import { zeroPose } from './ProceduralAnimator';
import { getMovePoseConfig, type MovePoseConfig } from './MovePoseRegistry';

/**
 * MovePoseEvaluator — generates Layer 2 (COMBAT_UPPER) poses based on
 * the active move, its phase progress, and combo context.
 *
 * Reads AnimationCommand to determine:
 *   - Which move-specific pose config to use
 *   - Phase progress (windup → active → recovery)
 *   - Combo step intensity scaling
 *   - Root motion offsets
 */
export class MovePoseEvaluator {
	/** Last evaluated move config (cached to avoid re-lookup). */
	private _lastMoveId: string | null = null;
	private _lastConfig: MovePoseConfig | null = null;

	/**
	 * Evaluate the combat pose for the current animation command.
	 * Returns a pose for Layer 2 (COMBAT_UPPER) and the layer weight.
	 */
	evaluate(cmd: AnimationCommand): { pose: ProceduralPose; weight: number } {
		const phase = cmd.phase;
		const isAttacking = phase === 'windup' || phase === 'active' || phase === 'recovery';
		const isFinisher = phase === 'finisher_setup' || phase === 'finisher_impact';

		if (!isAttacking && !isFinisher) {
			return { pose: zeroPose(), weight: 0 };
		}

		// Look up move config (cache for performance)
		if (cmd.moveId !== this._lastMoveId) {
			this._lastMoveId = cmd.moveId;
			this._lastConfig = getMovePoseConfig(cmd.moveId, cmd.moveCategory);
		}
		const config = this._lastConfig;
		if (!config) {
			return { pose: zeroPose(), weight: 0 };
		}

		// Compute progress (0 → 1) through current phase
		const totalFrames = Math.max(1, cmd.phaseTotalFrames);
		const elapsed = totalFrames - cmd.phaseFrames;
		const progress = Math.min(elapsed / totalFrames, 1);

		// Combo intensity scaling: each step adds 10% more exaggeration
		const comboScale = cmd.comboStep >= 0
			? 1.0 + cmd.comboStep * 0.1
			: 1.0;

		const pose = zeroPose();

		switch (phase) {
			case 'windup':
			case 'finisher_setup':
				// Interpolate from neutral to windup pose
				applyPartialPose(pose, config.windup, progress * comboScale);
				// Visual root motion during windup
				pose.rootDeltaX = config.rootMotion.windupX * progress;
				break;

			case 'active':
			case 'finisher_impact':
				// Snap to active pose at full intensity
				applyPartialPose(pose, config.active, comboScale);
				// Visual root motion during active
				pose.rootDeltaX = config.rootMotion.activeX * progress;
				pose.rootDeltaY = config.rootMotion.activeY * progress;
				break;

			case 'recovery':
				// Interpolate from active pose back to neutral
				applyPartialPose(pose, config.active, (1 - progress) * comboScale);
				// Root motion settles back
				pose.rootDeltaX = config.rootMotion.activeX * (1 - progress);
				pose.rootDeltaY = config.rootMotion.activeY * (1 - progress);
				break;
		}

		// Compute weight based on upper body ratio
		const weight = isFinisher ? 1.0 : Math.max(0.3, config.upperBodyRatio);

		return { pose, weight };
	}

	/**
	 * Get the current move's IK requirement.
	 */
	shouldUseIK(cmd: AnimationCommand): boolean {
		const config = getMovePoseConfig(cmd.moveId, cmd.moveCategory);
		if (!config?.useIK) return false;

		const phase = cmd.phase;
		return phase === 'windup' || phase === 'active' || phase === 'recovery'
			|| phase === 'finisher_setup' || phase === 'finisher_impact';
	}
}

/**
 * Apply partial pose values onto a full pose, scaled by intensity.
 */
function applyPartialPose(target: ProceduralPose, partial: Partial<ProceduralPose>, intensity: number): void {
	for (const key of Object.keys(partial) as Array<keyof ProceduralPose>) {
		const value = partial[key];
		if (value !== undefined) {
			(target as unknown as Record<string, number>)[key] = value * intensity;
		}
	}
}
