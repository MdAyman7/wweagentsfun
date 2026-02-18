import type { ComponentType, EntityId } from '../utils/types';

/**
 * Base interface all components must satisfy.
 * Components are pure data — no methods, no logic.
 */
export interface ComponentData {
	readonly _type: ComponentType;
}

/**
 * Component store: maps EntityId → component data for a single component type.
 * Backed by a Map for O(1) access. Can be swapped for TypedArray SoA later.
 */
export class ComponentStore<T extends ComponentData> {
	readonly type: ComponentType;
	private data: Map<EntityId, T> = new Map();
	private changed: Set<EntityId> = new Set();

	constructor(type: ComponentType) {
		this.type = type;
	}

	set(entity: EntityId, component: T): void {
		this.data.set(entity, component);
		this.changed.add(entity);
	}

	get(entity: EntityId): T | undefined {
		return this.data.get(entity);
	}

	has(entity: EntityId): boolean {
		return this.data.has(entity);
	}

	remove(entity: EntityId): boolean {
		this.changed.delete(entity);
		return this.data.delete(entity);
	}

	/** All entities that have this component. */
	entities(): IterableIterator<EntityId> {
		return this.data.keys();
	}

	/** All (entity, data) pairs. */
	entries(): IterableIterator<[EntityId, T]> {
		return this.data.entries();
	}

	/** Entities modified since last clearChanged(). */
	getChanged(): ReadonlySet<EntityId> {
		return this.changed;
	}

	clearChanged(): void {
		this.changed.clear();
	}

	get size(): number {
		return this.data.size;
	}

	clear(): void {
		this.data.clear();
		this.changed.clear();
	}
}

/**
 * Registry of all component types. Prevents duplicate registration.
 */
export class ComponentRegistry {
	private stores: Map<ComponentType, ComponentStore<any>> = new Map();

	register<T extends ComponentData>(type: ComponentType): ComponentStore<T> {
		if (this.stores.has(type)) {
			return this.stores.get(type)! as ComponentStore<T>;
		}
		const store = new ComponentStore<T>(type);
		this.stores.set(type, store);
		return store;
	}

	getStore<T extends ComponentData>(type: ComponentType): ComponentStore<T> | undefined {
		return this.stores.get(type) as ComponentStore<T> | undefined;
	}

	hasStore(type: ComponentType): boolean {
		return this.stores.has(type);
	}

	allStores(): IterableIterator<ComponentStore<any>> {
		return this.stores.values();
	}

	/** Remove all component data for a specific entity across all stores. */
	removeEntity(entity: EntityId): void {
		for (const store of this.stores.values()) {
			store.remove(entity);
		}
	}

	clear(): void {
		for (const store of this.stores.values()) {
			store.clear();
		}
	}
}
