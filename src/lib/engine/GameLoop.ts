import type { World } from '../ecs/World';
import type { Phase, Seed } from '../utils/types';
import { Clock } from './Clock';
import { EventBus } from './EventBus';
import { SystemScheduler } from './SystemScheduler';
import { Logger } from '../utils/logger';

const log = Logger.create('GameLoop');

export interface GameLoopConfig {
	tickRate: number;
	maxTicksPerFrame: number;
	headless: boolean;
	seed: Seed;
}

const DEFAULT_CONFIG: GameLoopConfig = {
	tickRate: 60,
	maxTicksPerFrame: 4,
	headless: false,
	seed: 42
};

/**
 * Fixed-timestep game loop.
 *
 * Browser mode: uses requestAnimationFrame with accumulator + interpolation.
 * Headless mode: runs ticks synchronously at max speed (for RL training).
 *
 * Every tick is identical regardless of mode — determinism guaranteed.
 */
export class GameLoop {
	readonly clock: Clock;
	readonly eventBus: EventBus;
	readonly scheduler: SystemScheduler;
	readonly world: World;

	private readonly tickMs: number;
	private readonly maxTicksPerFrame: number;
	private readonly headless: boolean;

	private accumulator = 0;
	private lastTimestamp = 0;
	private running = false;
	private _speed = 1.0;
	private rafId: number | null = null;

	/** Called at end of each tick. Set externally to sync stores, record frames, etc. */
	onTickComplete: ((world: World, frame: number) => void) | null = null;

	/** Called with interpolation alpha for smooth rendering. */
	onInterpolate: ((alpha: number) => void) | null = null;

	constructor(world: World, config: Partial<GameLoopConfig> = {}) {
		const cfg = { ...DEFAULT_CONFIG, ...config };
		this.world = world;
		this.tickMs = 1000 / cfg.tickRate;
		this.maxTicksPerFrame = cfg.maxTicksPerFrame;
		this.headless = cfg.headless;
		this.clock = new Clock(cfg.seed, cfg.tickRate);
		this.eventBus = new EventBus();
		this.scheduler = new SystemScheduler();
	}

	/** Execute one deterministic tick. */
	tick(): void {
		this.eventBus.setFrame(this.clock.frame);

		const phases: Phase[] = ['input', 'ai', 'sim', 'psychology', 'cinematic'];
		if (!this.headless) {
			phases.push('presentation');
		}

		for (const phase of phases) {
			this.eventBus.emit('system:phase_change', { phase });
			this.scheduler.runPhase(phase, this.world, this.clock.deltaTime, this.eventBus);
			this.world.commandBuffer.flush(this.world);
			this.eventBus.flush();
		}

		this.onTickComplete?.(this.world, this.clock.frame);
		this.clock.advance();
	}

	/** Browser frame callback (requestAnimationFrame). */
	private frame = (timestamp: number): void => {
		if (!this.running) return;

		const rawDelta = Math.min(timestamp - this.lastTimestamp, 200);
		this.lastTimestamp = timestamp;
		this.accumulator += rawDelta * this._speed;

		let ticksThisFrame = 0;
		while (this.accumulator >= this.tickMs && ticksThisFrame < this.maxTicksPerFrame) {
			this.tick();
			this.accumulator -= this.tickMs;
			ticksThisFrame++;
		}

		if (!this.headless) {
			const alpha = this.accumulator / this.tickMs;
			this.onInterpolate?.(alpha);
		}

		this.rafId = requestAnimationFrame(this.frame);
	};

	/** Start the game loop (browser mode with rAF). */
	start(): void {
		if (this.running) return;
		this.running = true;
		this.lastTimestamp = performance.now();
		this.rafId = requestAnimationFrame(this.frame);
		log.info('Game loop started', { headless: this.headless, seed: this.clock.seed });
	}

	/** Stop the game loop. */
	stop(): void {
		this.running = false;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		log.info('Game loop stopped', { frame: this.clock.frame });
	}

	/** Run N ticks synchronously (headless / training mode). */
	runHeadless(maxTicks: number, terminalCheck?: (world: World) => boolean): number {
		let ticksRun = 0;
		for (let i = 0; i < maxTicks; i++) {
			this.tick();
			ticksRun++;
			if (terminalCheck?.(this.world)) break;
		}
		return ticksRun;
	}

	get speed(): number {
		return this._speed;
	}

	set speed(s: number) {
		this._speed = Math.max(0.1, Math.min(8, s));
	}

	get isRunning(): boolean {
		return this.running;
	}
}
