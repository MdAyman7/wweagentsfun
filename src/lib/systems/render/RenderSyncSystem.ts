import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, Vec3, Quat } from '../../utils/types';
import type { Transform } from '../../components/spatial/Transform';
import type { Renderable } from '../../components/rendering/Renderable';
import type { AnimationState } from '../../components/rendering/AnimationState';

/**
 * Render state entry for a single entity.
 * This is the data contract between the ECS simulation and the THREE.js renderer.
 */
interface RenderEntry {
	position: Vec3;
	rotation: Quat;
	scale: Vec3;
	meshId: string;
	visible: boolean;
	layer: number;
	castShadow: boolean;
	receiveShadow: boolean;
	animationClipId: string;
	animationFrame: number;
	animationSpeed: number;
}

/**
 * RenderSyncSystem
 *
 * The bridge between the ECS world and the THREE.js renderer.
 * Reads Transform + Renderable components and writes a flat render
 * state map to a world resource that the rendering layer can consume
 * without needing to query the ECS world directly.
 *
 * This decoupling is important because:
 *   1. The renderer runs at display refresh rate, not simulation tick rate
 *   2. The renderer may run in a different thread (OffscreenCanvas)
 *   3. The render state is a stable snapshot, avoiding mid-frame mutations
 *   4. It allows render interpolation between physics ticks
 *
 * The render state is a Map<EntityId, RenderEntry> containing:
 *   - position, rotation, scale (from Transform)
 *   - meshId, visible, layer, shadows (from Renderable)
 *   - animation data (from AnimationState if present)
 *
 * Entities that are not visible or have been destroyed are removed
 * from the render state map to keep it clean.
 */
export class RenderSyncSystem extends System {
	readonly name = 'RenderSyncSystem';
	readonly phase: Phase = 'presentation';
	readonly priority = 100;

	private renderQuery = new Query(['Transform', 'Renderable']);

	execute(world: World, _dt: number, _eventBus: EventBus): void {
		let renderState = world.getResource<Map<EntityId, RenderEntry>>('renderState');

		if (!renderState) {
			renderState = new Map();
			world.setResource('renderState', renderState);
		}

		// Track which entities are still alive this frame
		const activeEntities = new Set<EntityId>();

		const results = this.renderQuery.execute(world);

		for (const { entity, components } of results) {
			const transform = components.get('Transform') as Transform;
			const renderable = components.get('Renderable') as Renderable;

			activeEntities.add(entity);

			// Get optional animation state
			const animState = world.getComponent<AnimationState>(entity, 'AnimationState');

			const entry: RenderEntry = {
				position: [transform.position[0], transform.position[1], transform.position[2]],
				rotation: [transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]],
				scale: [transform.scale[0], transform.scale[1], transform.scale[2]],
				meshId: renderable.meshId,
				visible: renderable.visible,
				layer: renderable.layer,
				castShadow: renderable.castShadow,
				receiveShadow: renderable.receiveShadow,
				animationClipId: animState?.clipId ?? 'idle',
				animationFrame: animState?.frame ?? 0,
				animationSpeed: animState?.speed ?? 1.0
			};

			renderState.set(entity, entry);
		}

		// Remove entities that no longer exist or are no longer renderable
		for (const entityId of renderState.keys()) {
			if (!activeEntities.has(entityId)) {
				renderState.delete(entityId);
			}
		}

		world.setResource('renderState', renderState);
	}
}
