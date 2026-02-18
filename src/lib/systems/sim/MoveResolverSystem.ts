import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, BodyRegion } from '../../utils/types';
import type { AgentDecision } from '../../components/agent/AgentDecision';
import type { CombatState } from '../../components/combat/CombatState';
import type { Stamina } from '../../components/combat/Stamina';
import type { Momentum } from '../../components/combat/Momentum';

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
	requiresGrapple?: boolean;
	requiresFinisher?: boolean;
}

/**
 * MoveResolverSystem
 *
 * Takes agent decisions and resolves them into actual combat moves.
 * This is the gatekeeper between "I want to do X" and "X is actually happening."
 *
 * Validation checks:
 *  1. Entity must be in idle (or grappled for grapple moves) combat phase
 *  2. Requested move must exist in the moveRegistry
 *  3. Entity must have enough stamina to pay the move cost
 *  4. Finisher moves require momentum >= finisherThreshold
 *  5. Grapple moves require entity to be in grapple state
 *
 * Priority resolution: When two entities attempt moves that would collide
 * (both attacking at the same time), the entity with fewer windup frames
 * wins the priority check. The other entity's move is rejected.
 */
export class MoveResolverSystem extends System {
	readonly name = 'MoveResolverSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 8;

	private decisionQuery = new Query(['AgentDecision', 'CombatState', 'Stamina']);

	execute(world: World, _dt: number, eventBus: EventBus): void {
		const moveRegistry = world.getResource<Map<string, MoveData>>('moveRegistry');
		if (!moveRegistry) return;

		const results = this.decisionQuery.execute(world);

		// Collect all valid move attempts for priority resolution
		const moveAttempts: Array<{
			entity: EntityId;
			moveData: MoveData;
			decision: AgentDecision;
			combatState: CombatState;
			stamina: Stamina;
		}> = [];

		for (const { entity, components } of results) {
			const decision = components.get('AgentDecision') as AgentDecision;
			const combatState = components.get('CombatState') as CombatState;
			const stamina = components.get('Stamina') as Stamina;

			// Only idle entities can start new moves (grappled entities handled separately)
			if (decision.action === 'idle' || decision.action === 'block' || decision.action === 'grapple') {
				// Handle blocking
				if (decision.action === 'block' && combatState.phase === 'idle') {
					world.addComponent(entity, 'CombatState', {
						...combatState,
						blocking: true
					});
				} else if (decision.action !== 'block' && combatState.blocking) {
					world.addComponent(entity, 'CombatState', {
						...combatState,
						blocking: false
					});
				}
				continue;
			}

			if (combatState.phase !== 'idle' && combatState.phase !== 'grappled') {
				continue;
			}

			// Check if move exists in registry
			const moveData = moveRegistry.get(decision.action);
			if (!moveData) continue;

			// Check grapple requirement
			if (moveData.requiresGrapple && combatState.phase !== 'grappled') continue;
			if (!moveData.requiresGrapple && combatState.phase === 'grappled') continue;

			// Check stamina cost
			if (stamina.current < moveData.staminaCost) continue;

			// Check finisher requirement
			if (moveData.requiresFinisher) {
				const momentum = world.getComponent<Momentum>(entity, 'Momentum');
				if (!momentum || momentum.value < momentum.finisherThreshold) continue;
			}

			moveAttempts.push({ entity, moveData, decision, combatState, stamina });
		}

		// Priority resolution: check for simultaneous attacks
		const rejected = new Set<EntityId>();

		for (let i = 0; i < moveAttempts.length; i++) {
			if (rejected.has(moveAttempts[i].entity)) continue;

			for (let j = i + 1; j < moveAttempts.length; j++) {
				if (rejected.has(moveAttempts[j].entity)) continue;

				const a = moveAttempts[i];
				const b = moveAttempts[j];

				// Check if they target each other (direct collision)
				const aTargetsB = a.decision.target === b.entity;
				const bTargetsA = b.decision.target === a.entity;

				if (aTargetsB && bTargetsA) {
					// Both attacking each other: faster windup wins
					if (a.moveData.windupFrames <= b.moveData.windupFrames) {
						rejected.add(b.entity);
					} else {
						rejected.add(a.entity);
					}
				}
			}
		}

		// Execute valid moves
		for (const attempt of moveAttempts) {
			if (rejected.has(attempt.entity)) {
				// Rejected entity gets a stun penalty
				world.addComponent(attempt.entity, 'CombatState', {
					...attempt.combatState,
					phase: 'stun',
					phaseFramesLeft: 10,
					vulnerable: true
				});
				continue;
			}

			// Deduct stamina
			world.addComponent(attempt.entity, 'Stamina', {
				...attempt.stamina,
				current: Math.max(0, attempt.stamina.current - attempt.moveData.staminaCost)
			});

			// If finisher, consume momentum
			if (attempt.moveData.requiresFinisher) {
				const momentum = world.getComponent<Momentum>(attempt.entity, 'Momentum');
				if (momentum) {
					world.addComponent(attempt.entity, 'Momentum', {
						...momentum,
						value: 0
					});
				}
			}

			// Create ActiveMove component
			world.commandBuffer.addComponent(attempt.entity, 'ActiveMove', {
				_type: 'ActiveMove' as const,
				moveId: attempt.moveData.id,
				startFrame: 0,
				targetId: attempt.decision.target,
				movePhase: 'windup' as const,
				hitConfirmed: false
			});

			// Transition to windup phase
			world.addComponent(attempt.entity, 'CombatState', {
				...attempt.combatState,
				phase: 'windup',
				phaseFramesLeft: attempt.moveData.windupFrames,
				vulnerable: false,
				blocking: false
			});

			eventBus.emit('combat:move_started', {
				entity: attempt.entity,
				moveId: attempt.moveData.id,
				frame: 0
			});
		}
	}
}
