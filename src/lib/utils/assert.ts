/**
 * Dev-mode invariant assertions. Stripped in production builds via tree-shaking.
 */

const DEV = import.meta.env?.DEV ?? true;

/** Assert a condition is true. Throws in dev, no-op in prod. */
export function assert(condition: boolean, message: string): asserts condition {
	if (DEV && !condition) {
		throw new Error(`[Assertion Failed] ${message}`);
	}
}

/** Assert a value is not null/undefined. */
export function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
	if (DEV && (value === null || value === undefined)) {
		throw new Error(`[Assertion Failed] Expected ${name} to be defined`);
	}
}

/** Assert unreachable code path (exhaustive switch checks). */
export function unreachable(value: never, message?: string): never {
	throw new Error(message ?? `Unreachable: unexpected value ${value}`);
}
