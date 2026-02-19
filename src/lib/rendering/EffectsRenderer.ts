import * as THREE from 'three';
import type { Vec3 } from '../utils/types';

/**
 * Effect type identifiers — names match the director system's DirectorEffectType.
 * Visual output is energy/sci-fi themed (cyan bursts, electric sparks, shield pops).
 */
export type EffectType = 'impact' | 'sweat' | 'dust' | 'flash' | 'sparks' | 'blood';

interface ActiveEffect {
	mesh: THREE.Points;
	/** Remaining time-to-live in seconds. */
	ttl: number;
	/** Max lifetime (used for fade calculation). */
	maxTtl: number;
	type: EffectType;
	/** Per-particle velocity vectors (flat xyz triples). */
	velocities: Float32Array;
}

/** How many particles to spawn per effect type. */
const PARTICLE_COUNTS: Record<EffectType, number> = {
	impact: 60,
	sweat: 10,
	dust: 25,
	flash: 1,
	sparks: 40,
	blood: 30
};

/** Effect lifetimes in seconds. */
const TTL: Record<EffectType, number> = {
	impact: 0.6,
	sweat: 0.8,
	dust: 0.8,
	flash: 0.18,
	sparks: 0.5,
	blood: 0.7
};

/**
 * Manages energy-based particle effects for the battle bot arena.
 *
 * Visual mapping:
 *   impact → Cyan energy burst (no gravity, spherical drift)
 *   sparks → Yellow-white electric sparks (half gravity, fast)
 *   flash  → Blue-white shield pop (single bright sprite)
 *   dust   → Blue energy aura (no gravity, gentle drift)
 *   sweat  → Green heal sparkles (gentle upward drift)
 *
 * All effects use AdditiveBlending for an energy/sci-fi feel.
 */
export class EffectsRenderer {
	private activeEffects: ActiveEffect[] = [];

	constructor(private scene: THREE.Scene) {}

	/**
	 * Spawn a new particle effect at the given world position.
	 * @param type    The effect category.
	 * @param position  World-space spawn point.
	 * @param intensity Multiplier for spread / size (1 = default).
	 */
	spawnEffect(type: EffectType, position: Vec3, intensity: number = 1): void {
		const count = PARTICLE_COUNTS[type];
		const ttl = TTL[type];

		const positions = new Float32Array(count * 3);
		const velocities = new Float32Array(count * 3);

		for (let i = 0; i < count; i++) {
			const i3 = i * 3;
			// All particles start at the spawn point
			positions[i3] = position[0];
			positions[i3 + 1] = position[1];
			positions[i3 + 2] = position[2];

			switch (type) {
				case 'impact': {
					// Cyan energy burst — spherical, no gravity, gentle drift
					const theta = Math.random() * Math.PI * 2;
					const phi = Math.acos(2 * Math.random() - 1);
					const speed = (1.5 + Math.random() * 3.5) * intensity;
					velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
					velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
					velocities[i3 + 2] = Math.cos(phi) * speed;
					break;
				}
				case 'sweat': {
					// Green heal sparkles — gentle upward drift with wander
					const angle = Math.random() * Math.PI * 2;
					const wander = 0.3 * intensity;
					velocities[i3] = Math.cos(angle) * wander;
					velocities[i3 + 1] = 0.5 + Math.random() * 1.0;
					velocities[i3 + 2] = Math.sin(angle) * wander;
					break;
				}
				case 'dust': {
					// Blue energy aura — gentle radial drift, no gravity
					const a = Math.random() * Math.PI * 2;
					const r = (0.5 + Math.random() * 1.0) * intensity;
					velocities[i3] = Math.cos(a) * r;
					velocities[i3 + 1] = (Math.random() - 0.5) * 0.6;
					velocities[i3 + 2] = Math.sin(a) * r;
					break;
				}
				case 'flash': {
					// Single bright shield pop — no velocity
					velocities[i3] = 0;
					velocities[i3 + 1] = 0;
					velocities[i3 + 2] = 0;
					break;
				}
				case 'sparks': {
					// Yellow-white electric sparks — fast, upward-biased
					const sa = Math.random() * Math.PI * 2;
					const sSpeed = (3 + Math.random() * 5) * intensity;
					velocities[i3] = Math.cos(sa) * sSpeed;
					velocities[i3 + 1] = 1.5 + Math.random() * 3;
					velocities[i3 + 2] = Math.sin(sa) * sSpeed;
					break;
				}
				case 'blood': {
					// Red blood/oil splatter — gravity-affected, outward burst
					const ba = Math.random() * Math.PI * 2;
					const bSpeed = (2 + Math.random() * 4) * intensity;
					velocities[i3] = Math.cos(ba) * bSpeed;
					velocities[i3 + 1] = 1.0 + Math.random() * 2.5;
					velocities[i3 + 2] = Math.sin(ba) * bSpeed;
					break;
				}
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		const colorMap: Record<EffectType, THREE.Color> = {
			impact: new THREE.Color(0x66ccff),
			sweat: new THREE.Color(0x44ff88),
			dust: new THREE.Color(0x88aaff),
			flash: new THREE.Color(0x88ccff),
			sparks: new THREE.Color(0xffdd55),
			blood: new THREE.Color(0xff2222)
		};

		const sizeMap: Record<EffectType, number> = {
			impact: 0.12 * intensity,
			sweat: 0.08 * intensity,
			dust: 0.10 * intensity,
			flash: 2.5 * intensity,
			sparks: 0.09 * intensity,
			blood: 0.10 * intensity
		};

		const material = new THREE.PointsMaterial({
			color: colorMap[type],
			size: sizeMap[type],
			transparent: true,
			opacity: 1.0,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			sizeAttenuation: true
		});

		const points = new THREE.Points(geometry, material);
		points.name = `effect_${type}`;
		this.scene.add(points);

		this.activeEffects.push({
			mesh: points,
			ttl,
			maxTtl: ttl,
			type,
			velocities
		});
	}

	/**
	 * Advance all active effects. Call once per render frame.
	 * @param dt Delta time in seconds.
	 */
	update(dt: number): void {
		const halfGravity = -4.9; // half gravity for floatier feel
		let i = this.activeEffects.length;

		while (i--) {
			const fx = this.activeEffects[i];
			fx.ttl -= dt;

			if (fx.ttl <= 0) {
				// Expired — remove and free GPU resources
				this.scene.remove(fx.mesh);
				fx.mesh.geometry.dispose();
				(fx.mesh.material as THREE.PointsMaterial).dispose();
				this.activeEffects.splice(i, 1);
				continue;
			}

			// Update per-particle positions
			const posAttr = fx.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
			const pos = posAttr.array as Float32Array;
			const vel = fx.velocities;

			for (let p = 0; p < pos.length; p += 3) {
				// Apply half gravity to sparks and blood; others float freely
				if (fx.type === 'sparks' || fx.type === 'blood') {
					vel[p + 1] += halfGravity * dt;
				}
				pos[p] += vel[p] * dt;
				pos[p + 1] += vel[p + 1] * dt;
				pos[p + 2] += vel[p + 2] * dt;
			}
			posAttr.needsUpdate = true;

			// Fade opacity based on remaining life
			const lifeRatio = fx.ttl / fx.maxTtl;
			(fx.mesh.material as THREE.PointsMaterial).opacity = lifeRatio;
		}
	}

	/**
	 * Immediately remove all active effects and free resources.
	 */
	dispose(): void {
		for (const fx of this.activeEffects) {
			this.scene.remove(fx.mesh);
			fx.mesh.geometry.dispose();
			(fx.mesh.material as THREE.PointsMaterial).dispose();
		}
		this.activeEffects.length = 0;
	}
}
