import type { EntityId, Vec3 } from '../utils/types';
import type { PhysicsAdapter, PhysicsBody } from './PhysicsAdapter';

/** Ring geometry constants (must match RingRenderer defaults). */
const RING_WIDTH = 6;
const RING_DEPTH = 6;
const RING_HEIGHT = 1.2;
const MAT_THICKNESS = 0.08;
const BARRICADE_DISTANCE = 5;
const BARRICADE_HEIGHT = 1.1;
const BARRICADE_THICKNESS = 0.08;

/**
 * Static factory for creating pre-configured physics bodies that
 * correspond to game entities (wrestlers, ring surfaces, barricades).
 *
 * Uses a shared EntityId namespace where ring/environment bodies
 * occupy IDs in the high range (90000+) to avoid collisions with
 * game-spawned entities.
 */
export class BodyFactory {
	/** Auto-incrementing ID for static environment bodies. */
	private static nextEnvId: EntityId = 90_000;

	/**
	 * Create a dynamic capsule body for a wrestler.
	 *
	 * The capsule dimensions are derived from mass category:
	 *   - < 90 kg  (cruiserweight):  r=0.25 hh=0.45
	 *   - < 120 kg (heavyweight):    r=0.30 hh=0.50
	 *   - >= 120 kg (super-heavy):   r=0.38 hh=0.52
	 *
	 * Rotation is locked so the wrestler stays upright; locomotion
	 * is driven by forces / impulses from the AI / input systems.
	 */
	static createWrestler(
		adapter: PhysicsAdapter,
		entityId: EntityId,
		position: Vec3,
		mass: number
	): PhysicsBody {
		let radius: number;
		let halfHeight: number;

		if (mass < 90) {
			radius = 0.25;
			halfHeight = 0.45;
		} else if (mass < 120) {
			radius = 0.3;
			halfHeight = 0.5;
		} else {
			radius = 0.38;
			halfHeight = 0.52;
		}

		return adapter.createBody(entityId, {
			shape: 'capsule',
			dimensions: { radius, halfHeight },
			position,
			mass,
			isStatic: false
		});
	}

	/**
	 * Create the static ring environment bodies:
	 *   [0] ring mat  (box on top of platform)
	 *   [1] floor plane
	 *
	 * Returns an array of PhysicsBody handles.
	 */
	static createRing(adapter: PhysicsAdapter): PhysicsBody[] {
		const bodies: PhysicsBody[] = [];

		// --- Ring mat ---
		const matId = this.nextEnvId++;
		bodies.push(
			adapter.createBody(matId, {
				shape: 'box',
				dimensions: {
					halfX: RING_WIDTH / 2,
					halfY: MAT_THICKNESS / 2,
					halfZ: RING_DEPTH / 2
				},
				position: [0, RING_HEIGHT, 0],
				mass: 0,
				isStatic: true
			})
		);

		// --- Floor plane ---
		const floorId = this.nextEnvId++;
		bodies.push(
			adapter.createBody(floorId, {
				shape: 'plane',
				dimensions: {},
				position: [0, 0, 0],
				mass: 0,
				isStatic: true
			})
		);

		// --- Rope collision bodies (thin boxes at each rope level on each side) ---
		const ropeLevels = [0.4, 0.75, 1.1];
		const ropeThickness = 0.04;
		const hw = RING_WIDTH / 2;
		const hd = RING_DEPTH / 2;

		for (const ropeY of ropeLevels) {
			// +Z side
			const idPZ = this.nextEnvId++;
			bodies.push(
				adapter.createBody(idPZ, {
					shape: 'box',
					dimensions: {
						halfX: hw,
						halfY: ropeThickness / 2,
						halfZ: ropeThickness / 2
					},
					position: [0, RING_HEIGHT + ropeY, hd],
					mass: 0,
					isStatic: true
				})
			);
			// -Z side
			const idNZ = this.nextEnvId++;
			bodies.push(
				adapter.createBody(idNZ, {
					shape: 'box',
					dimensions: {
						halfX: hw,
						halfY: ropeThickness / 2,
						halfZ: ropeThickness / 2
					},
					position: [0, RING_HEIGHT + ropeY, -hd],
					mass: 0,
					isStatic: true
				})
			);
			// +X side
			const idPX = this.nextEnvId++;
			bodies.push(
				adapter.createBody(idPX, {
					shape: 'box',
					dimensions: {
						halfX: ropeThickness / 2,
						halfY: ropeThickness / 2,
						halfZ: hd
					},
					position: [hw, RING_HEIGHT + ropeY, 0],
					mass: 0,
					isStatic: true
				})
			);
			// -X side
			const idNX = this.nextEnvId++;
			bodies.push(
				adapter.createBody(idNX, {
					shape: 'box',
					dimensions: {
						halfX: ropeThickness / 2,
						halfY: ropeThickness / 2,
						halfZ: hd
					},
					position: [-hw, RING_HEIGHT + ropeY, 0],
					mass: 0,
					isStatic: true
				})
			);
		}

		return bodies;
	}

	/**
	 * Create static trigger bodies for the barricade around ringside.
	 * These are thin walls that wrestlers can collide with when thrown
	 * outside the ring.
	 */
	static createBarricade(adapter: PhysicsAdapter): PhysicsBody[] {
		const bodies: PhysicsBody[] = [];
		const bd = BARRICADE_DISTANCE;
		const bh = BARRICADE_HEIGHT;
		const bt = BARRICADE_THICKNESS;

		const sides: Array<{ halfX: number; halfZ: number; pos: Vec3 }> = [
			{
				halfX: bd,
				halfZ: bt / 2,
				pos: [0, bh / 2, bd]
			},
			{
				halfX: bd,
				halfZ: bt / 2,
				pos: [0, bh / 2, -bd]
			},
			{
				halfX: bt / 2,
				halfZ: bd,
				pos: [bd, bh / 2, 0]
			},
			{
				halfX: bt / 2,
				halfZ: bd,
				pos: [-bd, bh / 2, 0]
			}
		];

		for (const side of sides) {
			const id = this.nextEnvId++;
			bodies.push(
				adapter.createBody(id, {
					shape: 'box',
					dimensions: {
						halfX: side.halfX,
						halfY: bh / 2,
						halfZ: side.halfZ
					},
					position: side.pos,
					mass: 0,
					isStatic: true
				})
			);
		}

		return bodies;
	}

	/**
	 * Reset the environment ID counter (useful between matches / tests).
	 */
	static resetEnvIds(): void {
		this.nextEnvId = 90_000;
	}
}
