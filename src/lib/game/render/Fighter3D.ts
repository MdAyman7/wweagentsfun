import * as THREE from 'three';

export type Build = 'light' | 'medium' | 'heavy';

export interface FighterVisual {
	skin: string;      // skin tone
	trunks: string;    // primary attire colour
	accent: string;    // boots / gloves / kick-pads
	build: Build;
	strength: number;  // 0-99, thickens the frame
	name: string;
}

/** 21-ish channel pose consumed by applyPose (radians / metres). */
export interface Pose {
	lift: number;        // hips vertical offset (jump / crouch)
	lieX: number;        // whole-body lie-down angle (knockdown)
	hipsX: number; hipsZ: number;
	spineX: number; spineY: number; spineZ: number;
	lArmX: number; lArmZ: number; lElbow: number;
	rArmX: number; rArmZ: number; rElbow: number;
	lLegX: number; lLegZ: number; lKnee: number;
	rLegX: number; rLegZ: number; rKnee: number;
	headX: number; headZ: number;
}

export function restPose(): Pose {
	return {
		lift: 0, lieX: 0, hipsX: 0, hipsZ: 0, spineX: 0.04, spineY: 0, spineZ: 0,
		lArmX: -0.5, lArmZ: 0.25, lElbow: -1.3,
		rArmX: -0.5, rArmZ: -0.25, rElbow: -1.3,
		lLegX: 0.06, lLegZ: 0.05, lKnee: -0.12,
		rLegX: -0.06, rLegZ: -0.05, rKnee: -0.12,
		headX: 0, headZ: 0
	};
}

const BUILD_SCALE: Record<Build, number> = { light: 0.94, medium: 1.0, heavy: 1.08 };

/** A muscled, stylized humanoid wrestler built from primitives + a joint rig. */
export class Fighter3D {
	readonly root = new THREE.Group();
	readonly hipY: number;

	private hips = new THREE.Group();
	private spine = new THREE.Group();
	private lArm = new THREE.Group(); private lFore = new THREE.Group();
	private rArm = new THREE.Group(); private rFore = new THREE.Group();
	private lLeg = new THREE.Group(); private lShin = new THREE.Group();
	private rLeg = new THREE.Group(); private rShin = new THREE.Group();
	private neck = new THREE.Group();
	private mats: THREE.Material[] = [];

	constructor(v: FighterVisual) {
		const s = BUILD_SCALE[v.build];
		const str = v.strength / 99;
		const thick = 1 + str * 0.28; // strength → beefier

		const skin = new THREE.MeshStandardMaterial({ color: v.skin, roughness: 0.6, metalness: 0.05 });
		const trunks = new THREE.MeshStandardMaterial({ color: v.trunks, roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(v.trunks).multiplyScalar(0.15) });
		const accent = new THREE.MeshStandardMaterial({ color: v.accent, roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(v.accent).multiplyScalar(0.2) });
		const hair = new THREE.MeshStandardMaterial({ color: 0x201812, roughness: 0.9 });
		this.mats.push(skin, trunks, accent, hair);

		const thighLen = 0.24 * s, shinLen = 0.22 * s, bootH = 0.09 * s;
		const upperArm = 0.2 * s, foreArm = 0.18 * s;
		const waistLen = 0.16 * s, chestLen = 0.32 * s;
		const shoulderW = 0.2 * s * thick, hipW = 0.11 * s;
		const headR = 0.115 * s;

		this.hipY = bootH + shinLen + thighLen;
		const shoulderY = waistLen + chestLen;

		// ── Root → hips ──
		this.root.add(this.hips);
		this.hips.position.y = this.hipY;

		// Pelvis / trunks.
		const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * s * thick, 0.1 * s, 4, 10), trunks);
		pelvis.castShadow = true;
		this.hips.add(pelvis);

		// ── Spine (torso) ──
		this.hips.add(this.spine);
		const waist = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * s * thick, waistLen, 4, 10), skin);
		waist.position.y = waistLen / 2 + 0.02; waist.castShadow = true;
		this.spine.add(waist);
		const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.15 * s * thick, chestLen * 0.7, 5, 12), skin);
		chest.position.y = waistLen + chestLen * 0.45; chest.castShadow = true;
		chest.scale.z = 0.8;
		this.spine.add(chest);
		// Pecs.
		for (const sx of [-1, 1]) {
			const pec = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s * thick, 10, 8), skin);
			pec.position.set(sx * 0.07 * s, waistLen + chestLen * 0.62, 0.09 * s);
			this.spine.add(pec);
		}

		// ── Neck + head ──
		this.spine.add(this.neck);
		this.neck.position.y = shoulderY;
		const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.08 * s, 8), skin);
		neckMesh.position.y = 0.04 * s; this.neck.add(neckMesh);
		const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), skin);
		head.position.y = 0.08 * s + headR * 0.9; head.castShadow = true;
		this.neck.add(head);
		const hairCap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
		hairCap.position.copy(head.position); hairCap.position.y += headR * 0.1;
		this.neck.add(hairCap);
		for (const sx of [-1, 1]) {
			const eye = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
			eye.position.set(sx * headR * 0.35, head.position.y + headR * 0.05, headR * 0.92);
			this.neck.add(eye);
		}

		// ── Arms ──
		const makeArm = (side: -1 | 1, armG: THREE.Group, foreG: THREE.Group) => {
			armG.position.set(side * shoulderW, shoulderY - 0.02, 0);
			this.spine.add(armG);
			const delt = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s * thick, 10, 8), skin);
			armG.add(delt);
			const up = seg(upperArm, 0.055 * s * thick, skin); armG.add(up);
			foreG.position.y = -upperArm; armG.add(foreG);
			const fo = seg(foreArm, 0.048 * s * thick, skin); foreG.add(fo);
			const glove = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 10, 8), accent);
			glove.position.y = -foreArm; glove.castShadow = true; foreG.add(glove);
		};
		makeArm(-1, this.lArm, this.lFore);
		makeArm(1, this.rArm, this.rFore);

		// ── Legs ──
		const makeLeg = (side: -1 | 1, legG: THREE.Group, shinG: THREE.Group) => {
			legG.position.set(side * hipW, 0, 0);
			this.hips.add(legG);
			const th = seg(thighLen, 0.075 * s * thick, skin); legG.add(th);
			shinG.position.y = -thighLen; legG.add(shinG);
			const sh = seg(shinLen, 0.06 * s, skin); shinG.add(sh);
			const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, bootH, 0.2 * s), accent);
			boot.position.set(0, -shinLen - bootH / 2 + 0.02, 0.03 * s); boot.castShadow = true;
			shinG.add(boot);
			// knee pad
			const knee = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 6), trunks);
			knee.position.y = -thighLen; legG.add(knee);
		};
		makeLeg(-1, this.lLeg, this.lShin);
		makeLeg(1, this.rLeg, this.rShin);

		this.applyPose(restPose());
	}

	applyPose(p: Pose): void {
		this.root.rotation.x = p.lieX;
		this.hips.position.y = this.hipY + p.lift;
		this.hips.rotation.x = p.hipsX; this.hips.rotation.z = p.hipsZ;
		this.spine.rotation.set(p.spineX, p.spineY, p.spineZ);
		this.lArm.rotation.set(p.lArmX, 0, p.lArmZ); this.lFore.rotation.x = p.lElbow;
		this.rArm.rotation.set(p.rArmX, 0, p.rArmZ); this.rFore.rotation.x = p.rElbow;
		this.lLeg.rotation.set(p.lLegX, 0, p.lLegZ); this.lShin.rotation.x = p.lKnee;
		this.rLeg.rotation.set(p.rLegX, 0, p.rLegZ); this.rShin.rotation.x = p.rKnee;
		this.neck.rotation.x = p.headX; this.neck.rotation.z = p.headZ;
	}

	dispose(): void {
		this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
		this.mats.forEach((m) => m.dispose());
		this.root.parent?.remove(this.root);
	}
}

/** A limb segment: capsule pointing down from the joint pivot at origin. */
function seg(len: number, r: number, mat: THREE.Material): THREE.Mesh {
	const g = new THREE.CapsuleGeometry(r, len * 0.7, 4, 8);
	g.translate(0, -len / 2, 0);
	const m = new THREE.Mesh(g, mat);
	m.castShadow = true;
	return m;
}
