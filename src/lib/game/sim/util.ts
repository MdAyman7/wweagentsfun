export function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** 0..1 fraction of a stat on the 0..99 scale. */
export function statFrac(v: number): number {
	return clamp01(v / 99);
}
