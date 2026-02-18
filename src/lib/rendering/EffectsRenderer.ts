import * as THREE from 'three';
import type { Vec3 } from '../utils/types';

/** Effect type identifiers matching VFXRequest component. */
export type EffectType = 'impact' | 'sweat' | 'dust' | 'flash' | 'sparks';

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
	impact: 30,
	sweat: 8,
	dust: 20,
	flash: 1,
	sparks: 16
};

/** Effect lifetimes in seconds. */
const TTL: Record<EffectType, number> = {
	impact: 0.4,
	sweat: 0.5,
	dust: 0.8,
	flash: 0.15,
	sparks: 0.35
};

/**
 * Manages short-lived particle effects for hits, sweat, dust clouds,
 * flashes, and sparks. Each spawn creates a THREE.Points object that
 * is automatically updated and removed after its TTL expires.
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

			// Per-type velocity spread
			switch (type) {
				case 'impact': {
					// Burst outward in a sphere
					const theta = Math.random() * Math.PI * 2;
					const phi = Math.acos(2 * Math.random() - 1);
					const speed = (1.5 + Math.random() * 3) * intensity;
					velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
					velocities[i3 + 1] = Math.abs(Math.sin(phi) * Math.sin(theta)) * speed;
					velocities[i3 + 2] = Math.cos(phi) * speed;
					break;
				}
				case 'sweat': {
					// A few droplets arcing outward
					const angle = Math.random() * Math.PI * 2;
					const sp = (1 + Math.random() * 2) * intensity;
					velocities[i3] = Math.cos(angle) * sp;
					velocities[i3 + 1] = 2 + Math.random() * 2;
					velocities[i3 + 2] = Math.sin(angle) * sp;
					break;
				}
				case 'dust': {
					// Low expanding cloud near feet
					const a = Math.random() * Math.PI * 2;
					const r = (0.5 + Math.random()) * intensity;
					velocities[i3] = Math.cos(a) * r;
					velocities[i3 + 1] = 0.3 + Math.random() * 0.5;
					velocities[i3 + 2] = Math.sin(a) * r;
					break;
				}
				case 'flash': {
					// Single bright sprite, no real velocity
					velocities[i3] = 0;
					velocities[i3 + 1] = 0;
					velocities[i3 + 2] = 0;
					break;
				}
				case 'sparks': {
					// Fast directional sparks
					const sa = Math.random() * Math.PI * 2;
					const sSpeed = (3 + Math.random() * 5) * intensity;
					velocities[i3] = Math.cos(sa) * sSpeed;
					velocities[i3 + 1] = 1 + Math.random() * 3;
					velocities[i3 + 2] = Math.sin(sa) * sSpeed;
					break;
				}
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		const colorMap: Record<EffectType, THREE.Color> = {
			impact: new THREE.Color(0xffffff),
			sweat: new THREE.Color(0x88ccff),
			dust: new THREE.Color(0xaa9977),
			flash: new THREE.Color(0xffffcc),
			sparks: new THREE.Color(0xffaa33)
		};

		const sizeMap: Record<EffectType, number> = {
			impact: 0.06 * intensity,
			sweat: 0.04 * intensity,
			dust: 0.12 * intensity,
			flash: 1.5 * intensity,
			sparks: 0.05 * intensity
		};

		const material = new THREE.PointsMaterial({
			color: colorMap[type],
			size: sizeMap[type],
			transparent: true,
			opacity: 1.0,
			depthWrite: false,
			blending: type === 'flash' ? THREE.AdditiveBlending : THREE.NormalBlending,
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
		const gravity = -9.81;
		let i = this.activeEffects.length;

		while (i--) {
			const fx = this.activeEffects[i];
			fx.ttl -= dt;

			if (fx.ttl <= 0) {
				// Expired -- remove from scene and free GPU resources
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
				// Apply gravity to Y velocity (except flash / dust)
				if (fx.type !== 'flash' && fx.type !== 'dust') {
					vel[p + 1] += gravity * dt;
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
