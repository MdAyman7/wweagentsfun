import type { World } from './World';
import type { ComponentType, EntityId } from '../utils/types';

/**
 * Serialized snapshot of the entire world state.
 * Used for replay, determinism verification, and network sync.
 */
export interface WorldSnapshot {
	frame: number;
	entityCount: number;
	components: Record<ComponentType, Array<{ entity: EntityId; data: unknown }>>;
	resources: Record<string, unknown>;
}

/**
 * World serializer / deserializer.
 * Converts the ECS world to a plain object for storage/transmission.
 */
export class WorldSerializer {
	/** Capture a full snapshot of the current world state. */
	static snapshot(world: World, frame: number): WorldSnapshot {
		const components: WorldSnapshot['components'] = {};

		for (const store of world.components.allStores()) {
			const entries: Array<{ entity: EntityId; data: unknown }> = [];
			for (const [entity, data] of store.entries()) {
				entries.push({ entity, data: structuredClone(data) });
			}
			if (entries.length > 0) {
				components[store.type] = entries;
			}
		}

		return {
			frame,
			entityCount: world.entities.count,
			components,
			resources: {} // TODO: serialize resources that opt-in to serialization
		};
	}

	/** Restore a world from a snapshot. Resets the world first. */
	static restore(world: World, snapshot: WorldSnapshot): void {
		world.reset();

		// Recreate entities (sequential IDs matching snapshot)
		for (let i = 0; i < snapshot.entityCount; i++) {
			world.createEntity();
		}

		// Restore component data
		for (const [type, entries] of Object.entries(snapshot.components)) {
			for (const { entity, data } of entries) {
				world.addComponent(entity, type, structuredClone(data) as any);
			}
		}
	}

	/** Encode snapshot as JSON string. */
	static toJSON(snapshot: WorldSnapshot): string {
		return JSON.stringify(snapshot);
	}

	/** Decode snapshot from JSON string. */
	static fromJSON(json: string): WorldSnapshot {
		return JSON.parse(json);
	}
}
