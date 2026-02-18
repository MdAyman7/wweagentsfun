import RAPIER from '@dimforge/rapier3d-compat';
import type { EntityId, Vec3, Quat } from '../utils/types';
import type {
	PhysicsAdapter,
	PhysicsBody,
	BodyConfig,
	ContactPair,
	RaycastHit
} from './PhysicsAdapter';

interface TrackedBody {
	rigid: RAPIER.RigidBody;
	collider: RAPIER.Collider;
}

/**
 * Rapier3D-compat implementation of PhysicsAdapter.
 * Uses the WASM-based Rapier physics engine for deterministic
 * rigid-body simulation.
 */
export class RapierPhysicsWorld implements PhysicsAdapter {
	private world!: RAPIER.World;
	private bodies: Map<EntityId, TrackedBody> = new Map();
	/** Reverse lookup: collider handle -> EntityId. */
	private colliderToEntity: Map<number, EntityId> = new Map();
	private initialised = false;

	// ──────────────────────────── lifecycle ────────────────────────────

	async init(): Promise<void> {
		await RAPIER.init();
		const gravity = new RAPIER.Vector3(0, -9.81, 0);
		this.world = new RAPIER.World(gravity);
		this.initialised = true;
	}

	step(dt: number): void {
		if (!this.initialised) return;
		// Rapier internally uses a fixed timestep; we pass dt for integration.
		this.world.timestep = dt;
		this.world.step();
	}

	// ──────────────────────────── body management ────────────────────────────

	createBody(entityId: EntityId, config: BodyConfig): PhysicsBody {
		if (!this.initialised) {
			throw new Error('RapierPhysicsWorld.createBody called before init()');
		}

		// --- Rigid body ---
		let rigidDesc: RAPIER.RigidBodyDesc;
		if (config.isStatic || config.mass === 0) {
			rigidDesc = RAPIER.RigidBodyDesc.fixed();
		} else {
			rigidDesc = RAPIER.RigidBodyDesc.dynamic().setAdditionalMass(config.mass);
		}
		rigidDesc.setTranslation(config.position[0], config.position[1], config.position[2]);

		const rigid = this.world.createRigidBody(rigidDesc);

		// --- Collider ---
		let colliderDesc: RAPIER.ColliderDesc;
		const d = config.dimensions;

		switch (config.shape) {
			case 'capsule':
				colliderDesc = RAPIER.ColliderDesc.capsule(
					d.halfHeight ?? 0.9,
					d.radius ?? 0.3
				);
				break;
			case 'box':
				colliderDesc = RAPIER.ColliderDesc.cuboid(
					d.halfX ?? 0.5,
					d.halfY ?? 0.5,
					d.halfZ ?? 0.5
				);
				break;
			case 'sphere':
				colliderDesc = RAPIER.ColliderDesc.ball(d.radius ?? 0.5);
				break;
			case 'plane':
				// Rapier doesn't have infinite planes; use a very large cuboid
				colliderDesc = RAPIER.ColliderDesc.cuboid(50, 0.01, 50);
				break;
			default:
				throw new Error(`Unknown shape: ${config.shape}`);
		}

		colliderDesc.setFriction(0.5);
		colliderDesc.setRestitution(0.2);
		colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

		const collider = this.world.createCollider(colliderDesc, rigid);

		// Track
		this.bodies.set(entityId, { rigid, collider });
		this.colliderToEntity.set(collider.handle, entityId);

		return { id: rigid.handle, entityId };
	}

	removeBody(entityId: EntityId): void {
		const tracked = this.bodies.get(entityId);
		if (!tracked) return;

		this.colliderToEntity.delete(tracked.collider.handle);
		this.world.removeCollider(tracked.collider, true);
		this.world.removeRigidBody(tracked.rigid);
		this.bodies.delete(entityId);
	}

	// ──────────────────────────── queries ────────────────────────────

	getPosition(entityId: EntityId): Vec3 {
		const tracked = this.bodies.get(entityId);
		if (!tracked) return [0, 0, 0];
		const t = tracked.rigid.translation();
		return [t.x, t.y, t.z];
	}

	getRotation(entityId: EntityId): Quat {
		const tracked = this.bodies.get(entityId);
		if (!tracked) return [0, 0, 0, 1];
		const r = tracked.rigid.rotation();
		return [r.x, r.y, r.z, r.w];
	}

	setPosition(entityId: EntityId, pos: Vec3): void {
		const tracked = this.bodies.get(entityId);
		if (!tracked) return;
		tracked.rigid.setTranslation(new RAPIER.Vector3(pos[0], pos[1], pos[2]), true);
	}

	// ──────────────────────────── forces ────────────────────────────

	applyForce(entityId: EntityId, force: Vec3): void {
		const tracked = this.bodies.get(entityId);
		if (!tracked) return;
		tracked.rigid.addForce(new RAPIER.Vector3(force[0], force[1], force[2]), true);
	}

	applyImpulse(entityId: EntityId, impulse: Vec3): void {
		const tracked = this.bodies.get(entityId);
		if (!tracked) return;
		tracked.rigid.applyImpulse(new RAPIER.Vector3(impulse[0], impulse[1], impulse[2]), true);
	}

	// ──────────────────────────── contacts ────────────────────────────

	getContacts(): ContactPair[] {
		const pairs: ContactPair[] = [];

		this.world.contactPairsWith(undefined as unknown as RAPIER.Collider, (collider2) => {
			// NOTE: contactPairsWith without a first collider is not standard;
			// we iterate all bodies manually instead.
			void collider2;
		});

		// Iterate every tracked body and query contacts against others
		for (const [entityA, trackedA] of this.bodies) {
			this.world.contactPairsWith(trackedA.collider, (collider2) => {
				const entityB = this.colliderToEntity.get(collider2.handle);
				if (entityB === undefined) return;
				// Avoid duplicate pairs (only emit A < B)
				if (entityA >= entityB) return;

				// Find contact manifold data
				this.world.contactPair(trackedA.collider, collider2, (manifold, flipped) => {
					const numContacts = manifold.numSolverContacts();
					if (numContacts === 0) return;

					// Use the first solver contact as representative
					const cp = manifold.solverContactPoint(0);
					if (!cp) return;

					const normal = manifold.localNormal1();
					// Estimate impact force from solver contacts
					const totalForce = numContacts;

					// Normalise the normal from Rapier to our Vec3
					const n: Vec3 = flipped
						? [-normal.x, -normal.y, -normal.z]
						: [normal.x, normal.y, normal.z];

					pairs.push({
						entityA,
						entityB,
						point: [cp.x, cp.y, cp.z],
						normal: n,
						force: totalForce
					});
				});
			});
		}

		return pairs;
	}

	// ──────────────────────────── raycast ────────────────────────────

	raycast(origin: Vec3, direction: Vec3, maxDistance: number): RaycastHit | null {
		const ray = new RAPIER.Ray(
			new RAPIER.Vector3(origin[0], origin[1], origin[2]),
			new RAPIER.Vector3(direction[0], direction[1], direction[2])
		);

		const hit = this.world.castRay(ray, maxDistance, true);
		if (!hit) return null;

		const hitCollider = hit.collider;
		const entityId = this.colliderToEntity.get(hitCollider.handle);
		if (entityId === undefined) return null;

		const hitPoint = ray.pointAt(hit.timeOfImpact);

		return {
			entityId,
			point: [hitPoint.x, hitPoint.y, hitPoint.z],
			distance: hit.timeOfImpact
		};
	}

	// ──────────────────────────── disposal ────────────────────────────

	dispose(): void {
		if (!this.initialised) return;
		this.bodies.clear();
		this.colliderToEntity.clear();
		this.world.free();
		this.initialised = false;
	}
}
