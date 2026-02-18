import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { DramaState } from '../../components/psychology/DramaState';
import type { CombatState } from '../../components/combat/CombatState';
import type { CrowdHeat } from '../../components/psychology/CrowdHeat';
import type { ActiveMove } from '../../components/combat/ActiveMove';
import type { GrappleState } from '../../components/combat/GrappleState';

/**
 * Camera preset types that map to actual camera positions/angles.
 */
type CameraPreset = 'wide' | 'medium' | 'closeup' | 'over_shoulder' | 'crowd' | 'aerial' | 'ringside' | 'hard_cam';

/**
 * Camera state resource written to the world.
 */
interface CameraState {
	preset: CameraPreset;
	target: EntityId;
	transitionDuration: number; // frames to blend between angles
	holdDuration: number; // frames to hold this angle
	remainingHold: number;
}

/**
 * CameraDirectorSystem
 *
 * Selects camera angles based on the dramatic context of the match.
 * This is the virtual camera director, making the same kind of decisions
 * that Kevin Dunn makes during a live WWE broadcast.
 *
 * Camera selection logic:
 *   - 'wide' (hard_cam): Default for normal action
 *   - 'medium': During sustained offense sequences
 *   - 'closeup': On finisher attempts, high-tension moments
 *   - 'over_shoulder': During grapple positions
 *   - 'crowd': On big crowd pops (reactions matter)
 *   - 'aerial': For aerial moves (top rope, springboard)
 *   - 'ringside': During rest holds or submission attempts
 *
 * The system avoids excessive camera cuts by enforcing a minimum hold
 * duration for each preset. Rapid cuts are reserved for high-drama moments.
 */
export class CameraDirectorSystem extends System {
	readonly name = 'CameraDirectorSystem';
	readonly phase: Phase = 'cinematic';
	readonly priority = 0;

	private combatQuery = new Query(['CombatState', 'DramaState']);

	/** Minimum frames between camera cuts. */
	private static readonly MIN_HOLD_FRAMES = 30;

	/** Hold durations per preset type. */
	private static readonly HOLD_DURATIONS: Record<CameraPreset, number> = {
		wide: 120,
		medium: 60,
		closeup: 45,
		over_shoulder: 90,
		crowd: 45,
		aerial: 30,
		ringside: 90,
		hard_cam: 120
	};

	execute(world: World, _dt: number, eventBus: EventBus): void {
		let cameraState = world.getResource<CameraState>('cameraState');

		// Initialize camera state if not present
		if (!cameraState) {
			cameraState = {
				preset: 'wide',
				target: 0,
				transitionDuration: 15,
				holdDuration: CameraDirectorSystem.HOLD_DURATIONS.wide,
				remainingHold: CameraDirectorSystem.HOLD_DURATIONS.wide
			};
			world.setResource('cameraState', cameraState);
		}

		// Decrement hold timer
		cameraState.remainingHold--;

		// Don't cut if still within minimum hold
		if (cameraState.remainingHold > 0) {
			world.setResource('cameraState', cameraState);
			return;
		}

		// Evaluate what camera angle to use next
		const results = this.combatQuery.execute(world);
		if (results.length === 0) return;

		let bestPreset: CameraPreset = 'wide';
		let bestTarget: EntityId = results[0].entity;
		let bestPriority = 0;

		for (const { entity, components } of results) {
			const combatState = components.get('CombatState') as CombatState;
			const dramaState = components.get('DramaState') as DramaState;

			// Check for finisher/closeup moments
			const activeMove = world.getComponent<ActiveMove>(entity, 'ActiveMove');
			if (activeMove) {
				const moveRegistry = world.getResource<Map<string, { category: string }>>('moveRegistry');
				const moveData = moveRegistry?.get(activeMove.moveId);

				if (moveData?.category === 'finisher' && bestPriority < 10) {
					bestPreset = 'closeup';
					bestTarget = entity;
					bestPriority = 10;
				} else if (moveData?.category === 'aerial' && bestPriority < 7) {
					bestPreset = 'aerial';
					bestTarget = entity;
					bestPriority = 7;
				} else if (moveData?.category === 'signature' && bestPriority < 6) {
					bestPreset = 'medium';
					bestTarget = entity;
					bestPriority = 6;
				}
			}

			// Check for grapple (over_shoulder)
			const grappleState = world.getComponent<GrappleState>(entity, 'GrappleState');
			if (grappleState?.inGrapple && bestPriority < 4) {
				bestPreset = 'over_shoulder';
				bestTarget = entity;
				bestPriority = 4;
			}

			// Check for high drama (closeup on reaction)
			if (dramaState.tension >= 0.8 && bestPriority < 8) {
				bestPreset = 'closeup';
				bestTarget = entity;
				bestPriority = 8;
			}

			// Check for stun/grounded (ringside sympathy shot)
			if ((combatState.phase === 'stun' || combatState.phase === 'grounded') && bestPriority < 3) {
				bestPreset = 'ringside';
				bestTarget = entity;
				bestPriority = 3;
			}

			// Check for crowd reaction
			const crowdHeat = world.getComponent<CrowdHeat>(entity, 'CrowdHeat');
			if (crowdHeat && crowdHeat.pop >= 80 && bestPriority < 5) {
				bestPreset = 'crowd';
				bestTarget = entity;
				bestPriority = 5;
			}
		}

		// Only emit camera cut if the preset or target changed
		if (bestPreset !== cameraState.preset || bestTarget !== cameraState.target) {
			const holdDuration = CameraDirectorSystem.HOLD_DURATIONS[bestPreset];
			const transitionDuration = bestPriority >= 8 ? 5 : 15; // Snap cuts for high-priority moments

			cameraState = {
				preset: bestPreset,
				target: bestTarget,
				transitionDuration,
				holdDuration,
				remainingHold: holdDuration
			};

			world.setResource('cameraState', cameraState);

			eventBus.emit('cinematic:camera_cut', {
				preset: bestPreset,
				target: bestTarget,
				duration: transitionDuration
			});
		} else {
			// Reset hold for same angle
			cameraState.remainingHold = CameraDirectorSystem.HOLD_DURATIONS[cameraState.preset];
			world.setResource('cameraState', cameraState);
		}
	}
}
