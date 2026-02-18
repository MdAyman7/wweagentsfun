import { clamp, lerp } from '../../utils/math';

/**
 * SlowMotionController — manages time dilation with smooth ramp envelope.
 *
 * The rAF loop reads `controller.factor` and scales its delta:
 *   accumulator += rawDelta * controller.factor
 *
 * factor = 1.0 → normal speed
 * factor = 0.25 → quarter speed (4× slow motion)
 * factor = 0.1 → 10× slow motion
 *
 * Envelope phases (mirrors the ECS SlowMotionSystem):
 *   Ramp in:  first N% of duration, lerp 1.0 → targetFactor
 *   Sustain:  middle, hold at targetFactor
 *   Ramp out: last M% of duration, lerp targetFactor → 1.0
 */
export class SlowMotionController {
	private active = false;
	private targetFactor = 1.0;
	private totalTicks = 0;
	private elapsedTicks = 0;
	private rampInPct = 0.1;
	private rampOutPct = 0.2;

	/** Current time dilation factor. Read by the rAF loop. */
	get factor(): number {
		if (!this.active) return 1.0;

		const progress = this.elapsedTicks / this.totalTicks;
		const rampInEnd = this.rampInPct;
		const rampOutStart = 1.0 - this.rampOutPct;

		if (progress < rampInEnd) {
			// Ramp in: lerp from 1.0 → target
			const t = progress / rampInEnd;
			return lerp(1.0, this.targetFactor, t);
		} else if (progress < rampOutStart) {
			// Sustain at target
			return this.targetFactor;
		} else {
			// Ramp out: lerp from target → 1.0
			const t = (progress - rampOutStart) / this.rampOutPct;
			return lerp(this.targetFactor, 1.0, clamp(t, 0, 1));
		}
	}

	/** Activate slow motion with an envelope. */
	activate(
		targetFactor: number,
		durationTicks: number,
		rampIn = 0.1,
		rampOut = 0.2
	): void {
		this.active = true;
		this.targetFactor = clamp(targetFactor, 0.05, 1.0);
		this.totalTicks = Math.max(1, durationTicks);
		this.elapsedTicks = 0;
		this.rampInPct = clamp(rampIn, 0, 0.4);
		this.rampOutPct = clamp(rampOut, 0, 0.4);
	}

	/** Advance by one simulation tick. */
	tick(): void {
		if (!this.active) return;
		this.elapsedTicks++;
		if (this.elapsedTicks >= this.totalTicks) {
			this.active = false;
		}
	}

	/** Force back to normal speed. */
	reset(): void {
		this.active = false;
		this.targetFactor = 1.0;
		this.elapsedTicks = 0;
		this.totalTicks = 0;
	}

	get isActive(): boolean {
		return this.active;
	}

	/** Remaining ticks in current slow-motion effect. */
	get remaining(): number {
		if (!this.active) return 0;
		return this.totalTicks - this.elapsedTicks;
	}
}
