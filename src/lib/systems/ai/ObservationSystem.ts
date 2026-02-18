import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { Transform } from '../../components/spatial/Transform';
import type { Health } from '../../components/combat/Health';
import type { Stamina } from '../../components/combat/Stamina';
import type { Momentum } from '../../components/combat/Momentum';
import type { CombatState } from '../../components/combat/CombatState';
import type { AgentBrain } from '../../components/agent/AgentBrain';
import { clamp } from '../../utils/math';
import { vec3Distance } from '../../utils/math';

/**
 * Maps CombatPhase to a numeric value for the observation vector.
 */
const COMBAT_PHASE_MAP: Record<string, number> = {
	idle: 0.0,
	windup: 0.2,
	active: 0.4,
	recovery: 0.6,
	stun: 0.8,
	grounded: 0.9,
	grappled: 1.0
};

/**
 * ObservationSystem
 *
 * Builds a normalized observation vector for each agent entity.
 * This is the perception layer -- it translates raw ECS component data
 * into a fixed-size float vector suitable for RL policies or behavior trees.
 *
 * Observation vector layout:
 *   [0]  selfHealthNorm       - own health / max
 *   [1]  selfStaminaNorm      - own stamina / max
 *   [2]  selfMomentumNorm     - own momentum / 100
 *   [3]  selfCombatPhase      - phase mapped to [0,1]
 *   [4]  selfIsVulnerable     - 1 if vulnerable, 0 otherwise
 *   [5]  selfIsBlocking       - 1 if blocking, 0 otherwise
 *   [6]  opponentHealthNorm   - opponent health / max
 *   [7]  opponentStaminaNorm  - opponent stamina / max
 *   [8]  opponentMomentumNorm - opponent momentum / 100
 *   [9]  opponentCombatPhase  - opponent phase mapped to [0,1]
 *   [10] opponentVulnerable   - 1 if opponent is vulnerable
 *   [11] distanceNorm         - distance to opponent / ring diameter (clamped)
 *   [12] cooldownNorm         - decision cooldown remaining / max cooldown
 */
export class ObservationSystem extends System {
	readonly name = 'ObservationSystem';
	readonly phase: Phase = 'ai';
	readonly priority = 0;

	private agentQuery = new Query(
		['AgentBrain', 'Transform', 'Health', 'Stamina', 'Momentum', 'CombatState']
	);

	/** Approximate ring diameter for normalizing distance. */
	private static readonly RING_DIAMETER = 20.0;

	private static readonly LABELS: string[] = [
		'selfHealthNorm',
		'selfStaminaNorm',
		'selfMomentumNorm',
		'selfCombatPhase',
		'selfIsVulnerable',
		'selfIsBlocking',
		'opponentHealthNorm',
		'opponentStaminaNorm',
		'opponentMomentumNorm',
		'opponentCombatPhase',
		'opponentVulnerable',
		'distanceNorm',
		'cooldownNorm'
	];

	execute(world: World, _dt: number, _eventBus: EventBus): void {
		const results = this.agentQuery.execute(world);
		if (results.length === 0) return;

		for (const result of results) {
			const entity = result.entity;
			const transform = result.components.get('Transform') as Transform;
			const health = result.components.get('Health') as Health;
			const stamina = result.components.get('Stamina') as Stamina;
			const momentum = result.components.get('Momentum') as Momentum;
			const combatState = result.components.get('CombatState') as CombatState;
			const brain = result.components.get('AgentBrain') as AgentBrain;

			// Find opponent: any other entity in the query results
			const opponent = this.findOpponent(entity, results);

			const vector: number[] = [
				// Self state
				clamp(health.current / health.max, 0, 1),
				clamp(stamina.current / stamina.max, 0, 1),
				clamp(momentum.value / 100, 0, 1),
				COMBAT_PHASE_MAP[combatState.phase] ?? 0,
				combatState.vulnerable ? 1 : 0,
				combatState.blocking ? 1 : 0,
				// Opponent state (defaults to 1.0 if no opponent found)
				0, 0, 0, 0, 0,
				// Spatial
				1,
				// Cooldown
				clamp(brain.cooldownRemaining / Math.max(brain.decisionCooldown, 1), 0, 1)
			];

			if (opponent) {
				const oppTransform = opponent.components.get('Transform') as Transform;
				const oppHealth = opponent.components.get('Health') as Health;
				const oppStamina = opponent.components.get('Stamina') as Stamina;
				const oppMomentum = opponent.components.get('Momentum') as Momentum;
				const oppCombat = opponent.components.get('CombatState') as CombatState;

				vector[6] = clamp(oppHealth.current / oppHealth.max, 0, 1);
				vector[7] = clamp(oppStamina.current / oppStamina.max, 0, 1);
				vector[8] = clamp(oppMomentum.value / 100, 0, 1);
				vector[9] = COMBAT_PHASE_MAP[oppCombat.phase] ?? 0;
				vector[10] = oppCombat.vulnerable ? 1 : 0;

				const dist = vec3Distance(transform.position, oppTransform.position);
				vector[11] = clamp(dist / ObservationSystem.RING_DIAMETER, 0, 1);
			}

			world.addComponent(entity, 'AgentObservation', {
				_type: 'AgentObservation' as const,
				vector,
				labels: ObservationSystem.LABELS
			});
		}
	}

	private findOpponent(
		self: EntityId,
		results: { entity: EntityId; components: Map<string, any> }[]
	): { entity: EntityId; components: Map<string, any> } | null {
		for (const r of results) {
			if (r.entity !== self) return r;
		}
		return null;
	}
}
