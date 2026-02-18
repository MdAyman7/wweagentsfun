import type { EntityId, Vec3, Quat } from '../utils/types';

/** Handle returned when a physics body is created. */
export interface PhysicsBody {
	/** Internal physics-engine body identifier. */
	id: number;
	/** The ECS entity this body belongs to. */
	entityId: EntityId;
}

/** Reported contact between two physics bodies during a step. */
export interface ContactPair {
	entityA: EntityId;
	entityB: EntityId;
	/** World-space contact point. */
	point: Vec3;
	/** Contact normal (pointing from A toward B). */
	normal: Vec3;
	/** Magnitude of the contact force. */
	force: number;
}

/** Collider shape descriptors understood by the adapter. */
export type ColliderShape = 'capsule' | 'box' | 'sphere' | 'plane';

/** Configuration for creating a new physics body. */
export interface BodyConfig {
	shape: ColliderShape;
	/**
	 * Dimensions interpreted per-shape:
	 * - capsule:  { radius, halfHeight }
	 * - box:      { halfX, halfY, halfZ }
	 * - sphere:   { radius }
	 * - plane:    (no dimensions needed)
	 */
	dimensions: Record<string, number>;
	position: Vec3;
	/** Mass in kg.  0 or omitted = static body. */
	mass: number;
	/** If true, the body never moves (overrides mass). */
	isStatic: boolean;
}

/** Raycast hit result. */
export interface RaycastHit {
	entityId: EntityId;
	point: Vec3;
	distance: number;
}

/**
 * Physics engine abstraction layer. Concrete implementations wrap a
 * specific engine (e.g. Rapier) behind this uniform interface so the
 * rest of the simulation never depends on engine internals.
 */
export interface PhysicsAdapter {
	/** Initialise the physics world (may be async for WASM-based engines). */
	init(): Promise<void>;

	/** Advance the simulation by `dt` seconds. */
	step(dt: number): void;

	/** Create a rigid body + collider pair and track it by EntityId. */
	createBody(entityId: EntityId, config: BodyConfig): PhysicsBody;

	/** Remove and destroy the body associated with the given entity. */
	removeBody(entityId: EntityId): void;

	/** Read the current world-space position of a body. */
	getPosition(entityId: EntityId): Vec3;

	/** Read the current world-space rotation of a body. */
	getRotation(entityId: EntityId): Quat;

	/** Teleport a body to a new position. */
	setPosition(entityId: EntityId, pos: Vec3): void;

	/** Apply a continuous force (in Newtons) at the centre of mass. */
	applyForce(entityId: EntityId, force: Vec3): void;

	/** Apply an instantaneous impulse (in N*s) at the centre of mass. */
	applyImpulse(entityId: EntityId, impulse: Vec3): void;

	/** Return all contact pairs generated during the last step. */
	getContacts(): ContactPair[];

	/**
	 * Cast a ray from `origin` along `direction` (normalised) up to
	 * `maxDistance`. Returns the first hit or null.
	 */
	raycast(origin: Vec3, direction: Vec3, maxDistance: number): RaycastHit | null;

	/** Free all resources held by the physics world. */
	dispose(): void;
}
