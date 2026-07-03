import * as THREE from 'three';

/** Ring geometry constants shared with the sim's ring-x range. */
export const RING = { half: 3.0, mat: 0.28, postH: 1.55 };

/**
 * Arena — the ring, ropes, turnbuckles, apron, floor, crowd and banners.
 * A static backdrop; only crowd brightness reacts (via setEnergy).
 */
export class Arena {
	readonly group = new THREE.Group();
	private crowd!: THREE.InstancedMesh;
	private crowdColors: THREE.Color[] = [];
	private tmp = new THREE.Color();
	private energy = 0.3;

	constructor(scene: THREE.Scene) {
		this.buildFloor();
		this.buildRing();
		this.buildRopes();
		this.buildCrowd();
		this.buildBanners();
		scene.add(this.group);
	}

	private buildFloor(): void {
		const floor = new THREE.Mesh(
			new THREE.CircleGeometry(24, 48),
			new THREE.MeshStandardMaterial({ color: 0x0a0b14, roughness: 0.9, metalness: 0.1 })
		);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		this.group.add(floor);

		// Glow ring under the apron.
		const glow = new THREE.Mesh(
			new THREE.RingGeometry(RING.half + 1.2, RING.half + 3.2, 48),
			new THREE.MeshBasicMaterial({ color: 0x1a2a6a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
		);
		glow.rotation.x = -Math.PI / 2;
		glow.position.y = 0.02;
		this.group.add(glow);
	}

	private buildRing(): void {
		const h = RING.half;
		// Mat.
		const mat = new THREE.Mesh(
			new THREE.BoxGeometry(h * 2 + 0.5, RING.mat, h * 2 + 0.5),
			new THREE.MeshStandardMaterial({ color: 0x1d2547, roughness: 0.7, metalness: 0.15 })
		);
		mat.position.y = RING.mat / 2;
		mat.receiveShadow = true;
		this.group.add(mat);

		// Canvas logo circle.
		const logo = new THREE.Mesh(
			new THREE.CircleGeometry(1.5, 40),
			new THREE.MeshStandardMaterial({ color: 0x2a3566, roughness: 0.6, emissive: 0x101838, emissiveIntensity: 0.5 })
		);
		logo.rotation.x = -Math.PI / 2;
		logo.position.y = RING.mat + 0.001;
		this.group.add(logo);

		// Apron skirt.
		const apron = new THREE.Mesh(
			new THREE.BoxGeometry(h * 2 + 0.55, 0.55, h * 2 + 0.55),
			new THREE.MeshStandardMaterial({ color: 0x0c1030, roughness: 0.5, metalness: 0.3, emissive: 0x14183a, emissiveIntensity: 0.4 })
		);
		apron.position.y = -0.28 + RING.mat / 2;
		this.group.add(apron);

		// Turnbuckle posts.
		const postMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.8 });
		const padMat = new THREE.MeshStandardMaterial({ color: 0xcc2233, emissive: 0xff2244, emissiveIntensity: 0.5, roughness: 0.5 });
		for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
			const x = sx * h, z = sz * h;
			const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, RING.postH, 10), postMat);
			post.position.set(x, RING.mat + RING.postH / 2, z);
			post.castShadow = true;
			this.group.add(post);
			for (const ry of [0.55, 0.9, 1.25]) {
				const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), padMat);
				pad.position.set(x, RING.mat + ry, z);
				this.group.add(pad);
			}
		}
	}

	private buildRopes(): void {
		const h = RING.half;
		const corners: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]];
		const ropeCols = [0xcc3344, 0xee4455, 0xff6677];
		for (let r = 0; r < 3; r++) {
			const y = RING.mat + 0.5 + r * 0.35;
			const m = new THREE.MeshStandardMaterial({ color: ropeCols[r], emissive: ropeCols[r], emissiveIntensity: 0.45, roughness: 0.4 });
			for (let i = 0; i < 4; i++) {
				const [x1, z1] = corners[i];
				const [x2, z2] = corners[(i + 1) % 4];
				const a = new THREE.Vector3(x1, y, z1), b = new THREE.Vector3(x2, y, z2);
				const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= 0.03;
				const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
				const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.02, 6, false), m);
				this.group.add(rope);
			}
		}
	}

	private buildCrowd(): void {
		// Instanced spectators in raked tiers around the ring. Seeded cosmetic
		// randomness — same crowd every load, no Math.random anywhere.
		let s = 0x9e3779b9;
		const rand = () => {
			s = (s + 0x6d2b79f5) | 0;
			let t = Math.imul(s ^ (s >>> 15), 1 | s);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const seats: { x: number; y: number; z: number; c: THREE.Color }[] = [];
		const palette = [0x2a3550, 0x3a2a40, 0x402a2a, 0x2a4040, 0x35354a, 0x4a3a2a];
		for (let row = 0; row < 10; row++) {
			const rad = RING.half + 4.5 + row * 0.85;
			const y = -0.2 + row * 0.55;
			const count = Math.floor((2 * Math.PI * rad) / 0.7);
			for (let i = 0; i < count; i++) {
				const a = (i / count) * Math.PI * 2 + row * 0.12;
				seats.push({
					x: Math.cos(a) * rad + (rand() - 0.5) * 0.2,
					y, z: Math.sin(a) * rad + (rand() - 0.5) * 0.2,
					c: new THREE.Color(palette[(rand() * palette.length) | 0])
				});
			}
		}
		const geo = new THREE.CapsuleGeometry(0.13, 0.28, 3, 6);
		const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), seats.length);
		const d = new THREE.Object3D();
		for (let i = 0; i < seats.length; i++) {
			const s = seats[i];
			d.position.set(s.x, s.y + 0.2, s.z);
			d.updateMatrix();
			mesh.setMatrixAt(i, d.matrix);
			mesh.setColorAt(i, s.c);
			this.crowdColors.push(s.c);
		}
		mesh.frustumCulled = false;
		this.crowd = mesh;
		this.group.add(mesh);
	}

	private buildBanners(): void {
		const mk = (title: string, sub: string, accent: string) => {
			const c = document.createElement('canvas'); c.width = 1024; c.height = 288;
			const x = c.getContext('2d')!;
			const g = x.createLinearGradient(0, 0, 0, 288);
			g.addColorStop(0, 'rgba(14,16,26,0.97)'); g.addColorStop(1, 'rgba(6,7,14,0.97)');
			x.fillStyle = g; x.fillRect(0, 0, 1024, 288);
			x.strokeStyle = accent; x.lineWidth = 6; x.strokeRect(10, 10, 1004, 268);
			x.fillStyle = accent; x.fillRect(1024 / 2 - 210, 182, 420, 5);
			x.textAlign = 'center'; x.textBaseline = 'middle';
			x.font = '800 88px "Arial Black", sans-serif'; x.fillStyle = '#fff';
			x.shadowColor = accent; x.shadowBlur = 16; x.fillText(title, 512, 108); x.shadowBlur = 0;
			x.font = '700 40px Arial, sans-serif'; x.fillStyle = accent; x.fillText(sub, 512, 236);
			const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
			return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
		};
		const banners: [string, string, string, number][] = [
			['WWE AGENTS', 'MAIN EVENT', '#ff3b5c', 0],
			['FIGHT NIGHT', 'LIVE', '#3b9bff', Math.PI * 0.66],
			['WORLD TITLE', 'WINNER TAKES ALL', '#ffb43b', -Math.PI * 0.66]
		];
		for (const [t, s, a, ang] of banners) {
			const dist = RING.half + 3.6;
			const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), mk(t, s, a));
			b.position.set(Math.cos(ang) * dist, 2.4, Math.sin(ang) * dist);
			b.lookAt(0, 2.4, 0);
			this.group.add(b);
		}
	}

	/** 0..1 crowd energy — brightens/enlivens the crowd. */
	setEnergy(e: number): void { this.energy = e; }

	update(t: number): void {
		if (!this.crowd) return;
		const bright = 0.8 + this.energy * 0.7;
		const d = new THREE.Object3D();
		const bob = 0.02 + this.energy * 0.12;
		for (let i = 0; i < this.crowdColors.length; i++) {
			// Cheap per-instance bob + brighten with energy.
			this.crowd.getMatrixAt(i, d.matrix);
			d.matrix.decompose(d.position, d.quaternion, d.scale);
			d.position.y += Math.sin(t * 3 + i) * bob * 0.02;
			d.updateMatrix();
			this.crowd.setMatrixAt(i, d.matrix);
			this.tmp.copy(this.crowdColors[i]).multiplyScalar(bright);
			this.crowd.setColorAt(i, this.tmp);
		}
		this.crowd.instanceMatrix.needsUpdate = true;
		if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
	}

	dispose(): void {
		this.group.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.geometry) m.geometry.dispose();
			const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
		});
		this.group.parent?.remove(this.group);
	}
}
