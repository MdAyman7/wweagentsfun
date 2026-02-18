import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, CombatPhase } from '../../utils/types';
import type { AnimationState } from '../../components/rendering/AnimationState';
import type { CombatState } from '../../components/combat/CombatState';
import type { ActiveMove } from '../../components/combat/ActiveMove';
import type { Fatigue } from '../../components/psychology/Fatigue';
import type { GrappleState } from '../../components/combat/GrappleState';

/**
 * Move animation data from the move registry.
 */
interface MoveAnimData {
	id: string;
	windupClip: string;
	activeClip: string;
	recoveryClip: string;
	category: string;
}

/**
 * Default animation clips for each combat phase.
 */
const DEFAULT_CLIPS: Record<CombatPhase, string> = {
	idle: 'idle',
	windup: 'windup_generic',
	active: 'attack_generic',
	recovery: 'recovery_generic',
	stun: 'stun_react',
	grounded: 'grounded',
	grappled: 'grapple_neutral'
};

/**
 * AnimationSystem
 *
 * Maps the current combat/movement state to animation clips, creating
 * the visual representation of what is happening in the simulation.
 *
 * Animation selection priority:
 *   1. Active move animations (specific windup/active/recovery clips)
 *   2. Grapple position animations
 *   3. Combat phase default animations (idle, stun, grounded)
 *
 * The system also advances the frame counter for the current animation
 * and handles speed adjustments based on:
 *   - Time dilation (slow-motion)
 *   - Fatigue (exhausted wrestlers animate slower)
 *   - Stamina exhaustion (below threshold = sluggish movement)
 *
 * Looping behavior:
 *   - 'idle' and 'grounded' animations loop
 *   - Move animations (windup, active, recovery) play once
 *   - Stun animations play once then transition to idle or grounded
 */
export class AnimationSystem extends System {
	readonly name = 'AnimationSystem';
	readonly phase: Phase = 'presentation';
	readonly priority = 0;

	private animQuery = new Query(['AnimationState', 'CombatState']);

	execute(world: World, dt: number, _eventBus: EventBus): void {
		const moveRegistry = world.getResource<Map<string, MoveAnimData>>('moveRegistry');
		const timeDilation = world.getResource<number>('timeDilation') ?? 1.0;

		const results = this.animQuery.execute(world);

		for (const { entity, components } of results) {
			const animState = components.get('AnimationState') as AnimationState;
			const combatState = components.get('CombatState') as CombatState;

			let newClipId = animState.clipId;
			let newSpeed = 1.0;
			let newLooping = false;

			// Check for active move (highest priority)
			const activeMove = world.getComponent<ActiveMove>(entity, 'ActiveMove');
			if (activeMove) {
				const moveData = moveRegistry?.get(activeMove.moveId);
				if (moveData) {
					switch (activeMove.movePhase) {
						case 'windup':
							newClipId = moveData.windupClip || `windup_${activeMove.moveId}`;
							break;
						case 'active':
							newClipId = moveData.activeClip || `active_${activeMove.moveId}`;
							break;
						case 'recovery':
							newClipId = moveData.recoveryClip || `recovery_${activeMove.moveId}`;
							break;
					}
					newLooping = false;
				} else {
					// Fallback to generic move animations
					newClipId = DEFAULT_CLIPS[combatState.phase] ?? 'idle';
					newLooping = false;
				}
			}
			// Check for grapple position
			else {
				const grappleState = world.getComponent<GrappleState>(entity, 'GrappleState');
				if (grappleState?.inGrapple) {
					newClipId = `grapple_${grappleState.position}`;
					newLooping = true;
				} else {
					// Default combat phase mapping
					newClipId = DEFAULT_CLIPS[combatState.phase] ?? 'idle';
					newLooping = combatState.phase === 'idle' || combatState.phase === 'grounded';
				}
			}

			// Adjust speed based on fatigue
			const fatigue = world.getComponent<Fatigue>(entity, 'Fatigue');
			if (fatigue) {
				// High fatigue slows animations (0.7x at max fatigue)
				const fatigueSpeedMod = 1.0 - (fatigue.physical / 100) * 0.3;
				newSpeed *= fatigueSpeedMod;
			}

			// Apply time dilation
			newSpeed *= timeDilation;

			// Determine if we need to reset the frame counter
			const clipChanged = newClipId !== animState.clipId;
			const newFrame = clipChanged ? 0 : animState.frame + newSpeed * dt * 60;

			world.addComponent(entity, 'AnimationState', {
				...animState,
				clipId: newClipId,
				frame: newFrame,
				speed: newSpeed,
				looping: newLooping
			});
		}
	}
}
