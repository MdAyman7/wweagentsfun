import type { EntityId } from '../utils/types';

/**
 * Entity ID allocator with recycling.
 * Entities are just IDs — all data lives in component stores.
 * Generation counter prevents stale ID references.
 */
export class EntityAllocator {
	private nextId: EntityId = 0;
	private recycled: EntityId[] = [];
	private generations: Map<EntityId, number> = new Map();

	/** Allocate a new entity ID (or recycle a destroyed one). */
	create(): EntityId {
		const id = this.recycled.length > 0 ? this.recycled.pop()! : this.nextId++;
		this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
		return id;
	}

	/** Release an entity ID for recycling. */
	destroy(id: EntityId): void {
		this.recycled.push(id);
	}

	/** Get the generation of an entity (for stale reference detection). */
	generation(id: EntityId): number {
		return this.generations.get(id) ?? 0;
	}

	/** Check if an entity ID is currently allocated (not recycled). */
	isAlive(id: EntityId): boolean {
		return this.generations.has(id) && !this.recycled.includes(id);
	}

	/** Total number of entities ever created. */
	get count(): number {
		return this.nextId - this.recycled.length;
	}

	reset(): void {
		this.nextId = 0;
		this.recycled.length = 0;
		this.generations.clear();
	}
}
