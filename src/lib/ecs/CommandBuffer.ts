import type { ComponentData } from './Component';
import type { ComponentType, EntityId } from '../utils/types';
import type { World } from './World';

/** Types of deferred mutations. */
type Command =
	| { kind: 'create_entity'; callback: (id: EntityId) => void }
	| { kind: 'destroy_entity'; entity: EntityId }
	| { kind: 'add_component'; entity: EntityId; type: ComponentType; data: ComponentData }
	| { kind: 'remove_component'; entity: EntityId; type: ComponentType }
	| { kind: 'update_component'; entity: EntityId; type: ComponentType; updater: (data: ComponentData) => ComponentData };

/**
 * Deferred mutation buffer.
 *
 * Systems should never directly create/destroy entities or add/remove components
 * during execution — doing so would invalidate other systems' queries mid-tick.
 *
 * Instead, systems push commands here. The GameLoop flushes the buffer
 * between phases, applying all mutations atomically.
 */
export class CommandBuffer {
	private commands: Command[] = [];

	/** Schedule entity creation. The callback receives the new EntityId after flush. */
	createEntity(callback: (id: EntityId) => void = () => {}): void {
		this.commands.push({ kind: 'create_entity', callback });
	}

	/** Schedule entity destruction (removes all components + recycles ID). */
	destroyEntity(entity: EntityId): void {
		this.commands.push({ kind: 'destroy_entity', entity });
	}

	/** Schedule adding a component to an entity. */
	addComponent<T extends ComponentData>(entity: EntityId, type: ComponentType, data: T): void {
		this.commands.push({ kind: 'add_component', entity, type, data });
	}

	/** Schedule removing a component from an entity. */
	removeComponent(entity: EntityId, type: ComponentType): void {
		this.commands.push({ kind: 'remove_component', entity, type });
	}

	/** Schedule a component data update via a pure function. */
	updateComponent<T extends ComponentData>(
		entity: EntityId,
		type: ComponentType,
		updater: (data: T) => T
	): void {
		this.commands.push({
			kind: 'update_component',
			entity,
			type,
			updater: updater as unknown as (data: ComponentData) => ComponentData
		});
	}

	/** Apply all queued commands to the world. Called by GameLoop between phases. */
	flush(world: World): void {
		for (const cmd of this.commands) {
			switch (cmd.kind) {
				case 'create_entity': {
					const id = world.createEntity();
					cmd.callback(id);
					break;
				}
				case 'destroy_entity':
					world.destroyEntity(cmd.entity);
					break;
				case 'add_component':
					world.addComponent(cmd.entity, cmd.type, cmd.data);
					break;
				case 'remove_component':
					world.removeComponent(cmd.entity, cmd.type);
					break;
				case 'update_component': {
					const current = world.getComponent(cmd.entity, cmd.type);
					if (current) {
						const updated = cmd.updater(current);
						world.addComponent(cmd.entity, cmd.type, updated);
					}
					break;
				}
			}
		}
		this.commands.length = 0;
	}

	get pending(): number {
		return this.commands.length;
	}

	clear(): void {
		this.commands.length = 0;
	}
}
