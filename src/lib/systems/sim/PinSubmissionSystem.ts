import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { ActiveMove } from '../../components/combat/ActiveMove';
import type { Health } from '../../components/combat/Health';
import type { Stamina } from '../../components/combat/Stamina';
import type { CombatState } from '../../components/combat/CombatState';
import type { DramaState } from '../../components/psychology/DramaState';
import { clamp } from '../../utils/math';

/** Frames per pin count at 60fps (1 second per count). */
const FRAMES_PER_COUNT = 60;

/** Submission escape base rate per frame. */
const SUBMISSION_ESCAPE_BASE_RATE = 0.005;

/**
 * Pin/Submission tracking resource.
 * Stored as world resource 'pinSubmissionState'.
 */
interface PinSubmissionState {
	type: 'pin' | 'submission';
	attacker: EntityId;
	defender: EntityId;
	frameCounter: number;
	currentCount: 0 | 1 | 2 | 3;
	escapeProgress: number; // For submissions
	resolved: boolean;
}

/**
 * PinSubmissionSystem
 *
 * Handles pin attempts and submission holds, which are the primary
 * win conditions in a wrestling match.
 *
 * Pin mechanics:
 *   - Attacker must have an ActiveMove with moveId === 'pin_attempt'
 *   - Each count takes 60 frames (1 second at 60fps)
 *   - After each count, a kickout check is performed
 *   - Kickout probability is based on defender health:
 *       P(kickout) = (health / maxHealth)^2  (quadratic curve)
 *   - At 3 counts with no kickout, the pin succeeds
 *   - Near-falls (count >= 2 with kickout) generate huge drama
 *
 * Submission mechanics:
 *   - Attacker holds a submission move (category === 'submission')
 *   - Defender accumulates escape progress based on stamina
 *   - If escape progress reaches 1.0, the defender breaks free
 *   - If defender health drops below 10%, submission auto-completes
 */
export class PinSubmissionSystem extends System {
	readonly name = 'PinSubmissionSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 20;

	private activeMoveQuery = new Query(['ActiveMove', 'CombatState']);

	execute(world: World, _dt: number, eventBus: EventBus): void {
		// Check for existing pin/submission in progress
		let state = world.getResource<PinSubmissionState>('pinSubmissionState');

		if (state && !state.resolved) {
			if (state.type === 'pin') {
				this.updatePin(world, state, eventBus);
			} else {
				this.updateSubmission(world, state, eventBus);
			}
			return;
		}

		// Check for new pin attempts or submission holds
		const results = this.activeMoveQuery.execute(world);
		for (const { entity, components } of results) {
			const activeMove = components.get('ActiveMove') as ActiveMove;

			if (activeMove.moveId === 'pin_attempt' && activeMove.targetId !== null) {
				// Check defender is in a pinnable state (grounded or stunned)
				const defenderCombat = world.getComponent<CombatState>(activeMove.targetId, 'CombatState');
				if (!defenderCombat || (defenderCombat.phase !== 'grounded' && defenderCombat.phase !== 'stun')) {
					continue;
				}

				state = {
					type: 'pin',
					attacker: entity,
					defender: activeMove.targetId,
					frameCounter: 0,
					currentCount: 0,
					escapeProgress: 0,
					resolved: false
				};
				world.setResource('pinSubmissionState', state);

				eventBus.emit('match:pin_attempt', {
					pinner: entity,
					pinned: activeMove.targetId,
					frame: 0
				});
				return;
			}

			// Check for submission holds by looking up move data
			if (this.isSubmissionMove(world, activeMove.moveId) && activeMove.targetId !== null) {
				state = {
					type: 'submission',
					attacker: entity,
					defender: activeMove.targetId,
					frameCounter: 0,
					currentCount: 0,
					escapeProgress: 0,
					resolved: false
				};
				world.setResource('pinSubmissionState', state);

				eventBus.emit('combat:submission_lock', {
					attacker: entity,
					defender: activeMove.targetId,
					holdId: activeMove.moveId
				});
				return;
			}
		}
	}

	private updatePin(world: World, state: PinSubmissionState, eventBus: EventBus): void {
		state.frameCounter++;

		// Check if we've reached the next count
		const expectedCount = Math.floor(state.frameCounter / FRAMES_PER_COUNT) as 0 | 1 | 2 | 3;

		if (expectedCount > state.currentCount && expectedCount <= 3) {
			state.currentCount = expectedCount as 1 | 2 | 3;

			// Calculate kickout probability based on defender health
			const defenderHealth = world.getComponent<Health>(state.defender, 'Health');
			if (!defenderHealth) {
				state.resolved = true;
				return;
			}

			const healthRatio = clamp(defenderHealth.current / defenderHealth.max, 0, 1);
			// Quadratic kickout curve: healthier wrestlers kick out more easily
			const kickoutProbability = healthRatio * healthRatio;

			// Use a deterministic pseudo-random based on frame counter
			const roll = this.pseudoRandom(state.frameCounter);
			const kickout = roll < kickoutProbability;

			if (state.currentCount === 3 && !kickout) {
				// Pin successful! 3 count completed.
				eventBus.emit('match:pin_count', { count: 3, kickout: false });
				eventBus.emit('match:pin_count', { count: 3, kickout: false });

				state.resolved = true;
				world.setResource('pinSubmissionState', state);

				// Clean up: remove pin attempt move
				world.commandBuffer.removeComponent(state.attacker, 'ActiveMove');
				return;
			}

			eventBus.emit('match:pin_count', {
				count: state.currentCount as 1 | 2 | 3,
				kickout
			});

			if (kickout) {
				// Near-fall! Update drama state if count was 2+
				if (state.currentCount >= 2) {
					eventBus.emit('match:nearfall', {
						pinned: state.defender,
						count: state.currentCount,
						tension: state.currentCount === 2 ? 0.8 : 0.95
					});

					// Update drama state
					const dramaState = world.getComponent<DramaState>(state.defender, 'DramaState');
					if (dramaState) {
						world.addComponent(state.defender, 'DramaState', {
							...dramaState,
							nearFallCount: dramaState.nearFallCount + 1
						});
					}
				}

				// Pin broken
				state.resolved = true;
				world.setResource('pinSubmissionState', state);

				// Return defender to idle
				world.commandBuffer.updateComponent(state.defender, 'CombatState', (cs: any) => ({
					...cs,
					phase: 'idle',
					phaseFramesLeft: 0,
					vulnerable: true
				}));

				// Remove pin attempt move
				world.commandBuffer.removeComponent(state.attacker, 'ActiveMove');
			}
		}

		world.setResource('pinSubmissionState', state);
	}

	private updateSubmission(world: World, state: PinSubmissionState, eventBus: EventBus): void {
		state.frameCounter++;

		const defenderHealth = world.getComponent<Health>(state.defender, 'Health');
		const defenderStamina = world.getComponent<Stamina>(state.defender, 'Stamina');

		if (!defenderHealth || !defenderStamina) {
			state.resolved = true;
			world.setResource('pinSubmissionState', state);
			return;
		}

		// Auto-submit if health is critically low
		if (defenderHealth.current / defenderHealth.max < 0.1) {
			// Submission victory
			state.resolved = true;
			state.currentCount = 3; // Signal completion
			world.setResource('pinSubmissionState', state);

			world.commandBuffer.removeComponent(state.attacker, 'ActiveMove');
			return;
		}

		// Escape progress based on defender stamina
		const staminaRatio = defenderStamina.current / defenderStamina.max;
		const escapeRate = SUBMISSION_ESCAPE_BASE_RATE * (0.5 + staminaRatio);
		state.escapeProgress = clamp(state.escapeProgress + escapeRate, 0, 1);

		// Drain defender stamina while in submission
		world.commandBuffer.updateComponent(state.defender, 'Stamina', (s: any) => ({
			...s,
			current: Math.max(0, s.current - 0.2)
		}));

		if (state.escapeProgress >= 1.0) {
			// Escape successful
			state.resolved = true;
			world.setResource('pinSubmissionState', state);

			eventBus.emit('combat:rope_break', { entity: state.defender });

			// Return both to idle
			for (const eid of [state.attacker, state.defender]) {
				world.commandBuffer.updateComponent(eid, 'CombatState', (cs: any) => ({
					...cs,
					phase: 'idle',
					phaseFramesLeft: 0,
					vulnerable: true
				}));
			}

			world.commandBuffer.removeComponent(state.attacker, 'ActiveMove');
		}

		world.setResource('pinSubmissionState', state);
	}

	private isSubmissionMove(world: World, moveId: string): boolean {
		const moveRegistry = world.getResource<Map<string, { category: string }>>('moveRegistry');
		if (!moveRegistry) return false;
		const move = moveRegistry.get(moveId);
		return move?.category === 'submission';
	}

	/**
	 * Simple deterministic pseudo-random for kickout rolls.
	 * Not cryptographically secure, but deterministic for replay.
	 */
	private pseudoRandom(seed: number): number {
		const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
		return x - Math.floor(x);
	}
}
