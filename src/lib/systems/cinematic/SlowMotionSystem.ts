import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase } from '../../utils/types';
import { clamp, lerp } from '../../utils/math';

interface SlowMotionEvent {
	factor: number;
	durationFrames: number;
}

/**
 * Slow-motion state tracking.
 */
interface SlowMotionState {
	active: boolean;
	factor: number; // Time dilation factor (e.g., 0.25 = quarter speed)
	remainingFrames: number;
	totalFrames: number;
}

/**
 * SlowMotionSystem
 *
 * Manages time dilation for dramatic slow-motion effects. When activated,
 * the system writes a timeDilation factor to a world resource that the
 * PhysicsSystem and AnimationSystem read to scale their dt.
 *
 * Slow-motion is triggered by 'cinematic:slow_motion' events, typically
 * emitted by the ReplayTriggerSystem or CameraDirectorSystem during
 * high-impact moments.
 *
 * The system handles smooth ramping:
 *   - Ramp in: First 10% of duration, lerp from 1.0 to target factor
 *   - Sustain: Middle 70% of duration at target factor
 *   - Ramp out: Last 20% of duration, lerp from target factor back to 1.0
 *
 * This creates a smooth bullet-time effect rather than an abrupt
 * speed change.
 */
export class SlowMotionSystem extends System {
	readonly name = 'SlowMotionSystem';
	readonly phase: Phase = 'cinematic';
	readonly priority = 20;

	private state: SlowMotionState = {
		active: false,
		factor: 1.0,
		remainingFrames: 0,
		totalFrames: 0
	};

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('cinematic:slow_motion', (ev: SlowMotionEvent) => {
			// Only accept new slow-motion if not already active, or if the new
			// factor is more extreme (slower)
			if (!this.state.active || ev.factor < this.state.factor) {
				this.state = {
					active: true,
					factor: clamp(ev.factor, 0.05, 1.0),
					remainingFrames: ev.durationFrames,
					totalFrames: ev.durationFrames
				};
			}
		});
	}

	execute(world: World, _dt: number, _eventBus: EventBus): void {
		if (!this.state.active) {
			// Ensure timeDilation is 1.0 when not in slow-mo
			const currentDilation = world.getResource<number>('timeDilation');
			if (currentDilation !== undefined && currentDilation !== 1.0) {
				// Only reset if we were the ones who changed it
				// (ExternalInputSystem may have set a different speed)
				const externalCommands = world.getResource<any[]>('externalCommands');
				if (!externalCommands || externalCommands.length === 0) {
					world.setResource('timeDilation', 1.0);
				}
			}
			return;
		}

		// Calculate progress through slow-motion sequence
		const elapsed = this.state.totalFrames - this.state.remainingFrames;
		const progress = elapsed / this.state.totalFrames;

		let currentFactor: number;

		// Ramp in (first 10%)
		if (progress < 0.1) {
			const rampProgress = progress / 0.1;
			currentFactor = lerp(1.0, this.state.factor, rampProgress);
		}
		// Sustain (10% - 80%)
		else if (progress < 0.8) {
			currentFactor = this.state.factor;
		}
		// Ramp out (last 20%)
		else {
			const rampProgress = (progress - 0.8) / 0.2;
			currentFactor = lerp(this.state.factor, 1.0, rampProgress);
		}

		world.setResource('timeDilation', clamp(currentFactor, 0.05, 1.0));

		// Decrement remaining frames
		this.state.remainingFrames--;

		if (this.state.remainingFrames <= 0) {
			this.state.active = false;
			this.state.remainingFrames = 0;
			world.setResource('timeDilation', 1.0);
		}
	}

	destroy(_world: World): void {
		this.state = {
			active: false,
			factor: 1.0,
			remainingFrames: 0,
			totalFrames: 0
		};
	}
}
