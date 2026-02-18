import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, Vec3 } from '../../utils/types';
import type { Transform } from '../../components/spatial/Transform';
import type { Collider } from '../../components/spatial/Collider';

/**
 * Physics adapter interface.
 * Wraps whatever physics engine is plugged in (Rapier, custom, etc.).
 */
interface PhysicsAdapter {
	step(dt: number): void;
	getBodyPosition(entity: EntityId): Vec3 | null;
	getBodyRotation(entity: EntityId): [number, number, number, number] | null;
	setBodyPosition(entity: EntityId, pos: Vec3): void;
}

/**
 * PhysicsSystem
 *
 * Steps the physics simulation and syncs the results back to ECS Transform
 * components. This is a thin integration layer between the ECS world and
 * the underlying physics engine.
 *
 * The physics adapter is expected to be a world resource ('physicsAdapter')
 * that implements the PhysicsAdapter interface. The adapter may be backed
 * by Rapier, a custom 2D solver, or a simple kinematic system.
 *
 * Time dilation is applied if the 'timeDilation' resource exists.
 */
export class PhysicsSystem extends System {
	readonly name = 'PhysicsSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 0;

	private physicsBodyQuery = new Query(['Transform', 'Collider']);

	execute(world: World, dt: number, _eventBus: EventBus): void {
		const adapter = world.getResource<PhysicsAdapter>('physicsAdapter');
		if (!adapter) return;

		// Apply time dilation to physics step
		const timeDilation = world.getResource<number>('timeDilation') ?? 1.0;
		const dilatedDt = dt * timeDilation;

		// Step the physics world
		adapter.step(dilatedDt);

		// Sync physics body positions back to Transform components
		const results = this.physicsBodyQuery.execute(world);
		for (const { entity } of results) {
			const bodyPos = adapter.getBodyPosition(entity);
			const bodyRot = adapter.getBodyRotation(entity);

			if (bodyPos || bodyRot) {
				const transform = world.getComponent<Transform>(entity, 'Transform');
				if (!transform) continue;

				world.addComponent(entity, 'Transform', {
					...transform,
					position: bodyPos ?? transform.position,
					rotation: bodyRot ?? transform.rotation
				});
			}
		}
	}
}
