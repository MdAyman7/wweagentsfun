import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { Momentum } from '../../components/combat/Momentum';
import type { CombatState } from '../../components/combat/CombatState';
import { clamp } from '../../utils/math';

/** Momentum gain per successful hit. */
const MOMENTUM_PER_HIT = 8;

/** Bonus momentum for signature moves. */
const MOMENTUM_SIGNATURE_BONUS = 12;

/** Bonus momentum for hitting a stunned opponent. */
const MOMENTUM_STUN_BONUS = 5;

interface MoveHitEvent {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	damage: number;
	region: string;
}

/**
 * MomentumSystem
 *
 * Manages the momentum meter for each wrestler. Momentum represents
 * building excitement and crowd energy behind a wrestler's offense.
 *
 * Momentum mechanics:
 *  - Increases when moves land (via combat:move_hit events)
 *  - Decays over time when the wrestler is idle (not attacking)
 *  - When momentum reaches finisherThreshold, emits 'combat:finisher_ready'
 *  - Momentum resets to 0 when a finisher is executed (handled by MoveResolverSystem)
 *  - Value is clamped to [0, 100]
 *
 * Decay is proportional to how much momentum has been built, creating
 * a "use it or lose it" dynamic that rewards sustained offense.
 */
export class MomentumSystem extends System {
	readonly name = 'MomentumSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 26;

	private momentumQuery = new Query(['Momentum', 'CombatState']);
	private pendingHits: MoveHitEvent[] = [];

	/** Track which entities have already triggered finisher_ready this build-up. */
	private finisherNotified = new Set<EntityId>();

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:move_hit', (ev: MoveHitEvent) => {
			this.pendingHits.push(ev);
		});
	}

	execute(world: World, dt: number, eventBus: EventBus): void {
		const moveRegistry = world.getResource<Map<string, { category: string }>>('moveRegistry');

		// Apply momentum gains from hits
		for (const hit of this.pendingHits) {
			const momentum = world.getComponent<Momentum>(hit.attacker, 'Momentum');
			if (!momentum) continue;

			let gain = MOMENTUM_PER_HIT;

			// Bonus for signature moves
			const moveData = moveRegistry?.get(hit.moveId);
			if (moveData?.category === 'signature') {
				gain += MOMENTUM_SIGNATURE_BONUS;
			}

			// Bonus for hitting stunned opponent
			const defenderCombat = world.getComponent<CombatState>(hit.defender, 'CombatState');
			if (defenderCombat?.phase === 'stun' || defenderCombat?.phase === 'grounded') {
				gain += MOMENTUM_STUN_BONUS;
			}

			const newValue = clamp(momentum.value + gain, 0, 100);

			world.addComponent(hit.attacker, 'Momentum', {
				...momentum,
				value: newValue
			});

			// Check finisher threshold
			if (newValue >= momentum.finisherThreshold && !this.finisherNotified.has(hit.attacker)) {
				this.finisherNotified.add(hit.attacker);
				eventBus.emit('combat:finisher_ready', {
					entity: hit.attacker,
					finisherId: '', // Populated by the agent's moveset
					momentum: newValue
				});
			}
		}
		this.pendingHits.length = 0;

		// Apply momentum decay for idle entities
		const results = this.momentumQuery.execute(world);
		for (const { entity, components } of results) {
			const momentum = components.get('Momentum') as Momentum;
			const combatState = components.get('CombatState') as CombatState;

			// Only decay when idle
			if (combatState.phase !== 'idle') continue;
			if (momentum.value <= 0) continue;

			// Decay is proportional to current momentum (higher = faster decay)
			const decayAmount = momentum.decayRate * dt * (1 + momentum.value / 100);
			const newValue = clamp(momentum.value - decayAmount, 0, 100);

			// If momentum dropped below finisher threshold, allow re-notification
			if (newValue < momentum.finisherThreshold) {
				this.finisherNotified.delete(entity);
			}

			world.addComponent(entity, 'Momentum', {
				...momentum,
				value: newValue
			});
		}
	}

	destroy(_world: World): void {
		this.pendingHits.length = 0;
		this.finisherNotified.clear();
	}
}
