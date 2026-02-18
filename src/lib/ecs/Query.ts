import type { ComponentData, ComponentStore } from './Component';
import type { ComponentType, EntityId } from '../utils/types';
import type { World } from './World';

/**
 * Query result: an entity and its matched component data.
 */
export interface QueryResult {
	entity: EntityId;
	components: Map<ComponentType, ComponentData>;
}

/**
 * Archetype-based query. Caches results and invalidates on component changes.
 *
 * Usage:
 *   const q = new Query(['Transform', 'Health', 'CombatState']);
 *   for (const { entity, components } of q.execute(world)) { ... }
 */
export class Query {
	readonly required: readonly ComponentType[];
	readonly excluded: readonly ComponentType[];
	private cachedResults: QueryResult[] | null = null;

	constructor(required: ComponentType[], excluded: ComponentType[] = []) {
		this.required = Object.freeze([...required]);
		this.excluded = Object.freeze([...excluded]);
	}

	/** Execute the query against a world. Returns matching entities + their components. */
	execute(world: World): QueryResult[] {
		// TODO: add proper change-detection caching
		return this.computeResults(world);
	}

	private computeResults(world: World): QueryResult[] {
		const results: QueryResult[] = [];

		// Find the smallest required store (narrow the search space)
		let smallest: ComponentStore<any> | null = null;
		let smallestSize = Infinity;
		const stores: ComponentStore<any>[] = [];

		for (const type of this.required) {
			const store = world.getComponentStore(type);
			if (!store) return []; // Required component type not registered → no results
			stores.push(store);
			if (store.size < smallestSize) {
				smallestSize = store.size;
				smallest = store;
			}
		}

		if (!smallest) return [];

		// Gather excluded stores
		const excludedStores: ComponentStore<any>[] = [];
		for (const type of this.excluded) {
			const store = world.getComponentStore(type);
			if (store) excludedStores.push(store);
		}

		// Iterate the smallest store, check membership in all others
		for (const entity of smallest.entities()) {
			let match = true;

			// Check all required
			for (const store of stores) {
				if (!store.has(entity)) {
					match = false;
					break;
				}
			}
			if (!match) continue;

			// Check exclusions
			for (const store of excludedStores) {
				if (store.has(entity)) {
					match = false;
					break;
				}
			}
			if (!match) continue;

			// Build component map
			const components = new Map<ComponentType, ComponentData>();
			for (const store of stores) {
				components.set(store.type, store.get(entity)!);
			}
			results.push({ entity, components });
		}

		return results;
	}

	invalidateCache(): void {
		this.cachedResults = null;
	}
}
