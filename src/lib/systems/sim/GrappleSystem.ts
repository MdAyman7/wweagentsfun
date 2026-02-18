import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { GrappleState, GrapplePosition } from '../../components/combat/GrappleState';
import type { AgentDecision } from '../../components/agent/AgentDecision';
import type { CombatState } from '../../components/combat/CombatState';
import type { Stamina } from '../../components/combat/Stamina';
import type { Transform } from '../../components/spatial/Transform';
import { clamp, vec3Distance } from '../../utils/math';

/** Distance threshold for initiating a grapple lockup. */
const GRAPPLE_RANGE = 2.0;

/** Rate at which escape progress increases per dt unit per stamina advantage. */
const ESCAPE_RATE_BASE = 0.02;

/** Escape progress threshold to break free. */
const ESCAPE_THRESHOLD = 1.0;

/**
 * GrappleSystem
 *
 * Manages the grapple lifecycle between two wrestlers:
 *
 * 1. Initiation: When two idle entities both have AgentDecision.action === 'grapple'
 *    and are within range, a lockup is initiated. Both entities enter the
 *    'grappled' combat phase.
 *
 * 2. Position Transitions: The grapple initiator (higher stamina) gets the
 *    advantageous position. Positions can transition based on subsequent decisions.
 *
 * 3. Escape: The disadvantaged wrestler accumulates escape progress based on
 *    their stamina relative to the initiator. When escape progress reaches 1.0,
 *    the grapple breaks.
 *
 * 4. Moves from Grapple: While grappled, agents can request grapple moves
 *    (suplexes, DDTs, etc.) which are resolved by MoveResolverSystem.
 */
export class GrappleSystem extends System {
	readonly name = 'GrappleSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 12;

	private grappleQuery = new Query(['GrappleState', 'CombatState', 'Stamina']);
	private decisionQuery = new Query(['AgentDecision', 'CombatState', 'Transform', 'GrappleState', 'Stamina']);

	execute(world: World, dt: number, eventBus: EventBus): void {
		// Phase 1: Check for new grapple initiations
		this.checkGrappleInitiation(world, dt, eventBus);

		// Phase 2: Update active grapples
		this.updateActiveGrapples(world, dt, eventBus);
	}

	private checkGrappleInitiation(world: World, _dt: number, eventBus: EventBus): void {
		const results = this.decisionQuery.execute(world);

		// Find pairs of entities that both want to grapple and are in idle
		const grapplers: Array<{
			entity: EntityId;
			decision: AgentDecision;
			combatState: CombatState;
			transform: Transform;
			grappleState: GrappleState;
			stamina: Stamina;
		}> = [];

		for (const { entity, components } of results) {
			const decision = components.get('AgentDecision') as AgentDecision;
			const combatState = components.get('CombatState') as CombatState;
			const transform = components.get('Transform') as Transform;
			const grappleState = components.get('GrappleState') as GrappleState;
			const stamina = components.get('Stamina') as Stamina;

			if (decision.action === 'grapple' && combatState.phase === 'idle' && !grappleState.inGrapple) {
				grapplers.push({ entity, decision, combatState, transform, grappleState, stamina });
			}
		}

		// Try to pair up grapplers based on proximity
		const paired = new Set<EntityId>();
		for (let i = 0; i < grapplers.length; i++) {
			if (paired.has(grapplers[i].entity)) continue;

			for (let j = i + 1; j < grapplers.length; j++) {
				if (paired.has(grapplers[j].entity)) continue;

				const dist = vec3Distance(
					grapplers[i].transform.position,
					grapplers[j].transform.position
				);

				if (dist <= GRAPPLE_RANGE) {
					// Initiate grapple. Higher stamina wrestler is the initiator.
					const a = grapplers[i];
					const b = grapplers[j];
					const initiator = a.stamina.current >= b.stamina.current ? a : b;
					const receiver = initiator === a ? b : a;

					// Set grapple state for both
					world.addComponent(initiator.entity, 'GrappleState', {
						...initiator.grappleState,
						inGrapple: true,
						initiator: initiator.entity,
						opponent: receiver.entity,
						position: 'front_facelock' as GrapplePosition,
						escapeProgress: 0
					});

					world.addComponent(receiver.entity, 'GrappleState', {
						...receiver.grappleState,
						inGrapple: true,
						initiator: initiator.entity,
						opponent: initiator.entity,
						position: 'front_facelock' as GrapplePosition,
						escapeProgress: 0
					});

					// Transition both to grappled combat phase
					world.addComponent(initiator.entity, 'CombatState', {
						...initiator.combatState,
						phase: 'grappled',
						phaseFramesLeft: 0,
						vulnerable: false
					});

					world.addComponent(receiver.entity, 'CombatState', {
						...receiver.combatState,
						phase: 'grappled',
						phaseFramesLeft: 0,
						vulnerable: false
					});

					eventBus.emit('combat:move_started', {
						entity: initiator.entity,
						moveId: 'grapple_lockup',
						frame: 0
					});

					paired.add(a.entity);
					paired.add(b.entity);
					break;
				}
			}
		}
	}

	private updateActiveGrapples(world: World, dt: number, eventBus: EventBus): void {
		const results = this.grappleQuery.execute(world);

		// Process each grappled entity
		for (const { entity, components } of results) {
			const grappleState = components.get('GrappleState') as GrappleState;
			const combatState = components.get('CombatState') as CombatState;
			const stamina = components.get('Stamina') as Stamina;

			if (!grappleState.inGrapple || grappleState.opponent === null) continue;

			// Only the non-initiator accumulates escape progress
			if (grappleState.initiator === entity) continue;

			const opponentStamina = world.getComponent<Stamina>(grappleState.opponent, 'Stamina');
			if (!opponentStamina) continue;

			// Escape rate scales with stamina advantage of the trapped wrestler
			const staminaRatio = stamina.current / Math.max(opponentStamina.current, 1);
			const escapeRate = ESCAPE_RATE_BASE * staminaRatio;
			const newProgress = clamp(grappleState.escapeProgress + escapeRate * dt * 60, 0, ESCAPE_THRESHOLD);

			if (newProgress >= ESCAPE_THRESHOLD) {
				// Grapple broken -- free both entities
				this.breakGrapple(world, entity, grappleState.opponent, eventBus);
			} else {
				// Update escape progress
				world.addComponent(entity, 'GrappleState', {
					...grappleState,
					escapeProgress: newProgress
				});
			}
		}
	}

	private breakGrapple(world: World, escapee: EntityId, holder: EntityId, eventBus: EventBus): void {
		// Reset both entities
		for (const eid of [escapee, holder]) {
			const gs = world.getComponent<GrappleState>(eid, 'GrappleState');
			if (gs) {
				world.addComponent(eid, 'GrappleState', {
					...gs,
					inGrapple: false,
					initiator: null,
					opponent: null,
					position: 'neutral' as GrapplePosition,
					escapeProgress: 0
				});
			}

			const cs = world.getComponent<CombatState>(eid, 'CombatState');
			if (cs) {
				world.addComponent(eid, 'CombatState', {
					...cs,
					phase: 'idle',
					phaseFramesLeft: 0,
					vulnerable: true
				});
			}
		}

		eventBus.emit('combat:reversal', {
			reverser: escapee,
			originalMove: 'grapple_hold',
			reversalMove: 'grapple_escape'
		});
	}
}
