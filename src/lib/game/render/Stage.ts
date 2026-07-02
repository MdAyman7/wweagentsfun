import * as THREE from 'three';

/**
 * Stage — owns the THREE scene, renderer and arena lighting.
 * Presentation only; driven by the sim, never the other way around.
 */
export class Stage {
	readonly scene: THREE.Scene;
	readonly renderer: THREE.WebGLRenderer;
	private readonly key: THREE.DirectionalLight;
	private readonly spot: THREE.SpotLight;

	constructor(canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.05;

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x05060c);
		this.scene.fog = new THREE.Fog(0x05060c, 14, 42);

		// Ambient + hemispheric fill for soft base light.
		this.scene.add(new THREE.HemisphereLight(0x8899cc, 0x080810, 0.6));
		this.scene.add(new THREE.AmbientLight(0x334455, 0.4));

		// Key spotlight over the ring (the classic overhead rig look).
		this.spot = new THREE.SpotLight(0xffffff, 120, 26, Math.PI / 5, 0.45, 1.4);
		this.spot.position.set(0, 12, 2);
		this.spot.target.position.set(0, 1, 0);
		this.spot.castShadow = true;
		this.spot.shadow.mapSize.set(1024, 1024);
		this.spot.shadow.camera.near = 4;
		this.spot.shadow.camera.far = 24;
		this.scene.add(this.spot, this.spot.target);

		// Cool rim/key from the side for muscle definition.
		this.key = new THREE.DirectionalLight(0xbfd0ff, 1.1);
		this.key.position.set(-6, 8, 5);
		this.scene.add(this.key);

		const rim = new THREE.DirectionalLight(0xff5577, 0.5);
		rim.position.set(6, 5, -6);
		this.scene.add(rim);
	}

	render(camera: THREE.Camera): void {
		this.renderer.render(this.scene, camera);
	}

	resize(w: number, h: number): void {
		this.renderer.setSize(w, h, false);
	}

	/** Pulse arena brightness with crowd energy / big moments. */
	setExposure(v: number): void {
		this.renderer.toneMappingExposure = v;
	}

	dispose(): void {
		this.renderer.dispose();
	}
}
