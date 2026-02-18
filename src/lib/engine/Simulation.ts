import { World } from '../ecs/World';
import { GameLoop, type GameLoopConfig } from './GameLoop';
import type { System } from '../ecs/System';
import { Logger } from '../utils/logger';

const log = Logger.create('Simulation');

/**
 * Headless simulation orchestrator.
 *
 * Runs the ECS world without any rendering — used for:
 * - RL training (thousands of matches at max speed)
 * - Server-side simulation
 * - Determinism verification
 * - Unit/integration testing
 */
export class Simulation {
	readonly gameLoop: GameLoop;

	constructor(config: Partial<GameLoopConfig> = {}) {
		const world = new World();
		this.gameLoop = new GameLoop(world, { ...config, headless: true });
	}

	get world(): World {
		return this.gameLoop.world;
	}

	get eventBus() {
		return this.gameLoop.eventBus;
	}

	get clock() {
		return this.gameLoop.clock;
	}

	/** Register a system with the scheduler. */
	addSystem(system: System): void {
		this.gameLoop.scheduler.register(system, this.world, this.eventBus);
	}

	/** Run up to maxTicks ticks. Returns number of ticks actually executed. */
	run(maxTicks: number, terminalCheck?: (world: World) => boolean): number {
		log.info('Simulation starting', { maxTicks, seed: this.clock.seed });
		const ticks = this.gameLoop.runHeadless(maxTicks, terminalCheck);
		log.info('Simulation complete', { ticksRun: ticks, finalFrame: this.clock.frame });
		return ticks;
	}

	/** Run a single tick (useful for step-by-step debugging). */
	step(): void {
		this.gameLoop.tick();
	}

	/** Reset the world and clock for a new episode. */
	reset(): void {
		this.world.reset();
		this.clock.reset();
		this.eventBus.reset();
	}
}
