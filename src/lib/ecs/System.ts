import type { Phase } from '../utils/types';
import type { World } from './World';
import type { EventBus } from '../engine/EventBus';

/**
 * Base class for all ECS systems.
 *
 * Systems contain logic. They read/write components via World,
 * emit events via EventBus, and defer mutations via CommandBuffer.
 *
 * Each system declares:
 *  - phase: when it runs in the tick
 *  - priority: order within its phase (lower = earlier)
 *  - execute(): the per-tick logic
 */
export abstract class System {
	abstract readonly name: string;
	abstract readonly phase: Phase;
	readonly priority: number = 0;

	/** Whether this system is enabled. Disabled systems are skipped. */
	enabled = true;

	/** Called once when the system is registered with the scheduler. */
	init(_world: World, _eventBus: EventBus): void {}

	/** Called every tick during this system's phase. */
	abstract execute(world: World, dt: number, eventBus: EventBus): void;

	/** Called when the system is removed or the world is destroyed. */
	destroy(_world: World): void {}
}
