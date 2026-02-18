import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { Fatigue } from '../../components/psychology/Fatigue';
import type { Stamina } from '../../components/combat/Stamina';
import type { Health } from '../../components/combat/Health';
import type { AgentBrain } from '../../components/agent/AgentBrain';
import { clamp } from '../../utils/math';

/** Mental fatigue accumulation rate per second. */
const MENTAL_FATIGUE_RATE = 0.15;

/** Physical fatigue increase per move executed. */
const PHYSICAL_FATIGUE_PER_MOVE = 2.5;

/** Maximum additional cooldown frames from fatigue. */
const MAX_FATIGUE_COOLDOWN_PENALTY = 12;

/** Fatigue level at which oversell tendency starts increasing. */
const OVERSELL_FATIGUE_THRESHOLD = 50;

interface MoveStartedEvent {
	entity: EntityId;
	moveId: string;
	frame: number;
}

/**
 * FatigueSystem
 *
 * Models physical and mental fatigue that accumulates over the course
 * of a match. This creates realistic pacing: early match is crisp and
 * fast, late match is slower and sloppier.
 *
 * Physical fatigue:
 *   - Increases each time a move is executed
 *   - Decreases slowly when stamina is high (rested)
 *   - Affects move damage and speed (via Stamina interaction)
 *
 * Mental fatigue:
 *   - Increases slowly over match duration
 *   - Increases faster when health is low (panic)
 *   - Reduces decision quality by increasing AI cooldown
 *   - This models the "brain fog" of a long, grueling match
 *
 * Oversell tendency:
 *   - Increases as fatigue passes 50%
 *   - Makes the wrestler sell moves more dramatically
 *   - Used by the animation system for stagger/collapse animations
 */
export class FatigueSystem extends System {
	readonly name = 'FatigueSystem';
	readonly phase: Phase = 'psychology';
	readonly priority = 20;

	private fatigueQuery = new Query(['Fatigue', 'Stamina']);
	private pendingMoves: MoveStartedEvent[] = [];

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:move_started', (ev: MoveStartedEvent) => {
			this.pendingMoves.push(ev);
		});
	}

	execute(world: World, dt: number, _eventBus: EventBus): void {
		// Process move executions for physical fatigue
		for (const move of this.pendingMoves) {
			const fatigue = world.getComponent<Fatigue>(move.entity, 'Fatigue');
			if (fatigue) {
				world.addComponent(move.entity, 'Fatigue', {
					...fatigue,
					physical: clamp(fatigue.physical + PHYSICAL_FATIGUE_PER_MOVE, 0, 100)
				});
			}
		}
		this.pendingMoves.length = 0;

		// Update all fatigued entities
		const results = this.fatigueQuery.execute(world);

		for (const { entity, components } of results) {
			const fatigue = components.get('Fatigue') as Fatigue;
			const stamina = components.get('Stamina') as Stamina;

			// Mental fatigue increases over time
			const healthComp = world.getComponent<Health>(entity, 'Health');
			const healthRatio = healthComp ? healthComp.current / healthComp.max : 1.0;
			// Mental fatigue accumulates faster when health is low
			const mentalRate = MENTAL_FATIGUE_RATE * (1 + (1 - healthRatio));
			let newMental = clamp(fatigue.mental + mentalRate * dt, 0, 100);

			// Physical fatigue recovery when stamina is high
			let newPhysical = fatigue.physical;
			const staminaRatio = stamina.current / stamina.max;
			if (staminaRatio > 0.7) {
				newPhysical = clamp(newPhysical - 0.5 * dt, 0, 100);
			}

			// Update oversell tendency based on total fatigue
			const totalFatigue = (newPhysical + newMental) / 2;
			let newOversell = fatigue.oversellTendency;
			if (totalFatigue > OVERSELL_FATIGUE_THRESHOLD) {
				const excess = (totalFatigue - OVERSELL_FATIGUE_THRESHOLD) / (100 - OVERSELL_FATIGUE_THRESHOLD);
				newOversell = clamp(0.3 + excess * 0.7, 0, 1);
			}

			// Apply fatigue penalty to AI decision cooldown
			const brain = world.getComponent<AgentBrain>(entity, 'AgentBrain');
			if (brain) {
				// Scale cooldown penalty with mental fatigue
				const fatiguePenalty = Math.floor((newMental / 100) * MAX_FATIGUE_COOLDOWN_PENALTY);
				const adjustedCooldown = brain.decisionCooldown + fatiguePenalty;

				// Only update if the base value needs to change
				// We modify the effective cooldown by storing fatigue-adjusted value
				if (adjustedCooldown !== brain.decisionCooldown + fatiguePenalty) {
					world.addComponent(entity, 'AgentBrain', {
						...brain,
						decisionCooldown: Math.max(brain.decisionCooldown, 6 + fatiguePenalty)
					});
				}
			}

			// Write back fatigue if changed
			if (Math.abs(newPhysical - fatigue.physical) > 0.01 ||
				Math.abs(newMental - fatigue.mental) > 0.01 ||
				Math.abs(newOversell - fatigue.oversellTendency) > 0.01) {
				world.addComponent(entity, 'Fatigue', {
					...fatigue,
					physical: newPhysical,
					mental: newMental,
					oversellTendency: newOversell
				});
			}
		}
	}

	destroy(_world: World): void {
		this.pendingMoves.length = 0;
	}
}
