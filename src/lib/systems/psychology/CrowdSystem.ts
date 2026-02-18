import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { CrowdHeat } from '../../components/psychology/CrowdHeat';
import type { MatchRole } from '../../components/match/MatchRole';
import { clamp } from '../../utils/math';

/** Pop intensity values for different event types. */
const POP_VALUES = {
	move_hit: 3,
	signature_hit: 8,
	finisher_hit: 20,
	nearfall: 25,
	reversal: 10,
	submission_lock: 5,
	kickout: 15,
	counter: 12
} as const;

/** Per-second decay rate for crowd pop. */
const POP_DECAY_RATE = 1.5;

/** Per-second decay rate for individual heat. */
const HEAT_DECAY_RATE = 0.3;

interface MoveHitEvent {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	damage: number;
}

interface FinisherHitEvent {
	attacker: EntityId;
	defender: EntityId;
	finisherId: string;
	damage: number;
}

interface NearFallEvent {
	pinned: EntityId;
	count: number;
	tension: number;
}

interface ReversalEvent {
	reverser: EntityId;
	originalMove: string;
	reversalMove: string;
}

interface PinCountEvent {
	count: 1 | 2 | 3;
	kickout: boolean;
}

/**
 * CrowdSystem
 *
 * Simulates crowd reactions to in-ring action. The crowd is modeled as
 * a single entity with a CrowdHeat component, but individual wrestler
 * heat is tracked per-wrestler.
 *
 * The crowd responds to:
 *  - Big moves landing (pop increase)
 *  - Near-falls (huge spike)
 *  - Finishers (maximum pop)
 *  - Reversals and counters (excitement)
 *  - Kickouts (relief/excitement)
 *
 * Sentiment is adjusted based on wrestler alignment:
 *  - Face wrestlers getting hit increases boos
 *  - Heel wrestlers getting hit increases cheers
 *  - Face comeback sequences generate huge pops
 *
 * Pop decays over time toward a baseline, creating a natural ebb and flow.
 */
export class CrowdSystem extends System {
	readonly name = 'CrowdSystem';
	readonly phase: Phase = 'psychology';
	readonly priority = 0;

	private crowdQuery = new Query(['CrowdHeat', 'MatchRole']);

	private pendingPops: Array<{ intensity: number; trigger: string; entity?: EntityId }> = [];

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:move_hit', (ev: MoveHitEvent) => {
			this.pendingPops.push({
				intensity: POP_VALUES.move_hit,
				trigger: 'move_hit',
				entity: ev.attacker
			});
		});

		eventBus.on('combat:finisher_hit', (ev: FinisherHitEvent) => {
			this.pendingPops.push({
				intensity: POP_VALUES.finisher_hit,
				trigger: 'finisher_hit',
				entity: ev.attacker
			});
		});

		eventBus.on('match:nearfall', (ev: NearFallEvent) => {
			this.pendingPops.push({
				intensity: POP_VALUES.nearfall,
				trigger: 'nearfall',
				entity: ev.pinned
			});
		});

		eventBus.on('combat:reversal', (ev: ReversalEvent) => {
			this.pendingPops.push({
				intensity: POP_VALUES.reversal,
				trigger: 'reversal',
				entity: ev.reverser
			});
		});

		eventBus.on('combat:counter', (ev: { counterer: EntityId }) => {
			this.pendingPops.push({
				intensity: POP_VALUES.counter,
				trigger: 'counter',
				entity: ev.counterer
			});
		});

		eventBus.on('match:pin_count', (ev: PinCountEvent) => {
			if (ev.kickout && ev.count >= 2) {
				this.pendingPops.push({
					intensity: POP_VALUES.kickout,
					trigger: 'kickout'
				});
			}
		});

		eventBus.on('combat:submission_lock', (_ev: { attacker: EntityId; defender: EntityId }) => {
			this.pendingPops.push({
				intensity: POP_VALUES.submission_lock,
				trigger: 'submission_lock'
			});
		});
	}

	execute(world: World, dt: number, eventBus: EventBus): void {
		const results = this.crowdQuery.execute(world);

		// Process pending crowd reactions
		for (const pop of this.pendingPops) {
			// Apply pop to all crowd-heat entities (typically one per wrestler)
			for (const { entity, components } of results) {
				const crowdHeat = components.get('CrowdHeat') as CrowdHeat;
				const matchRole = components.get('MatchRole') as MatchRole;

				let popGain = pop.intensity;
				let heatDelta = 0;
				let sentimentShift = 0;

				// Adjust based on alignment
				if (pop.entity !== undefined) {
					const popSourceRole = world.getComponent<MatchRole>(pop.entity, 'MatchRole');
					const isSourceFace = popSourceRole?.alignment === 'face';
					const isSourceHeel = popSourceRole?.alignment === 'heel';

					if (pop.entity === entity) {
						// This wrestler did the action
						heatDelta = pop.intensity * 0.5;
						sentimentShift = isSourceFace ? 0.02 : -0.02;
					} else {
						// This wrestler was acted upon (or bystander)
						if (pop.trigger === 'move_hit' || pop.trigger === 'finisher_hit') {
							// Getting hit generates sympathy for faces, schadenfreude for heels
							if (matchRole.alignment === 'face') {
								sentimentShift = 0.01; // Crowd sympathizes
								heatDelta = pop.intensity * 0.3;
							} else if (matchRole.alignment === 'heel') {
								sentimentShift = -0.01; // Crowd enjoys it
								heatDelta = -pop.intensity * 0.2;
							}
						}
					}
				}

				const newPop = clamp(crowdHeat.pop + popGain, 0, 100);
				const newHeat = clamp(crowdHeat.heat + heatDelta, -100, 100);
				const newSentiment = clamp(crowdHeat.sentiment + sentimentShift, -1, 1);

				world.addComponent(entity, 'CrowdHeat', {
					...crowdHeat,
					pop: newPop,
					heat: newHeat,
					sentiment: newSentiment
				});
			}

			// Emit crowd pop event
			if (pop.intensity >= POP_VALUES.reversal) {
				eventBus.emit('psych:crowd_pop', {
					intensity: pop.intensity,
					trigger: pop.trigger
				});
			}
		}
		this.pendingPops.length = 0;

		// Apply decay
		for (const { entity, components } of results) {
			const crowdHeat = components.get('CrowdHeat') as CrowdHeat;

			const decayedPop = Math.max(30, crowdHeat.pop - POP_DECAY_RATE * dt);
			const decayedHeat = crowdHeat.heat > 0
				? Math.max(0, crowdHeat.heat - HEAT_DECAY_RATE * dt)
				: Math.min(0, crowdHeat.heat + HEAT_DECAY_RATE * dt);

			if (Math.abs(decayedPop - crowdHeat.pop) > 0.01 || Math.abs(decayedHeat - crowdHeat.heat) > 0.01) {
				world.addComponent(entity, 'CrowdHeat', {
					...crowdHeat,
					pop: decayedPop,
					heat: decayedHeat
				});
			}
		}
	}

	destroy(_world: World): void {
		this.pendingPops.length = 0;
	}
}
