export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
};

/**
 * Tagged structured logger with level filtering.
 * Each system/module creates its own tagged logger.
 *
 * Usage:
 *   const log = Logger.create('CombatSystem');
 *   log.info('Move hit', { attacker: 1, defender: 2, damage: 15 });
 */
export class Logger {
	private static globalLevel: LogLevel = 'info';
	private static tagFilters: Set<string> | null = null;

	private constructor(private tag: string) {}

	static create(tag: string): Logger {
		return new Logger(tag);
	}

	static setLevel(level: LogLevel): void {
		Logger.globalLevel = level;
	}

	/** Only show logs from these tags. Pass null to show all. */
	static setTagFilter(tags: string[] | null): void {
		Logger.tagFilters = tags ? new Set(tags) : null;
	}

	debug(message: string, data?: Record<string, unknown>): void {
		this.log('debug', message, data);
	}

	info(message: string, data?: Record<string, unknown>): void {
		this.log('info', message, data);
	}

	warn(message: string, data?: Record<string, unknown>): void {
		this.log('warn', message, data);
	}

	error(message: string, data?: Record<string, unknown>): void {
		this.log('error', message, data);
	}

	private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
		if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[Logger.globalLevel]) return;
		if (Logger.tagFilters && !Logger.tagFilters.has(this.tag)) return;

		const entry = {
			ts: performance.now().toFixed(1),
			tag: this.tag,
			msg: message,
			...(data ?? {})
		};

		switch (level) {
			case 'debug':
				console.debug(`[${this.tag}]`, message, data ?? '');
				break;
			case 'info':
				console.info(`[${this.tag}]`, message, data ?? '');
				break;
			case 'warn':
				console.warn(`[${this.tag}]`, message, data ?? '');
				break;
			case 'error':
				console.error(`[${this.tag}]`, message, entry);
				break;
		}
	}
}
