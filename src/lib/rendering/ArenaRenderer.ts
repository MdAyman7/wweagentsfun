import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Builds the arena environment around the ring: walls/dome, crowd,
 * barricades, titantron, entrance ramp, and arena lighting.
 *
 * Performance optimisations:
 *   - Crowd uses InstancedMesh (240 instances, 1 draw call)
 *   - Barricade segments merged into single geometry (4 → 1 draw call)
 *   - Only wrestlers + ring cast/receive shadows
 *   - Arena spotlight shadow maps reduced to 512×512
 */
export class ArenaRenderer {
	private group: THREE.Group;
	private spotlights: THREE.SpotLight[] = [];

	constructor(private scene: THREE.Scene) {
		this.group = new THREE.Group();
		this.group.name = 'arena';

		this.buildWalls();
		this.buildCrowd();
		this.buildBarricade();
		this.buildEntranceRamp();
		this.buildTitantron();
		this.buildArenaLighting();

		scene.add(this.group);
	}

	// ──────────────────────────── walls / dome ────────────────────────────

	private buildWalls(): void {
		// Large inverted box as the arena enclosure
		const wallGeo = new THREE.BoxGeometry(60, 25, 60);
		const wallMat = new THREE.MeshStandardMaterial({
			color: 0x0a0a12,
			side: THREE.BackSide,
			roughness: 1.0,
			metalness: 0.0
		});
		const walls = new THREE.Mesh(wallGeo, wallMat);
		walls.position.y = 12.5;
		walls.name = 'arena_walls';
		walls.castShadow = false;
		walls.receiveShadow = false;
		this.group.add(walls);

		// Ceiling (dark)
		const ceilGeo = new THREE.PlaneGeometry(60, 60);
		const ceilMat = new THREE.MeshStandardMaterial({
			color: 0x050508,
			roughness: 1.0,
			metalness: 0.0
		});
		const ceil = new THREE.Mesh(ceilGeo, ceilMat);
		ceil.rotation.x = Math.PI / 2;
		ceil.position.y = 24.9;
		ceil.name = 'arena_ceiling';
		ceil.castShadow = false;
		ceil.receiveShadow = false;
		this.group.add(ceil);
	}

	// ──────────────────────────── crowd (InstancedMesh) ────────────────────────────

	private buildCrowd(): void {
		// 240 individual 3D crowd members in tiered rows around the ring.
		// Uses InstancedMesh for a single draw call with per-instance color.
		const rowsPerSide = 6;
		const seatsPerRow = 10;
		const numSides = 4;
		const count = numSides * rowsPerSide * seatsPerRow;

		const geometry = new THREE.BoxGeometry(0.3, 0.55, 0.25);
		const material = new THREE.MeshStandardMaterial({
			roughness: 1.0,
			metalness: 0.0
		});

		const mesh = new THREE.InstancedMesh(geometry, material, count);
		mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		mesh.name = 'crowd_instanced';

		const dummy = new THREE.Object3D();
		const color = new THREE.Color();
		let idx = 0;

		const sides = [
			{ offset: [0, 0, 12] as const, facing: 0 },
			{ offset: [0, 0, -12] as const, facing: Math.PI },
			{ offset: [12, 0, 0] as const, facing: -Math.PI / 2 },
			{ offset: [-12, 0, 0] as const, facing: Math.PI / 2 }
		];

		for (const side of sides) {
			for (let row = 0; row < rowsPerSide; row++) {
				for (let col = 0; col < seatsPerRow; col++) {
					// Local coords before rotation by facing angle
					const localX = (col - (seatsPerRow - 1) / 2) * 0.85;
					const localY = row * 0.65 + 1.2;
					const localZ = -row * 0.35; // tiered seating rises away from ring

					// Rotate position by facing angle
					const cosF = Math.cos(side.facing);
					const sinF = Math.sin(side.facing);
					const worldX = side.offset[0] + localX * cosF + localZ * sinF;
					const worldZ = side.offset[2] - localX * sinF + localZ * cosF;

					dummy.position.set(worldX, localY, worldZ);
					dummy.rotation.set(0, side.facing, 0);
					dummy.updateMatrix();
					mesh.setMatrixAt(idx, dummy.matrix);

					// Random crowd colour (cosmetic only — not simulation)
					const hue = Math.random();
					const lightness = 0.25 + Math.random() * 0.25;
					color.setHSL(hue, 0.4, lightness);
					mesh.setColorAt(idx, color);

					idx++;
				}
			}
		}

		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

		this.group.add(mesh);
	}

	// ──────────────────────────── barricade (merged geometry) ────────────────────────────

	private buildBarricade(): void {
		const barricadeMat = new THREE.MeshStandardMaterial({
			color: 0x333333,
			roughness: 0.7,
			metalness: 0.4
		});

		const barricadeHeight = 1.1;
		const barricadeThickness = 0.08;
		const ringEdge = 5;

		const sides: Array<{ w: number; d: number; pos: THREE.Vector3 }> = [
			{ w: ringEdge * 2, d: barricadeThickness, pos: new THREE.Vector3(0, barricadeHeight / 2, ringEdge) },
			{ w: ringEdge * 2, d: barricadeThickness, pos: new THREE.Vector3(0, barricadeHeight / 2, -ringEdge) },
			{ w: barricadeThickness, d: ringEdge * 2, pos: new THREE.Vector3(ringEdge, barricadeHeight / 2, 0) },
			{ w: barricadeThickness, d: ringEdge * 2, pos: new THREE.Vector3(-ringEdge, barricadeHeight / 2, 0) }
		];

		// Merge 4 barricade segments into 1 draw call
		const geometries: THREE.BufferGeometry[] = [];
		for (const s of sides) {
			const geo = new THREE.BoxGeometry(s.w, barricadeHeight, s.d);
			geo.translate(s.pos.x, s.pos.y, s.pos.z);
			geometries.push(geo);
		}

		const merged = mergeGeometries(geometries);
		if (merged) {
			const mesh = new THREE.Mesh(merged, barricadeMat);
			mesh.castShadow = false;
			mesh.receiveShadow = false;
			mesh.name = 'barricade_merged';
			this.group.add(mesh);
		}

		// Dispose individual source geometries
		for (const geo of geometries) geo.dispose();
	}

	// ──────────────────────────── entrance ramp ────────────────────────────

	private buildEntranceRamp(): void {
		const rampLength = 10;
		const rampWidth = 3;

		const rampGeo = new THREE.PlaneGeometry(rampWidth, rampLength);
		const rampMat = new THREE.MeshStandardMaterial({
			color: 0x1a1a2e,
			roughness: 0.85,
			metalness: 0.1
		});
		const ramp = new THREE.Mesh(rampGeo, rampMat);
		ramp.rotation.x = -Math.PI / 2;
		ramp.position.set(0, 0.01, -(5 + rampLength / 2));
		ramp.receiveShadow = false;
		ramp.name = 'entrance_ramp';
		this.group.add(ramp);

		// Ramp side rails
		const railMat = new THREE.MeshStandardMaterial({
			color: 0x444444,
			roughness: 0.5,
			metalness: 0.6
		});
		const railHeight = 0.8;
		for (const side of [-1, 1]) {
			const railGeo = new THREE.BoxGeometry(0.06, railHeight, rampLength);
			const rail = new THREE.Mesh(railGeo, railMat);
			rail.position.set(side * rampWidth / 2, railHeight / 2, -(5 + rampLength / 2));
			rail.castShadow = false;
			rail.name = 'ramp_rail';
			this.group.add(rail);
		}
	}

	// ──────────────────────────── titantron ────────────────────────────

	private buildTitantron(): void {
		const screenWidth = 8;
		const screenHeight = 5;

		const screenGeo = new THREE.PlaneGeometry(screenWidth, screenHeight);
		const screenMat = new THREE.MeshStandardMaterial({
			color: 0x111133,
			emissive: new THREE.Color(0x222266),
			emissiveIntensity: 0.4,
			roughness: 0.2,
			metalness: 0.8
		});
		const screen = new THREE.Mesh(screenGeo, screenMat);
		screen.position.set(0, screenHeight / 2 + 1.5, -16);
		screen.name = 'titantron';
		this.group.add(screen);

		// Frame around the screen
		const frameMat = new THREE.MeshStandardMaterial({
			color: 0x333333,
			roughness: 0.5,
			metalness: 0.7
		});
		const frameThickness = 0.15;
		const frameGeo = new THREE.BoxGeometry(
			screenWidth + frameThickness * 2,
			screenHeight + frameThickness * 2,
			0.1
		);
		const frame = new THREE.Mesh(frameGeo, frameMat);
		frame.position.copy(screen.position);
		frame.position.z -= 0.06;
		frame.name = 'titantron_frame';
		this.group.add(frame);
	}

	// ──────────────────────────── arena lighting ────────────────────────────

	private buildArenaLighting(): void {
		const spotPositions: Array<[number, number, number]> = [
			[8, 20, 8],
			[-8, 20, 8],
			[8, 20, -8],
			[-8, 20, -8]
		];

		for (const [x, y, z] of spotPositions) {
			const spot = new THREE.SpotLight(0xfff5e6, 60, 40, Math.PI / 6, 0.5, 1.5);
			spot.position.set(x, y, z);
			spot.target.position.set(0, 1.2, 0);
			spot.castShadow = true;
			// Reduced shadow map (512 vs 1024) — arena spots are fill light, not primary
			spot.shadow.mapSize.set(512, 512);
			this.group.add(spot);
			this.group.add(spot.target);
			this.spotlights.push(spot);
		}

		// Dim point lights for crowd ambience
		const ambientCrowd = new THREE.PointLight(0x334466, 2, 30);
		ambientCrowd.position.set(0, 15, 0);
		this.group.add(ambientCrowd);
	}

	// ──────────────────────────── cleanup ────────────────────────────

	dispose(): void {
		this.group.traverse((child) => {
			if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => {
						if (m.map) m.map.dispose();
						m.dispose();
					});
				} else {
					const m = child.material as THREE.MeshStandardMaterial;
					if (m.map) m.map.dispose();
					m.dispose();
				}
			}
		});
		this.spotlights.length = 0;
		this.group.parent?.remove(this.group);
	}
}
