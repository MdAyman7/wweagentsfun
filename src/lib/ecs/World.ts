import { EntityAllocator } from './Entity';
import { ComponentRegistry, type ComponentData, type ComponentStore } from './Component';
import { CommandBuffer } from './CommandBuffer';
import type { ComponentType, EntityId } from '../utils/types';

/**
 * The ECS World: the single source of truth for all simulation state.
 *
 * Contains:
 *  - Entity allocator (ID management)
 *  - Component registry (typed data stores)
 *  - Command buffer (deferred mutations)
 *  - Resource map (singleton data like match config, PRNG state)
 */
export class World {
	readonly entities: EntityAllocator;
	readonly components: ComponentRegistry;
	readonly commandBuffer: CommandBuffer;
	private resources: Map<string, unknown> = new Map();

	constructor() {
		this.entities = new EntityAllocator();
		this.components = new ComponentRegistry();
		this.commandBuffer = new CommandBuffer();
	}

	// ── Entity management ──

	createEntity(): EntityId {
		return this.entities.create();
	}

	destroyEntity(entity: EntityId): void {
		this.components.removeEntity(entity);
		this.entities.destroy(entity);
	}

	isAlive(entity: EntityId): boolean {
		return this.entities.isAlive(entity);
	}

	// ── Component management ──

	registerComponent<T extends ComponentData>(type: ComponentType): ComponentStore<T> {
		return this.components.register<T>(type);
	}

	addComponent<T extends ComponentData>(entity: EntityId, type: ComponentType, data: T): void {
		const store = this.components.register<T>(type);
		store.set(entity, data);
	}

	getComponent<T extends ComponentData>(entity: EntityId, type: ComponentType): T | undefined {
		const store = this.components.getStore<T>(type);
		return store?.get(entity);
	}

	hasComponent(entity: EntityId, type: ComponentType): boolean {
		const store = this.components.getStore(type);
		return store?.has(entity) ?? false;
	}

	removeComponent(entity: EntityId, type: ComponentType): void {
		const store = this.components.getStore(type);
		store?.remove(entity);
	}

	getComponentStore<T extends ComponentData>(type: ComponentType): ComponentStore<T> | undefined {
		return this.components.getStore<T>(type);
	}

	// ── Resources (singletons, not attached to entities) ──

	setResource<T>(key: string, value: T): void {
		this.resources.set(key, value);
	}

	getResource<T>(key: string): T | undefined {
		return this.resources.get(key) as T | undefined;
	}

	hasResource(key: string): boolean {
		return this.resources.has(key);
	}

	// ── Lifecycle ──

	/** Reset the entire world. */
	reset(): void {
		this.entities.reset();
		this.components.clear();
		this.commandBuffer.clear();
		this.resources.clear();
	}
}
