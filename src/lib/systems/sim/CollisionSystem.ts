import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, Vec3 } from '../../utils/types';
import type { Transform } from '../../components/spatial/Transform';

/**
 * Contact pair from the physics adapter.
 */
interface ContactPair {
	entityA: EntityId;
	entityB: EntityId;
	point: Vec3;
	normal: Vec3;
	force: number;
}

/**
 * Physics adapter interface (subset needed by this system).
 */
interface PhysicsAdapter {
	getContacts(): ContactPair[];
}

/**
 * Ring boundary configuration.
 */
interface RingBounds {
	centerX: number;
	centerZ: number;
	halfSize: number;
}

/**
 * CollisionSystem
 *
 * Reads collision/contact pairs from the physics adapter and translates
 * them into ECS events. Also performs ring boundary checks to detect
 * when wrestlers exit the ring (for countout / ringside spots).
 *
 * This system does not resolve collisions itself -- that is the physics
 * engine's job. It only reads the results and emits events for other
 * systems to react to.
 */
export class CollisionSystem extends System {
	readonly name = 'CollisionSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 5;

	/** Default ring bounds: 20x20 ring centered at origin. */
	private static readonly DEFAULT_RING_BOUNDS: RingBounds = {
		centerX: 0,
		centerZ: 0,
		halfSize: 10
	};

	execute(world: World, _dt: number, eventBus: EventBus): void {
		const adapter = world.getResource<PhysicsAdapter>('physicsAdapter');
		if (!adapter) return;

		// Emit collision events for all contact pairs
		const contacts = adapter.getContacts();
		for (const contact of contacts) {
			eventBus.emit('physics:collision', {
				entityA: contact.entityA,
				entityB: contact.entityB,
				point: contact.point,
				normal: contact.normal,
				force: contact.force
			});
		}

		// Check ring boundary exits
		const ringBounds = world.getResource<RingBounds>('ringBounds')
			?? CollisionSystem.DEFAULT_RING_BOUNDS;

		const transformStore = world.getComponentStore<Transform>('Transform');
		if (!transformStore) return;

		for (const [entity, transform] of transformStore.entries()) {
			const x = transform.position[0];
			const z = transform.position[2];

			const relX = x - ringBounds.centerX;
			const relZ = z - ringBounds.centerZ;
			const hs = ringBounds.halfSize;

			// Determine which side the entity exited from, if any
			if (relX > hs) {
				eventBus.emit('physics:ring_exit', { entity, side: 'east' });
			} else if (relX < -hs) {
				eventBus.emit('physics:ring_exit', { entity, side: 'west' });
			} else if (relZ > hs) {
				eventBus.emit('physics:ring_exit', { entity, side: 'south' });
			} else if (relZ < -hs) {
				eventBus.emit('physics:ring_exit', { entity, side: 'north' });
			}
		}
	}
}
