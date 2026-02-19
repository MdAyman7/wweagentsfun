import * as THREE from 'three';

/**
 * Builds a WWE-style arena environment: 4 corner turnbuckle posts,
 * ring ropes between posts, dramatic lighting, banners, and barricade.
 *
 * Design: Dark dramatic arena — WWE-inspired atmosphere.
 *   - 4 turnbuckle corner posts with glowing orb tops
 *   - 3 rows of ring ropes connecting posts (like real WWE ring)
 *   - Dramatic directional lighting (key / fill / rim)
 *   - Large floating banners with event info
 *   - Barricade around the ringside area
 */
export class ArenaRenderer {
	private group: THREE.Group;
	private fillLights: THREE.DirectionalLight[] = [];
	private pillarOrbs: THREE.Mesh[] = [];

	/** Ring radius — matches RingRenderer default */
	private readonly ringRadius = 3.5;

	constructor(private scene: THREE.Scene) {
		this.group = new THREE.Group();
		this.group.name = 'arena';

		this.buildTurnbucklePosts();
		this.buildRingRopes();
		this.buildArenaLighting();
		this.buildBanners();
		this.buildBarrierRing();
		this.buildGroundGlow();
		this.buildRingApron();

		scene.add(this.group);
	}

	// ──────────────────────────── corner posts (turnbuckles) ────────────────────────────

	private buildTurnbucklePosts(): void {
		const r = this.ringRadius;
		const postHeight = 1.4;

		const postMat = new THREE.MeshStandardMaterial({
			color: 0x334466,
			transparent: true,
			opacity: 0.5,
			emissive: new THREE.Color(0x2255aa),
			emissiveIntensity: 0.8,
			roughness: 0.2,
			metalness: 0.3
		});

		const orbMat = new THREE.MeshStandardMaterial({
			color: 0x4488ff,
			emissive: new THREE.Color(0x3366ff),
			emissiveIntensity: 1.2,
			transparent: true,
			opacity: 0.8,
			roughness: 0.1,
			metalness: 0.5
		});

		const baseMat = new THREE.MeshStandardMaterial({
			color: 0xccccdd,
			roughness: 0.3,
			metalness: 0.8
		});

		// 4 corners of the square ring
		const corners: [number, number][] = [
			[-r, -r], [r, -r], [r, r], [-r, r]
		];

		for (let i = 0; i < 4; i++) {
			const [x, z] = corners[i];

			// Turnbuckle post (thicker than before)
			const shaftGeo = new THREE.CylinderGeometry(0.05, 0.06, postHeight, 8);
			const shaft = new THREE.Mesh(shaftGeo, postMat);
			shaft.position.set(x, 0.3 + postHeight / 2, z);
			shaft.name = `post_shaft_${i}`;
			this.group.add(shaft);

			// Turnbuckle pad (red cushion at rope intersection height)
			const padGeo = new THREE.BoxGeometry(0.12, 0.25, 0.12);
			const padMat = new THREE.MeshStandardMaterial({
				color: 0xcc2233,
				emissive: new THREE.Color(0xff2244),
				emissiveIntensity: 0.4,
				roughness: 0.6,
				metalness: 0.1
			});
			const pad = new THREE.Mesh(padGeo, padMat);
			pad.position.set(x, 0.3 + 0.6, z);
			pad.name = `turnbuckle_pad_${i}`;
			this.group.add(pad);

			// Base ring
			const baseGeo = new THREE.CylinderGeometry(0.10, 0.12, 0.06, 8);
			const base = new THREE.Mesh(baseGeo, baseMat);
			base.position.set(x, 0.33, z);
			base.name = `post_base_${i}`;
			this.group.add(base);

			// Orb at top
			const orbGeo = new THREE.SphereGeometry(0.10, 12, 8);
			const orb = new THREE.Mesh(orbGeo, orbMat.clone());
			orb.position.set(x, 0.3 + postHeight + 0.08, z);
			orb.name = `post_orb_${i}`;
			this.group.add(orb);
			this.pillarOrbs.push(orb);

			// Point light at each orb
			const orbLight = new THREE.PointLight(0x4488ff, 0.6, 4);
			orbLight.position.copy(orb.position);
			this.group.add(orbLight);
		}
	}

	// ──────────────────────────── ring ropes ────────────────────────────

	private buildRingRopes(): void {
		const r = this.ringRadius;
		const corners: [number, number][] = [
			[-r, -r], [r, -r], [r, r], [-r, r]
		];
		const ropeHeights = [0.45, 0.65, 0.85]; // 3 rope rows, WWE-style

		// Top rope is brightest red, middle and bottom are slightly dimmer
		const ropeColors = [0xcc3344, 0xee4455, 0xff5566];

		for (let ropeIdx = 0; ropeIdx < 3; ropeIdx++) {
			const ropeMat = new THREE.MeshStandardMaterial({
				color: ropeColors[ropeIdx],
				emissive: new THREE.Color(ropeColors[ropeIdx]),
				emissiveIntensity: 0.5,
				roughness: 0.4,
				metalness: 0.2
			});

			for (let i = 0; i < 4; i++) {
				const [x1, z1] = corners[i];
				const [x2, z2] = corners[(i + 1) % 4];
				const y = 0.3 + ropeHeights[ropeIdx];

				const start = new THREE.Vector3(x1, y, z1);
				const end = new THREE.Vector3(x2, y, z2);

				// Slight sag in the middle for realism
				const mid = new THREE.Vector3(
					(x1 + x2) / 2,
					y - 0.015, // slight sag
					(z1 + z2) / 2
				);

				const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
				const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.012, 6, false);
				const rope = new THREE.Mesh(tubeGeo, ropeMat);
				rope.name = `rope_${ropeIdx}_${i}`;
				this.group.add(rope);
			}
		}
	}

	// ──────────────────────────── ring apron ────────────────────────────

	private buildRingApron(): void {
		const r = this.ringRadius;
		const apronDrop = 0.25;

		// Ring apron — dark skirt around the ring edge
		const apronMat = new THREE.MeshStandardMaterial({
			color: 0x111122,
			emissive: new THREE.Color(0x0a0a1a),
			emissiveIntensity: 0.3,
			roughness: 0.5,
			metalness: 0.2,
			side: THREE.DoubleSide
		});

		// 4 apron panels (one per side)
		const sides: [number, number, number, number, number][] = [
			[-r, -r, r, -r, 0],   // front
			[r, -r, r, r, Math.PI / 2],    // right
			[r, r, -r, r, Math.PI],   // back
			[-r, r, -r, -r, -Math.PI / 2], // left
		];

		for (const [x1, z1, x2, z2] of sides) {
			const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
			const apronGeo = new THREE.PlaneGeometry(length, apronDrop);
			const apron = new THREE.Mesh(apronGeo, apronMat);

			const mx = (x1 + x2) / 2;
			const mz = (z1 + z2) / 2;
			apron.position.set(mx, 0.3 - apronDrop / 2, mz);

			// Face outward
			const angle = Math.atan2(x2 - x1, z2 - z1);
			apron.rotation.y = angle + Math.PI / 2;

			apron.name = 'ring_apron';
			this.group.add(apron);
		}
	}

	// ──────────────────────────── arena lighting ────────────────────────────

	private buildArenaLighting(): void {
		// Key light (front-left, cool blue-white)
		const keyLight = new THREE.DirectionalLight(0xccddff, 0.5);
		keyLight.position.set(-5, 10, 6);
		this.group.add(keyLight);
		this.fillLights.push(keyLight);

		// Fill light (front-right, muted blue)
		const fillLight = new THREE.DirectionalLight(0x8899cc, 0.3);
		fillLight.position.set(5, 8, 4);
		this.group.add(fillLight);
		this.fillLights.push(fillLight);

		// Rim light (back, blue tint for silhouette)
		const rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
		rimLight.position.set(0, 6, -8);
		this.group.add(rimLight);
		this.fillLights.push(rimLight);

		// Red accent spot light from above (dramatic, like WWE overhead rig)
		const redSpot = new THREE.SpotLight(0xff3333, 0.5, 20, Math.PI / 5, 0.5);
		redSpot.position.set(0, 12, 0);
		redSpot.target.position.set(0, 0, 0);
		this.group.add(redSpot);
		this.group.add(redSpot.target);

		// Secondary white overhead spotlight (main arena light)
		const whiteSpot = new THREE.SpotLight(0xeeeeff, 0.3, 25, Math.PI / 4, 0.6);
		whiteSpot.position.set(2, 14, -2);
		whiteSpot.target.position.set(0, 0.3, 0);
		this.group.add(whiteSpot);
		this.group.add(whiteSpot.target);
	}

	// ──────────────────────────── banners ────────────────────────────

	private buildBanners(): void {
		const r = this.ringRadius;
		const bannerHeight = 0.8;
		const bannerWidth = 2.8;

		interface BannerInfo {
			title: string;
			subtitle: string;
			line3: string;
			angle: number;
			yPos: number;
		}

		const banners: BannerInfo[] = [
			{
				title: 'WWE AGENTS',
				subtitle: 'CHAMPIONSHIP FIGHT',
				line3: 'LIVE PAY-PER-VIEW EVENT',
				angle: 0,
				yPos: 2.0
			},
			{
				title: 'FIGHT NIGHT',
				subtitle: 'MAIN EVENT',
				line3: 'AI vs AI \u2022 NO HOLDS BARRED',
				angle: Math.PI * 0.6,
				yPos: 2.2
			},
			{
				title: 'BATTLE ARENA',
				subtitle: 'WORLD HEAVYWEIGHT TITLE',
				line3: 'WINNER TAKES ALL',
				angle: -Math.PI * 0.6,
				yPos: 1.9
			},
			{
				title: 'LIVE',
				subtitle: 'WWEAGENTS.FUN',
				line3: 'TUNE IN NOW',
				angle: Math.PI,
				yPos: 2.1
			}
		];

		for (let i = 0; i < banners.length; i++) {
			const info = banners[i];
			const dist = r + 2.5;
			const x = Math.cos(info.angle) * dist;
			const z = Math.sin(info.angle) * dist;

			// Create banner canvas — high res for crisp text
			const canvas = document.createElement('canvas');
			canvas.width = 640;
			canvas.height = 200;
			const ctx = canvas.getContext('2d')!;

			// Dark gradient background
			const grad = ctx.createLinearGradient(0, 0, 640, 0);
			grad.addColorStop(0, 'rgba(8, 3, 18, 0.95)');
			grad.addColorStop(0.3, 'rgba(25, 8, 40, 0.95)');
			grad.addColorStop(0.5, 'rgba(45, 12, 55, 0.95)');
			grad.addColorStop(0.7, 'rgba(25, 8, 40, 0.95)');
			grad.addColorStop(1, 'rgba(8, 3, 18, 0.95)');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, 640, 200);

			// Double border — outer glow + inner accent
			ctx.shadowColor = '#ff2244';
			ctx.shadowBlur = 14;
			ctx.strokeStyle = '#ff3355';
			ctx.lineWidth = 4;
			ctx.strokeRect(4, 4, 632, 192);
			ctx.shadowBlur = 0;
			ctx.strokeStyle = 'rgba(255, 100, 120, 0.4)';
			ctx.lineWidth = 1;
			ctx.strokeRect(10, 10, 620, 180);

			// Corner accents
			const cornerLen = 24;
			ctx.strokeStyle = '#ff4466';
			ctx.lineWidth = 2;
			for (const [cx, cy, dx, dy] of [
				[14, 14, 1, 1], [626, 14, -1, 1],
				[14, 186, 1, -1], [626, 186, -1, -1]
			] as [number, number, number, number][]) {
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(cx + cornerLen * dx, cy);
				ctx.moveTo(cx, cy);
				ctx.lineTo(cx, cy + cornerLen * dy);
				ctx.stroke();
			}

			// Main title — bold, large, with glow
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.shadowColor = '#ff2244';
			ctx.shadowBlur = 20;
			ctx.fillStyle = '#ff4466';
			ctx.font = 'bold 52px "Impact", "Arial Black", "Helvetica Neue", sans-serif';
			ctx.fillText(info.title, 320, 65);

			// Second pass for extra brightness
			ctx.shadowBlur = 10;
			ctx.fillStyle = '#ff8899';
			ctx.fillText(info.title, 320, 65);
			ctx.shadowBlur = 0;

			// Horizontal divider
			const divGrad = ctx.createLinearGradient(80, 0, 560, 0);
			divGrad.addColorStop(0, 'rgba(255, 50, 80, 0)');
			divGrad.addColorStop(0.2, 'rgba(255, 50, 80, 0.6)');
			divGrad.addColorStop(0.5, 'rgba(255, 100, 120, 0.8)');
			divGrad.addColorStop(0.8, 'rgba(255, 50, 80, 0.6)');
			divGrad.addColorStop(1, 'rgba(255, 50, 80, 0)');
			ctx.strokeStyle = divGrad;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(80, 100);
			ctx.lineTo(560, 100);
			ctx.stroke();

			// Subtitle
			ctx.fillStyle = 'rgba(255, 200, 210, 0.85)';
			ctx.font = 'bold 22px "Impact", "Arial Black", sans-serif';
			ctx.fillText(info.subtitle, 320, 128);

			// Line 3 — smaller detail
			ctx.fillStyle = 'rgba(180, 160, 200, 0.6)';
			ctx.font = '600 14px "Arial", "Helvetica Neue", sans-serif';
			ctx.fillText(info.line3, 320, 162);

			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;

			const bannerGeo = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
			const bannerMat = new THREE.MeshStandardMaterial({
				map: texture,
				transparent: true,
				opacity: 0.92,
				emissive: new THREE.Color(0xff2233),
				emissiveIntensity: 0.5,
				roughness: 0.4,
				metalness: 0.2,
				side: THREE.DoubleSide
			});

			const banner = new THREE.Mesh(bannerGeo, bannerMat);
			banner.position.set(x, info.yPos, z);
			banner.lookAt(0, info.yPos, 0); // face center
			banner.name = `banner_${i}`;
			this.group.add(banner);

			// Subtle glow light behind each banner
			const bannerGlow = new THREE.PointLight(0xff3355, 0.3, 3);
			bannerGlow.position.set(x, info.yPos, z);
			this.group.add(bannerGlow);
		}
	}

	// ──────────────────────────── barrier ring ────────────────────────────

	private buildBarrierRing(): void {
		const r = this.ringRadius;
		const barrierDist = r + 1.5;

		// Low metallic barricade panels around the ring (square layout)
		const barricadeMat = new THREE.MeshStandardMaterial({
			color: 0x222233,
			roughness: 0.3,
			metalness: 0.8,
			emissive: new THREE.Color(0x332244),
			emissiveIntensity: 0.3
		});

		const barricadeGlowMat = new THREE.MeshBasicMaterial({
			color: 0xff3355,
			transparent: true,
			opacity: 0.3,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		});

		const sides: [number, number, number, number][] = [
			[-barrierDist, -barrierDist, barrierDist, -barrierDist],
			[barrierDist, -barrierDist, barrierDist, barrierDist],
			[barrierDist, barrierDist, -barrierDist, barrierDist],
			[-barrierDist, barrierDist, -barrierDist, -barrierDist],
		];

		for (const [x1, z1, x2, z2] of sides) {
			const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);

			// Barrier panel
			const panelGeo = new THREE.BoxGeometry(length, 0.2, 0.08);
			const panel = new THREE.Mesh(panelGeo, barricadeMat);
			const mx = (x1 + x2) / 2;
			const mz = (z1 + z2) / 2;
			panel.position.set(mx, 0.1, mz);
			const angle = Math.atan2(z2 - z1, x2 - x1);
			panel.rotation.y = angle;
			panel.name = 'barrier_panel';
			this.group.add(panel);

			// Glow strip on top of barrier
			const glowGeo = new THREE.BoxGeometry(length, 0.02, 0.04);
			const glow = new THREE.Mesh(glowGeo, barricadeGlowMat);
			glow.position.set(mx, 0.22, mz);
			glow.rotation.y = angle;
			glow.name = 'barrier_glow';
			this.group.add(glow);
		}
	}

	// ──────────────────────────── ground glow ────────────────────────────

	private buildGroundGlow(): void {
		// Large ambient glow ring on the ground beneath the platform
		const groundGlowGeo = new THREE.RingGeometry(4.0, 8, 48);
		const groundGlowMat = new THREE.MeshBasicMaterial({
			color: 0x1122aa,
			transparent: true,
			opacity: 0.12,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		const groundGlow = new THREE.Mesh(groundGlowGeo, groundGlowMat);
		groundGlow.rotation.x = -Math.PI / 2;
		groundGlow.position.y = -0.8;
		groundGlow.name = 'ground_glow';
		this.group.add(groundGlow);

		// Red accent ground ring (closer to platform)
		const redGlowGeo = new THREE.RingGeometry(3.3, 3.8, 48);
		const redGlowMat = new THREE.MeshBasicMaterial({
			color: 0xff2233,
			transparent: true,
			opacity: 0.08,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		const redGlow = new THREE.Mesh(redGlowGeo, redGlowMat);
		redGlow.rotation.x = -Math.PI / 2;
		redGlow.position.y = -0.3;
		redGlow.name = 'ground_red_glow';
		this.group.add(redGlow);
	}

	// ──────────────────────────── atmosphere API ────────────────────────────

	/**
	 * Set the intensity of fill lights (called by atmosphere system).
	 * Multiplier applied to base intensities.
	 */
	setSpotlightIntensity(multiplier: number): void {
		const baseIntensities = [1.0, 0.5, 0.6];
		for (let i = 0; i < this.fillLights.length; i++) {
			this.fillLights[i].intensity = baseIntensities[i] * multiplier;
		}
	}

	/**
	 * Set the energy pillar glow intensity (called by atmosphere system).
	 */
	setTitantronIntensity(intensity: number): void {
		for (const orb of this.pillarOrbs) {
			const mat = orb.material as THREE.MeshStandardMaterial;
			mat.emissiveIntensity = intensity * 1.75;
		}
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
					child.material.dispose();
				}
			}
		});
		this.fillLights.length = 0;
		this.pillarOrbs.length = 0;
		this.group.parent?.remove(this.group);
	}
}
