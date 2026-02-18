import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase } from '../../utils/types';
import type { VFXRequest } from '../../components/rendering/VFXRequest';

/**
 * VFXSystem
 *
 * Manages the lifecycle of visual effects entities. VFX entities are
 * spawned by other systems (typically in response to combat events)
 * and carry a VFXRequest component with a time-to-live (ttl).
 *
 * This system is the consumer side of the VFX pipeline:
 *   1. Decrements the ttl of each VFX entity per frame
 *   2. Removes expired VFX entities via the command buffer
 *   3. Adjusts VFX speed based on time dilation (slow-motion VFX)
 *
 * VFX entities are expected to have:
 *   - VFXRequest component (effect type, position, ttl, intensity)
 *   - Transform component (position in world space)
 *   - Renderable component (mesh/particle ID for rendering)
 *
 * The rendering layer reads VFXRequest data to know what particle
 * system or mesh effect to display, and uses ttl/intensity to
 * control the visual lifecycle.
 *
 * VFX spawning is handled elsewhere (typically by event listeners
 * in the CombatSystem or DamageSystem). This system only manages
 * their lifecycle.
 */
export class VFXSystem extends System {
	readonly name = 'VFXSystem';
	readonly phase: Phase = 'presentation';
	readonly priority = 20;

	private vfxQuery = new Query(['VFXRequest']);

	execute(world: World, dt: number, _eventBus: EventBus): void {
		const timeDilation = world.getResource<number>('timeDilation') ?? 1.0;

		// Effective time step: in slow-motion, VFX last longer (ttl decrements slower)
		const effectiveDt = dt * timeDilation;
		// Convert dt to frame-equivalent (assuming 60fps baseline)
		const frameDelta = Math.max(1, Math.round(effectiveDt * 60));

		const results = this.vfxQuery.execute(world);

		for (const { entity, components } of results) {
			const vfx = components.get('VFXRequest') as VFXRequest;

			const newTtl = vfx.ttl - frameDelta;

			if (newTtl <= 0) {
				// VFX expired: schedule removal of the entire entity
				world.commandBuffer.destroyEntity(entity);
			} else {
				// Update ttl and fade intensity as VFX ages
				const ageRatio = newTtl / (vfx.ttl + frameDelta); // Original ttl approximation
				const fadedIntensity = vfx.intensity * Math.min(1.0, ageRatio * 2); // Fade in last half

				world.addComponent(entity, 'VFXRequest', {
					...vfx,
					ttl: newTtl,
					intensity: fadedIntensity
				});
			}
		}
	}
}
