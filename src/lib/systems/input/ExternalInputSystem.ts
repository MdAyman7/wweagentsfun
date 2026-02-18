import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase } from '../../utils/types';

/**
 * Commands that can be injected externally for debugging or training.
 */
interface ExternalCommand {
	type: 'set_speed' | 'force_decision' | 'pause' | 'resume' | 'set_health' | 'trigger_finisher';
	payload: Record<string, unknown>;
}

/**
 * ExternalInputSystem
 *
 * Reads external commands from the 'externalCommands' world resource.
 * This allows external tooling (debug UI, training harness, replay tools)
 * to inject commands into the simulation without breaking the ECS data flow.
 *
 * Supported commands:
 *  - set_speed: Changes simulation speed via timeDilation resource
 *  - force_decision: Overrides an agent's next decision (for RL training)
 *  - pause/resume: Toggle simulation pause state
 *  - set_health: Debug override for entity health
 *  - trigger_finisher: Force finisher availability for testing
 */
export class ExternalInputSystem extends System {
	readonly name = 'ExternalInputSystem';
	readonly phase: Phase = 'input';
	readonly priority = 0;

	execute(world: World, _dt: number, eventBus: EventBus): void {
		const commands = world.getResource<ExternalCommand[]>('externalCommands');
		if (!commands || commands.length === 0) return;

		for (const cmd of commands) {
			switch (cmd.type) {
				case 'set_speed': {
					const speed = cmd.payload['speed'] as number | undefined;
					if (speed !== undefined && speed > 0 && speed <= 10) {
						world.setResource('timeDilation', speed);
					}
					break;
				}

				case 'force_decision': {
					const entityId = cmd.payload['entity'] as number | undefined;
					const action = cmd.payload['action'] as string | undefined;
					const target = (cmd.payload['target'] as number | undefined) ?? null;
					if (entityId !== undefined && action !== undefined) {
						// Write a forced decision that the DecisionSystem will pick up
						// Store per-entity so multiple agents can be overridden
						const forcedDecisions = world.getResource<Map<number, { action: string; target: number | null }>>(
							'forcedDecisions'
						) ?? new Map();
						forcedDecisions.set(entityId, { action, target });
						world.setResource('forcedDecisions', forcedDecisions);
					}
					break;
				}

				case 'pause': {
					world.setResource('paused', true);
					eventBus.emit('system:pause', {});
					break;
				}

				case 'resume': {
					world.setResource('paused', false);
					eventBus.emit('system:resume', {});
					break;
				}

				case 'set_health': {
					const entityId = cmd.payload['entity'] as number | undefined;
					const value = cmd.payload['value'] as number | undefined;
					if (entityId !== undefined && value !== undefined) {
						world.commandBuffer.updateComponent(entityId, 'Health', (h: any) => ({
							...h,
							current: Math.max(0, Math.min(h.max, value))
						}));
					}
					break;
				}

				case 'trigger_finisher': {
					const entityId = cmd.payload['entity'] as number | undefined;
					if (entityId !== undefined) {
						world.commandBuffer.updateComponent(entityId, 'Momentum', (m: any) => ({
							...m,
							value: m.finisherThreshold
						}));
					}
					break;
				}
			}
		}

		// Clear processed commands
		commands.length = 0;
	}
}
