import * as THREE from 'three';

export interface RingConfig {
	/** Platform radius in metres. Default 5. */
	radius: number;
	/** Platform thickness in metres. Default 0.3. */
	height: number;
}

const DEFAULT_RING: RingConfig = { radius: 3.5, height: 0.3 };

/**
 * Builds the battle arena platform — a bright hexagonal floating platform
 * with glowing edges and an under-glow disc.
 */
export class RingRenderer {
	readonly group: THREE.Group;
	private config: RingConfig;

	constructor(scene: THREE.Scene, config?: Partial<RingConfig>) {
		this.config = { ...DEFAULT_RING, ...config };
		this.group = new THREE.Group();
		this.group.name = 'ring';

		this.buildHexPlatform();
		this.buildPlatformEdge();
		this.buildUnderGlow();

		scene.add(this.group);
	}

	// ──────────────────────────── hex platform ────────────────────────────

	private buildHexPlatform(): void {
		const { radius, height } = this.config;

		// Canvas texture with ring mat pattern
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 512;
		const ctx = canvas.getContext('2d')!;

		// Base colour — dark ring mat
		ctx.fillStyle = '#141428';
		ctx.fillRect(0, 0, 512, 512);

		// Draw grid lines for WWE mat feel
		ctx.strokeStyle = '#222244';
		ctx.lineWidth = 0.5;
		const gridStep = 32;
		for (let x = 0; x < 512; x += gridStep) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, 512);
			ctx.stroke();
		}
		for (let y = 0; y < 512; y += gridStep) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(512, y);
			ctx.stroke();
		}

		// Centre circle accent (like a WWE ring logo area)
		ctx.strokeStyle = '#3355aa';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(256, 256, 100, 0, Math.PI * 2);
		ctx.stroke();

		// Inner accent circle
		ctx.strokeStyle = 'rgba(255, 50, 80, 0.3)';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(256, 256, 60, 0, Math.PI * 2);
		ctx.stroke();

		// "WWE AGENTS" text in center
		ctx.fillStyle = 'rgba(255, 60, 80, 0.25)';
		ctx.font = 'bold 36px "Impact", "Arial Black", sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('WWE AGENTS', 256, 256);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;

		// Square platform (4 radial segments = square, rotated 45° to align axes)
		const platGeo = new THREE.BoxGeometry(radius * 2, height, radius * 2);
		const platMat = new THREE.MeshStandardMaterial({
			map: texture,
			roughness: 0.35,
			metalness: 0.3,
			color: 0x141428
		});
		const platform = new THREE.Mesh(platGeo, platMat);
		platform.name = 'platform';
		platform.position.y = height / 2;
		platform.receiveShadow = true;
		platform.castShadow = true;
		this.group.add(platform);
	}

	// ──────────────────────────── edge glow ────────────────────────────

	private buildPlatformEdge(): void {
		const { radius, height } = this.config;

		// Slightly larger box underneath for edge glow effect
		const edgeGeo = new THREE.BoxGeometry(radius * 2 + 0.16, 0.08, radius * 2 + 0.16);
		const edgeMat = new THREE.MeshStandardMaterial({
			color: 0x4466cc,
			emissive: new THREE.Color(0x3355ff),
			emissiveIntensity: 0.7,
			transparent: true,
			opacity: 0.6,
			roughness: 0.3,
			metalness: 0.2
		});
		const edge = new THREE.Mesh(edgeGeo, edgeMat);
		edge.name = 'platform_edge';
		edge.position.y = 0.04; // just below platform surface
		this.group.add(edge);
	}

	// ──────────────────────────── under-glow ────────────────────────────

	private buildUnderGlow(): void {
		// Soft glow disc beneath the floating platform
		const glowGeo = new THREE.CircleGeometry(8, 32);
		const glowMat = new THREE.MeshBasicMaterial({
			color: 0x2244aa,
			transparent: true,
			opacity: 0.25,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		const glow = new THREE.Mesh(glowGeo, glowMat);
		glow.rotation.x = -Math.PI / 2;
		glow.position.y = -0.5;
		glow.name = 'under_glow';
		this.group.add(glow);
	}

	// ──────────────────────────── cleanup ────────────────────────────

	dispose(): void {
		this.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => {
						if (m.map) m.map.dispose();
						m.dispose();
					});
				} else {
					const m = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
					if ('map' in m && m.map) m.map.dispose();
					m.dispose();
				}
			}
		});
		this.group.parent?.remove(this.group);
	}
}
