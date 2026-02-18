import * as THREE from 'three';

export interface RingConfig {
	/** Ring mat width in metres (X axis). Default 6. */
	width: number;
	/** Ring mat depth in metres (Z axis). Default 6. */
	depth: number;
	/** Platform height above floor in metres. Default 1.2. */
	height: number;
}

const DEFAULT_RING: RingConfig = { width: 6, depth: 6, height: 1.2 };

// Rope constants
const ROPE_LEVELS = [0.4, 0.75, 1.1]; // heights above the mat surface
const ROPE_SAG = 0.08; // metres of sag at the midpoint
const ROPE_RADIUS = 0.015;
const ROPE_SEGMENTS = 24;

/**
 * Builds all ring geometry -- mat, turnbuckles, ropes, apron, floor --
 * and adds them to the provided scene.
 */
export class RingRenderer {
	readonly group: THREE.Group;
	private config: RingConfig;

	constructor(scene: THREE.Scene, config?: Partial<RingConfig>) {
		this.config = { ...DEFAULT_RING, ...config };
		this.group = new THREE.Group();
		this.group.name = 'ring';

		this.buildMat();
		this.buildApron();
		this.buildTurnbuckles();
		this.buildRopes();
		this.buildFloor();

		scene.add(this.group);
	}

	// ──────────────────────────── mat ────────────────────────────

	private buildMat(): void {
		const { width, depth, height } = this.config;
		const matThickness = 0.08;

		// Canvas texture with ring lines
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 512;
		const ctx = canvas.getContext('2d')!;

		// Base colour
		ctx.fillStyle = '#e8e0d0';
		ctx.fillRect(0, 0, 512, 512);

		// Ring circle
		ctx.strokeStyle = '#c8342b';
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.arc(256, 256, 180, 0, Math.PI * 2);
		ctx.stroke();

		// Centre cross
		ctx.strokeStyle = '#3a3a3a';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(256, 76);
		ctx.lineTo(256, 436);
		ctx.moveTo(76, 256);
		ctx.lineTo(436, 256);
		ctx.stroke();

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;

		const matGeo = new THREE.BoxGeometry(width, matThickness, depth);
		const matMat = new THREE.MeshStandardMaterial({
			map: texture,
			roughness: 0.85,
			metalness: 0.0
		});
		const mat = new THREE.Mesh(matGeo, matMat);
		mat.name = 'mat';
		mat.position.y = height;
		mat.receiveShadow = true;
		this.group.add(mat);
	}

	// ──────────────────────────── apron ────────────────────────────

	private buildApron(): void {
		const { width, depth, height } = this.config;
		const apronMat = new THREE.MeshStandardMaterial({
			color: 0x1a1a2e,
			roughness: 0.9,
			metalness: 0.0
		});

		// Four sides
		const sides: Array<{ w: number; h: number; d: number; pos: THREE.Vector3 }> = [
			{ w: width, h: height, d: 0.05, pos: new THREE.Vector3(0, height / 2, depth / 2) },
			{ w: width, h: height, d: 0.05, pos: new THREE.Vector3(0, height / 2, -depth / 2) },
			{ w: 0.05, h: height, d: depth, pos: new THREE.Vector3(width / 2, height / 2, 0) },
			{ w: 0.05, h: height, d: depth, pos: new THREE.Vector3(-width / 2, height / 2, 0) }
		];

		for (const s of sides) {
			const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
			const mesh = new THREE.Mesh(geo, apronMat);
			mesh.position.copy(s.pos);
			mesh.receiveShadow = true;
			mesh.name = 'apron';
			this.group.add(mesh);
		}
	}

	// ──────────────────────────── turnbuckles ────────────────────────────

	private buildTurnbuckles(): void {
		const { width, depth, height } = this.config;
		const postHeight = ROPE_LEVELS[ROPE_LEVELS.length - 1] + 0.2;
		const postRadius = 0.04;
		const postMat = new THREE.MeshStandardMaterial({
			color: 0xcccccc,
			roughness: 0.3,
			metalness: 0.8
		});
		const padMat = new THREE.MeshStandardMaterial({
			color: 0xcc2222,
			roughness: 0.7,
			metalness: 0.0
		});

		const hw = width / 2;
		const hd = depth / 2;
		const corners: Vec2[] = [
			[hw, hd],
			[hw, -hd],
			[-hw, hd],
			[-hw, -hd]
		];

		for (const [cx, cz] of corners) {
			// Metal post
			const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
			const post = new THREE.Mesh(postGeo, postMat);
			post.position.set(cx, height + postHeight / 2, cz);
			post.castShadow = true;
			post.name = 'turnbuckle_post';
			this.group.add(post);

			// Turnbuckle pad (box at the top)
			const padGeo = new THREE.BoxGeometry(0.12, 0.18, 0.12);
			const pad = new THREE.Mesh(padGeo, padMat);
			pad.position.set(cx, height + postHeight - 0.1, cz);
			pad.castShadow = true;
			pad.name = 'turnbuckle_pad';
			this.group.add(pad);
		}
	}

	// ──────────────────────────── ropes ────────────────────────────

	private buildRopes(): void {
		const { width, depth, height } = this.config;
		const ropeMat = new THREE.MeshStandardMaterial({
			color: 0xeeeeee,
			roughness: 0.4,
			metalness: 0.2
		});

		const hw = width / 2;
		const hd = depth / 2;

		// Each side defined by start corner and end corner (XZ)
		const sides: Array<{ start: [number, number]; end: [number, number] }> = [
			{ start: [hw, hd], end: [hw, -hd] },
			{ start: [-hw, hd], end: [-hw, -hd] },
			{ start: [hw, hd], end: [-hw, hd] },
			{ start: [hw, -hd], end: [-hw, -hd] }
		];

		for (const ropeY of ROPE_LEVELS) {
			for (const side of sides) {
				const points: THREE.Vector3[] = [];
				for (let i = 0; i <= ROPE_SEGMENTS; i++) {
					const t = i / ROPE_SEGMENTS;
					const x = side.start[0] + (side.end[0] - side.start[0]) * t;
					const z = side.start[1] + (side.end[1] - side.start[1]) * t;
					// Parabolic sag: max at t = 0.5
					const sag = -ROPE_SAG * 4 * t * (1 - t);
					points.push(new THREE.Vector3(x, height + ropeY + sag, z));
				}

				const curve = new THREE.CatmullRomCurve3(points);
				const tubeGeo = new THREE.TubeGeometry(curve, ROPE_SEGMENTS, ROPE_RADIUS, 6, false);
				const rope = new THREE.Mesh(tubeGeo, ropeMat);
				rope.castShadow = true;
				rope.name = 'rope';
				this.group.add(rope);
			}
		}
	}

	// ──────────────────────────── floor ────────────────────────────

	private buildFloor(): void {
		const floorGeo = new THREE.PlaneGeometry(40, 40);
		const floorMat = new THREE.MeshStandardMaterial({
			color: 0x222222,
			roughness: 0.95,
			metalness: 0.0
		});
		const floor = new THREE.Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = 0;
		floor.receiveShadow = true;
		floor.name = 'floor';
		this.group.add(floor);
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
					const m = child.material as THREE.MeshStandardMaterial;
					if (m.map) m.map.dispose();
					m.dispose();
				}
			}
		});
		this.group.parent?.remove(this.group);
	}
}

/** Local helper type -- not exported. */
type Vec2 = [number, number];
