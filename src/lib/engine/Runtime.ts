import { World } from '../ecs/World';
import { GameLoop, type GameLoopConfig } from './GameLoop';
import type { System } from '../ecs/System';
import { Logger } from '../utils/logger';

const log = Logger.create('Runtime');

/**
 * Browser runtime orchestrator.
 *
 * Wraps the GameLoop with rendering concerns:
 * - Connects to Svelte store sync
 * - Manages THREE.js render calls
 * - Handles browser lifecycle (visibility, focus)
 */
export class Runtime {
	readonly gameLoop: GameLoop;

	/** Set externally: called once per frame for store synchronization. */
	onSync: ((world: World, frame: number) => void) | null = null;

	/** Set externally: called with alpha for interpolated rendering. */
	onRender: ((alpha: number) => void) | null = null;

	constructor(config: Partial<GameLoopConfig> = {}) {
		const world = new World();
		this.gameLoop = new GameLoop(world, { ...config, headless: false });

		this.gameLoop.onTickComplete = (world, frame) => {
			this.onSync?.(world, frame);
		};

		this.gameLoop.onInterpolate = (alpha) => {
			this.onRender?.(alpha);
		};
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

	start(): void {
		log.info('Runtime starting');
		this.gameLoop.start();
	}

	stop(): void {
		log.info('Runtime stopping');
		this.gameLoop.stop();
	}

	/** Pause when tab loses visibility (saves CPU). */
	handleVisibilityChange(hidden: boolean): void {
		if (hidden) {
			this.gameLoop.stop();
			log.debug('Paused (tab hidden)');
		} else {
			this.gameLoop.start();
			log.debug('Resumed (tab visible)');
		}
	}

	set speed(s: number) {
		this.gameLoop.speed = s;
	}
}
