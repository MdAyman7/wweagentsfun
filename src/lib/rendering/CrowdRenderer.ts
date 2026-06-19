import * as THREE from 'three';

/**
 * CrowdRenderer — a living arena crowd built from instanced silhouettes in
 * raked stadium tiers around the ring. Spectators bob/sway continuously and
 * react to match excitement: bobbing amplitude and brightness rise with the
 * crowd energy, and big moments trigger a transient "pop" (a jumping surge).
 *
 * Presentation-only; cheap (two InstancedMeshes, no per-instance draw calls).
 */
interface Seat {
	x: number;
	z: number;
	baseY: number;
	phase: number;
	speed: number;
	heightScale: number;
	color: THREE.Color;
	jitter: number;
}

export class CrowdRenderer {
	private group: THREE.Group;
	private bodies: THREE.InstancedMesh;
	private heads: THREE.InstancedMesh;
	private seats: Seat[] = [];

	private excitement = 0.2; // smoothed 0..1
	private excitementTarget = 0.2;
	private pop = 0; // transient surge, decays to 0
	private time = 0;

	private readonly dummy = new THREE.Object3D();
	private readonly tmpColor = new THREE.Color();

	// Muted spectator palette (dark so they read as a backdrop, not foreground).
	private static readonly PALETTE = [
		0x2a3550, 0x3a2a40, 0x402a2a, 0x2a4040, 0x35354a, 0x4a3a2a, 0x303048
	];

	constructor(scene: THREE.Scene, ringRadius = 2.625) {
		this.group = new THREE.Group();
		this.group.name = 'crowd';

		this.generateSeats(ringRadius);
		const count = this.seats.length;

		// Bodies: thin tapered boxes (torso silhouette).
		const bodyGeo = new THREE.BoxGeometry(0.13, 0.34, 0.11);
		bodyGeo.translate(0, 0.17, 0); // pivot at feet
		const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false });
		this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
		this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.bodies.frustumCulled = false;

		// Heads: small spheres.
		const headGeo = new THREE.SphereGeometry(0.07, 6, 5);
		const headMat = new THREE.MeshBasicMaterial({ toneMapped: false });
		this.heads = new THREE.InstancedMesh(headGeo, headMat, count);
		this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.heads.frustumCulled = false;

		// Seed instance colors.
		for (let i = 0; i < count; i++) {
			this.bodies.setColorAt(i, this.seats[i].color);
			this.heads.setColorAt(i, this.tmpColor.set(0xc9a888)); // skin-ish heads
		}
		if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
		if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;

		this.writeMatrices();

		this.group.add(this.bodies);
		this.group.add(this.heads);
		scene.add(this.group);
	}

	/** Lay out raked stadium tiers on all four sides beyond the barricade. */
	private generateSeats(ringRadius: number): void {
		const rInner = ringRadius + 2.6; // start outside barricade/banners
		const rows = 9;
		const rowStep = 0.62;
		const seatSpacing = 0.42;
		const palette = CrowdRenderer.PALETTE;

		// Deterministic-ish scatter (presentation only; Math.random is fine here).
		for (let row = 0; row < rows; row++) {
			const half = rInner + row * rowStep; // half-extent of this square ring
			const baseY = -0.45 + row * 0.4; // stadium rake rising away from ring
			const perimeter = 8 * half;
			const seatsThisRow = Math.floor(perimeter / seatSpacing);

			for (let s = 0; s < seatsThisRow; s++) {
				const t = s / seatsThisRow; // 0..1 around the square
				const [px, pz] = squarePoint(t, half);

				// Leave a gap on the front side (entrance ramp) for variety.
				const angle = Math.atan2(pz, px);
				if (angle > Math.PI * 0.42 && angle < Math.PI * 0.58) continue;

				const jx = (Math.random() - 0.5) * 0.18;
				const jz = (Math.random() - 0.5) * 0.18;
				this.seats.push({
					x: px + jx,
					z: pz + jz,
					baseY,
					phase: Math.random() * Math.PI * 2,
					speed: 1.6 + Math.random() * 1.8,
					heightScale: 0.8 + Math.random() * 0.5,
					color: new THREE.Color(palette[(Math.random() * palette.length) | 0]),
					jitter: Math.random()
				});
			}
		}
	}

	/** Set the ambient excitement target (0 = idle, 1 = roaring). */
	setExcitement(level: number): void {
		this.excitementTarget = Math.max(0, Math.min(1, level));
	}

	/** Trigger a transient crowd surge (people jump up) for a big moment. */
	popReaction(intensity = 1): void {
		this.pop = Math.min(1.5, this.pop + intensity);
	}

	update(dt: number): void {
		this.time += dt;
		this.excitement += (this.excitementTarget - this.excitement) * Math.min(1, dt * 2);
		this.pop *= Math.max(0, 1 - dt * 2.5); // decay surge

		this.writeMatrices();
		this.writeColors();
	}

	private writeMatrices(): void {
		const energy = this.excitement + this.pop;
		const bobAmp = 0.015 + energy * 0.14;
		const swayAmp = 0.01 + this.excitement * 0.04;

		for (let i = 0; i < this.seats.length; i++) {
			const seat = this.seats[i];
			const wave = Math.sin(this.time * seat.speed + seat.phase);
			// On a pop, bias upward (a "jump") rather than a symmetric bob.
			const lift = Math.max(0, wave) * bobAmp * (1 + this.pop * 1.5);
			const sway = Math.cos(this.time * seat.speed * 0.6 + seat.phase) * swayAmp;
			const y = seat.baseY + lift;

			const d = this.dummy;
			d.position.set(seat.x + sway, y, seat.z);
			d.rotation.set(0, Math.atan2(-seat.x, -seat.z), 0); // face the ring
			d.scale.set(1, seat.heightScale, 1);
			d.updateMatrix();
			this.bodies.setMatrixAt(i, d.matrix);

			// Head rides on top of the (scaled) torso.
			d.position.y = y + 0.34 * seat.heightScale;
			d.scale.set(1, 1, 1);
			d.updateMatrix();
			this.heads.setMatrixAt(i, d.matrix);
		}
		this.bodies.instanceMatrix.needsUpdate = true;
		this.heads.instanceMatrix.needsUpdate = true;
	}

	private writeColors(): void {
		// Brighten the crowd as energy rises; add a per-seat flicker on big pops.
		const brighten = 0.85 + this.excitement * 0.6;
		for (let i = 0; i < this.seats.length; i++) {
			const seat = this.seats[i];
			const flick =
				this.pop > 0.05 ? 1 + this.pop * (0.4 + 0.6 * ((seat.jitter + this.time) % 1)) : 1;
			this.tmpColor.copy(seat.color).multiplyScalar(brighten * flick);
			this.bodies.setColorAt(i, this.tmpColor);
		}
		if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
	}

	dispose(): void {
		this.bodies.geometry.dispose();
		(this.bodies.material as THREE.Material).dispose();
		this.heads.geometry.dispose();
		(this.heads.material as THREE.Material).dispose();
		this.bodies.dispose();
		this.heads.dispose();
		this.group.parent?.remove(this.group);
		this.seats.length = 0;
	}
}

/** Map t in [0,1) to a point on the perimeter of a square of half-extent h. */
function squarePoint(t: number, h: number): [number, number] {
	const side = Math.floor(t * 4); // 0..3
	const f = t * 4 - side; // 0..1 along this side
	const p = -h + f * 2 * h; // -h..h
	switch (side) {
		case 0:
			return [p, -h];
		case 1:
			return [h, p];
		case 2:
			return [-p, h];
		default:
			return [-h, -p];
	}
}
