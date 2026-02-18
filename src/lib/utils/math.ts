import type { Vec3, Quat } from './types';

/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Linear interpolation between a and b by t ∈ [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Remap a value from [inMin, inMax] to [outMin, outMax]. */
export function remap(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	const t = (value - inMin) / (inMax - inMin);
	return lerp(outMin, outMax, clamp(t, 0, 1));
}

// ── Vec3 operations ──

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
	return [v[0] * s, v[1] * s, v[2] * s];
}

export function vec3Length(v: Vec3): number {
	return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function vec3Normalize(v: Vec3): Vec3 {
	const len = vec3Length(v);
	if (len === 0) return [0, 0, 0];
	return [v[0] / len, v[1] / len, v[2] / len];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Distance(a: Vec3, b: Vec3): number {
	return vec3Length(vec3Sub(a, b));
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function vec3Zero(): Vec3 {
	return [0, 0, 0];
}

// ── Quaternion operations ──

export function quatIdentity(): Quat {
	return [0, 0, 0, 1];
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
	let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
	const target: Quat = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : [...b];
	dot = Math.abs(dot);

	if (dot > 0.9995) {
		// Linear interpolation for near-identical quaternions
		return [
			lerp(a[0], target[0], t),
			lerp(a[1], target[1], t),
			lerp(a[2], target[2], t),
			lerp(a[3], target[3], t)
		];
	}

	const theta = Math.acos(dot);
	const sinTheta = Math.sin(theta);
	const wa = Math.sin((1 - t) * theta) / sinTheta;
	const wb = Math.sin(t * theta) / sinTheta;

	return [
		a[0] * wa + target[0] * wb,
		a[1] * wa + target[1] * wb,
		a[2] * wa + target[2] * wb,
		a[3] * wa + target[3] * wb
	];
}
