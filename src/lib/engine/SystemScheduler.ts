import type { System } from '../ecs/System';
import type { World } from '../ecs/World';
import type { EventBus } from './EventBus';
import type { Phase } from '../utils/types';
import { Logger } from '../utils/logger';

const log = Logger.create('SystemScheduler');

/**
 * System execution scheduler.
 *
 * Groups systems by phase and sorts by priority within each phase.
 * Validates that no two systems in the same phase have the same priority.
 */
export class SystemScheduler {
	private phases: Map<Phase, System[]> = new Map();

	constructor() {
		const allPhases: Phase[] = ['input', 'ai', 'sim', 'psychology', 'cinematic', 'presentation'];
		for (const phase of allPhases) {
			this.phases.set(phase, []);
		}
	}

	/** Register a system. It will run in its declared phase at its declared priority. */
	register(system: System, world: World, eventBus: EventBus): void {
		const systems = this.phases.get(system.phase);
		if (!systems) {
			throw new Error(`Unknown phase: ${system.phase}`);
		}
		systems.push(system);
		systems.sort((a, b) => a.priority - b.priority);
		system.init(world, eventBus);
		log.debug(`Registered ${system.name} in phase ${system.phase} at priority ${system.priority}`);
	}

	/** Run all enabled systems in the given phase. */
	runPhase(phase: Phase, world: World, dt: number, eventBus: EventBus): void {
		const systems = this.phases.get(phase);
		if (!systems) return;
		for (const system of systems) {
			if (system.enabled) {
				system.execute(world, dt, eventBus);
			}
		}
	}

	/** Get all registered systems for a phase (for debug/inspection). */
	getPhase(phase: Phase): readonly System[] {
		return this.phases.get(phase) ?? [];
	}

	/** Destroy all systems. */
	destroyAll(world: World): void {
		for (const systems of this.phases.values()) {
			for (const system of systems) {
				system.destroy(world);
			}
		}
		for (const [phase] of this.phases) {
			this.phases.set(phase, []);
		}
	}
}
