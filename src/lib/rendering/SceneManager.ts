import * as THREE from 'three';

/**
 * Manages the THREE.js scene, renderer, and lighting for the wrestling arena.
 * Provides the core rendering infrastructure that other renderers attach to.
 */
export class SceneManager {
	readonly scene: THREE.Scene;
	readonly renderer: THREE.WebGLRenderer;

	private ambientLight: THREE.AmbientLight;
	private directionalLight: THREE.DirectionalLight;
	private hemisphereLight: THREE.HemisphereLight;

	constructor(canvas: HTMLCanvasElement) {
		// --- Renderer ---
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.2;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		// --- Scene ---
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x111118);
		this.scene.fog = new THREE.FogExp2(0x111118, 0.015);

		// --- Ambient fill ---
		this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
		this.scene.add(this.ambientLight);

		// --- Main directional (arena spotlight feel) ---
		this.directionalLight = new THREE.DirectionalLight(0xfff8e7, 1.8);
		this.directionalLight.position.set(5, 15, 5);
		this.directionalLight.castShadow = true;
		this.directionalLight.shadow.mapSize.set(2048, 2048);
		this.directionalLight.shadow.camera.near = 0.5;
		this.directionalLight.shadow.camera.far = 50;
		this.directionalLight.shadow.camera.left = -15;
		this.directionalLight.shadow.camera.right = 15;
		this.directionalLight.shadow.camera.top = 15;
		this.directionalLight.shadow.camera.bottom = -15;
		this.directionalLight.shadow.bias = -0.0005;
		this.scene.add(this.directionalLight);

		// --- Hemisphere light for arena atmosphere ---
		// Sky color (warm arena lights from above), ground color (dark floor reflections)
		this.hemisphereLight = new THREE.HemisphereLight(0xffeedd, 0x222233, 0.5);
		this.scene.add(this.hemisphereLight);
	}

	/**
	 * Resize the renderer and update projection for the given dimensions.
	 * Should be called when the host canvas / window resizes.
	 */
	resize(width: number, height: number): void {
		this.renderer.setSize(width, height);
	}

	/**
	 * Render the current scene from the provided camera viewpoint.
	 */
	render(camera: THREE.Camera): void {
		this.renderer.render(this.scene, camera);
	}

	/**
	 * Dispose all GPU resources owned by the scene manager.
	 */
	dispose(): void {
		this.scene.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry.dispose();
				if (Array.isArray(object.material)) {
					object.material.forEach((m) => m.dispose());
				} else {
					object.material.dispose();
				}
			}
		});
		this.scene.remove(this.ambientLight);
		this.scene.remove(this.directionalLight);
		this.scene.remove(this.hemisphereLight);
		this.renderer.dispose();
	}
}
