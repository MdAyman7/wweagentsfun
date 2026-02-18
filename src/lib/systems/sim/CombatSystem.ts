import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, BodyRegion } from '../../utils/types';
import type { ActiveMove } from '../../components/combat/ActiveMove';
import type { CombatState } from '../../components/combat/CombatState';
import type { Transform } from '../../components/spatial/Transform';
import { vec3Distance } from '../../utils/math';

/**
 * Move data from the move registry.
 */
interface MoveData {
	id: string;
	windupFrames: number;
	activeFrames: number;
	recoveryFrames: number;
	hitRange: number;
	region: BodyRegion;
	baseDamage: number;
	staminaCost: number;
	category: string;
}

/**
 * CombatSystem
 *
 * Advances the move finite state machine for all entities currently
 * executing a move (those with ActiveMove + CombatState components).
 *
 * Move lifecycle:
 *   windup -> active -> recovery -> idle
 *
 * On windup->active transition: hit detection via distance check.
 * On active->recovery transition: reset hit flag.
 * On recovery->idle: remove ActiveMove component, entity can act again.
 *
 * Hit detection is intentionally simple: if the attacker and target are
 * within the move's hitRange during the active phase, the hit connects.
 * This can be enhanced with hitbox/hurtbox collision later.
 */
export class CombatSystem extends System {
	readonly name = 'CombatSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 10;

	private activeMoveQuery = new Query(['ActiveMove', 'CombatState']);

	execute(world: World, _dt: number, eventBus: EventBus): void {
		const moveRegistry = world.getResource<Map<string, MoveData>>('moveRegistry');
		const results = this.activeMoveQuery.execute(world);

		for (const { entity, components } of results) {
			const activeMove = components.get('ActiveMove') as ActiveMove;
			const combatState = components.get('CombatState') as CombatState;

			// Look up move data for frame timings
			const moveData = moveRegistry?.get(activeMove.moveId);
			// If move not found in registry, use conservative defaults
			const windupFrames = moveData?.windupFrames ?? 6;
			const activeFrames = moveData?.activeFrames ?? 4;
			const recoveryFrames = moveData?.recoveryFrames ?? 8;
			const hitRange = moveData?.hitRange ?? 2.0;
			const region = moveData?.region ?? 'body';

			// Decrement phase timer
			const framesLeft = combatState.phaseFramesLeft - 1;

			if (framesLeft <= 0) {
				// Phase transition
				switch (activeMove.movePhase) {
					case 'windup': {
						// Transition to active: perform hit detection
						const hitLanded = this.checkHit(world, entity, activeMove.targetId, hitRange);

						if (hitLanded && activeMove.targetId !== null) {
							// Check if defender is vulnerable
							const defenderCombat = world.getComponent<CombatState>(
								activeMove.targetId, 'CombatState'
							);
							const isVulnerable = defenderCombat?.vulnerable ?? true;
							const isBlocking = defenderCombat?.blocking ?? false;

							if (isVulnerable && !isBlocking) {
								eventBus.emit('combat:move_hit', {
									attacker: entity,
									defender: activeMove.targetId,
									moveId: activeMove.moveId,
									damage: moveData?.baseDamage ?? 5,
									region
								});

								world.addComponent(entity, 'ActiveMove', {
									...activeMove,
									movePhase: 'active',
									hitConfirmed: true
								});
							} else if (isBlocking) {
								eventBus.emit('combat:move_blocked', {
									attacker: entity,
									defender: activeMove.targetId,
									moveId: activeMove.moveId,
									chipDamage: Math.floor((moveData?.baseDamage ?? 5) * 0.1)
								});

								world.addComponent(entity, 'ActiveMove', {
									...activeMove,
									movePhase: 'active',
									hitConfirmed: false
								});
							} else {
								// Invulnerable (iframes)
								world.addComponent(entity, 'ActiveMove', {
									...activeMove,
									movePhase: 'active',
									hitConfirmed: false
								});
							}
						} else {
							// Miss
							eventBus.emit('combat:move_missed', {
								entity,
								moveId: activeMove.moveId
							});

							world.addComponent(entity, 'ActiveMove', {
								...activeMove,
								movePhase: 'active',
								hitConfirmed: false
							});
						}

						// Set active phase frames
						world.addComponent(entity, 'CombatState', {
							...combatState,
							phase: 'active',
							phaseFramesLeft: activeFrames
						});
						break;
					}

					case 'active': {
						// Transition to recovery
						world.addComponent(entity, 'ActiveMove', {
							...activeMove,
							movePhase: 'recovery'
						});
						world.addComponent(entity, 'CombatState', {
							...combatState,
							phase: 'recovery',
							phaseFramesLeft: recoveryFrames
						});
						break;
					}

					case 'recovery': {
						// Move complete: return to idle and remove ActiveMove
						world.addComponent(entity, 'CombatState', {
							...combatState,
							phase: 'idle',
							phaseFramesLeft: 0,
							vulnerable: true
						});
						world.commandBuffer.removeComponent(entity, 'ActiveMove');
						break;
					}
				}
			} else {
				// Still in current phase, just decrement
				world.addComponent(entity, 'CombatState', {
					...combatState,
					phaseFramesLeft: framesLeft
				});
			}
		}
	}

	/**
	 * Simple distance-based hit detection.
	 * Returns true if attacker is within hitRange of target.
	 */
	private checkHit(
		world: World,
		attacker: EntityId,
		target: EntityId | null,
		hitRange: number
	): boolean {
		if (target === null) return false;

		const attackerTransform = world.getComponent<Transform>(attacker, 'Transform');
		const targetTransform = world.getComponent<Transform>(target, 'Transform');

		if (!attackerTransform || !targetTransform) return false;

		const distance = vec3Distance(attackerTransform.position, targetTransform.position);
		return distance <= hitRange;
	}
}
