import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { AgentBrain } from '../../components/agent/AgentBrain';
import type { AgentObservation } from '../../components/agent/AgentObservation';

/**
 * Strategy interface that the strategyRegistry resources must satisfy.
 * Each strategy takes an observation vector and returns an action decision.
 */
interface Strategy {
	decide(observation: AgentObservation, entity: EntityId): {
		action: string;
		target: EntityId | null;
		confidence: number;
		reasoning: string;
	};
}

/**
 * DecisionSystem
 *
 * For each agent that has both an AgentBrain and a fresh AgentObservation,
 * runs the configured strategy to produce an AgentDecision.
 *
 * Decision cadence is throttled by the brain's cooldown timer to prevent
 * AI spam and allow for reaction-time modeling.
 *
 * Forced decisions (from ExternalInputSystem / training harness) take
 * priority over strategy output.
 */
export class DecisionSystem extends System {
	readonly name = 'DecisionSystem';
	readonly phase: Phase = 'ai';
	readonly priority = 10;

	private agentQuery = new Query(['AgentBrain', 'AgentObservation']);

	execute(world: World, _dt: number, eventBus: EventBus): void {
		const strategyRegistry = world.getResource<Map<string, Strategy>>('strategyRegistry');
		const forcedDecisions = world.getResource<Map<number, { action: string; target: number | null }>>(
			'forcedDecisions'
		);
		const results = this.agentQuery.execute(world);

		for (const { entity, components } of results) {
			const brain = components.get('AgentBrain') as AgentBrain;
			const observation = components.get('AgentObservation') as AgentObservation;

			// Check for forced decision (from training harness or debug)
			if (forcedDecisions && forcedDecisions.has(entity)) {
				const forced = forcedDecisions.get(entity)!;
				forcedDecisions.delete(entity);

				world.addComponent(entity, 'AgentDecision', {
					_type: 'AgentDecision' as const,
					action: forced.action,
					target: forced.target,
					confidence: 1.0,
					reasoning: 'forced_external'
				});

				eventBus.emit('ai:decision', {
					entity,
					action: forced.action,
					target: forced.target,
					confidence: 1.0
				});

				// Reset cooldown
				world.addComponent(entity, 'AgentBrain', {
					...brain,
					cooldownRemaining: brain.decisionCooldown
				});
				continue;
			}

			// Cooldown gate: decrement and skip if still cooling down
			if (brain.cooldownRemaining > 0) {
				world.addComponent(entity, 'AgentBrain', {
					...brain,
					cooldownRemaining: brain.cooldownRemaining - 1
				});
				continue;
			}

			// Look up the configured strategy
			if (!strategyRegistry) continue;
			const strategy = strategyRegistry.get(brain.strategyId);
			if (!strategy) continue;

			// Run the strategy
			const decision = strategy.decide(observation, entity);

			world.addComponent(entity, 'AgentDecision', {
				_type: 'AgentDecision' as const,
				action: decision.action,
				target: decision.target,
				confidence: decision.confidence,
				reasoning: decision.reasoning
			});

			eventBus.emit('ai:decision', {
				entity,
				action: decision.action,
				target: decision.target,
				confidence: decision.confidence
			});

			// Reset cooldown after making a decision
			world.addComponent(entity, 'AgentBrain', {
				...brain,
				cooldownRemaining: brain.decisionCooldown
			});
		}
	}
}
