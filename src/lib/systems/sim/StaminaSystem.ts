import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase } from '../../utils/types';
import type { Stamina } from '../../components/combat/Stamina';
import type { CombatState } from '../../components/combat/CombatState';
import { clamp } from '../../utils/math';

/**
 * StaminaSystem
 *
 * Manages stamina regeneration for all entities with a Stamina component.
 *
 * Regeneration rules:
 *  - Stamina regenerates at staminaData.regenRate per second (scaled by dt)
 *  - Regeneration is paused during active move phases (windup/active)
 *  - Regeneration rate is halved during recovery phase
 *  - Below the exhaustion threshold, moves are slower and deal less damage
 *    (handled by other systems reading the threshold)
 *  - Stamina is clamped to [0, max]
 *
 * When stamina crosses below the exhaustion threshold, this is logged
 * for AI observation but no event is emitted (it is a continuous state).
 */
export class StaminaSystem extends System {
	readonly name = 'StaminaSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 25;

	private staminaQuery = new Query(['Stamina']);

	execute(world: World, dt: number, _eventBus: EventBus): void {
		const results = this.staminaQuery.execute(world);

		for (const { entity, components } of results) {
			const stamina = components.get('Stamina') as Stamina;

			// Determine regeneration rate modifier based on combat state
			const combatState = world.getComponent<CombatState>(entity, 'CombatState');
			let regenModifier = 1.0;

			if (combatState) {
				switch (combatState.phase) {
					case 'windup':
					case 'active':
						// No regen during active combat
						regenModifier = 0;
						break;
					case 'recovery':
						// Half regen during recovery
						regenModifier = 0.5;
						break;
					case 'stun':
					case 'grounded':
						// Slight regen while stunned/grounded (wrestler is resting, technically)
						regenModifier = 0.75;
						break;
					case 'grappled':
						// Very slow regen while grappled
						regenModifier = 0.25;
						break;
					case 'idle':
						// Full regen when idle
						regenModifier = 1.0;
						break;
				}
			}

			const regenAmount = stamina.regenRate * dt * regenModifier;
			const newCurrent = clamp(stamina.current + regenAmount, 0, stamina.max);

			// Only update if value actually changed (avoid unnecessary writes)
			if (Math.abs(newCurrent - stamina.current) > 0.001) {
				world.addComponent(entity, 'Stamina', {
					...stamina,
					current: newCurrent
				});
			}
		}
	}
}
