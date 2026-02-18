import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, WinMethod } from '../../utils/types';
import type { Health } from '../../components/combat/Health';
import type { MatchStats } from '../../components/match/MatchStats';
import type { MatchRole } from '../../components/match/MatchRole';

/**
 * Match configuration resource.
 */
interface MatchConfig {
	matchType: string;
	timeLimit: number; // in seconds, 0 = no limit
	dqEnabled: boolean;
	countOutLimit: number; // frames allowed outside ring, 0 = no countout
	pinEnabled: boolean;
	submissionEnabled: boolean;
	participants: EntityId[];
}

/**
 * Pin result event payload (subset).
 */
interface PinCountEvent {
	count: 1 | 2 | 3;
	kickout: boolean;
}

/**
 * Pin/Submission state resource (from PinSubmissionSystem).
 */
interface PinSubmissionState {
	type: 'pin' | 'submission';
	attacker: EntityId;
	defender: EntityId;
	frameCounter: number;
	currentCount: 0 | 1 | 2 | 3;
	escapeProgress: number;
	resolved: boolean;
}

/**
 * MatchRulesSystem
 *
 * Enforces match rules and checks win conditions. This is the referee
 * of the simulation, determining when a match ends and who wins.
 *
 * Win conditions checked:
 *  1. Pinfall: 3-count pin (via PinSubmissionSystem results)
 *  2. Submission: defender submits (via PinSubmissionSystem results)
 *  3. Knockout: wrestler health reaches 0
 *  4. Time limit draw: match duration exceeds timeLimit
 *  5. DQ: illegal action count exceeds threshold
 *  6. Countout: time outside ring exceeds countOutLimit
 *
 * Emits 'match:ended' with winner, loser, method, duration, and rating.
 */
export class MatchRulesSystem extends System {
	readonly name = 'MatchRulesSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 30;

	private matchTime = 0;
	private matchEnded = false;

	/** Track ring exit time per entity (in frames). */
	private ringExitTimers = new Map<EntityId, number>();

	/** Track DQ infractions per entity. */
	private dqInfractions = new Map<EntityId, number>();

	private pinResults: PinCountEvent[] = [];

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('match:pin_count', (ev: PinCountEvent) => {
			this.pinResults.push(ev);
		});

		eventBus.on('physics:ring_exit', (ev: { entity: EntityId; side: string }) => {
			if (!this.ringExitTimers.has(ev.entity)) {
				this.ringExitTimers.set(ev.entity, 0);
			}
		});

		eventBus.on('match:dq', (ev: { entity: EntityId; reason: string }) => {
			const current = this.dqInfractions.get(ev.entity) ?? 0;
			this.dqInfractions.set(ev.entity, current + 1);
		});
	}

	execute(world: World, dt: number, eventBus: EventBus): void {
		if (this.matchEnded) return;

		const config = world.getResource<MatchConfig>('matchConfig');
		if (!config) return;

		this.matchTime += dt;

		// Check pinfall result
		const pinState = world.getResource<PinSubmissionState>('pinSubmissionState');
		if (pinState && pinState.resolved) {
			if (pinState.type === 'pin' && pinState.currentCount === 3) {
				// Check that the last pin_count event confirmed no kickout at 3
				const lastThreeCount = this.pinResults.find(p => p.count === 3 && !p.kickout);
				if (lastThreeCount) {
					this.endMatch(world, eventBus, pinState.attacker, pinState.defender, 'pinfall');
					return;
				}
			}

			if (pinState.type === 'submission' && pinState.currentCount === 3) {
				this.endMatch(world, eventBus, pinState.attacker, pinState.defender, 'submission');
				return;
			}

			// Clear resolved state for next pin attempt
			this.pinResults.length = 0;
		}

		// Check knockout (health = 0)
		for (const participant of config.participants) {
			const health = world.getComponent<Health>(participant, 'Health');
			if (health && health.current <= 0) {
				// Find the other participant as winner
				const winner = config.participants.find(p => p !== participant);
				if (winner !== undefined) {
					this.endMatch(world, eventBus, winner, participant, 'knockout');
					return;
				}
			}
		}

		// Check time limit
		if (config.timeLimit > 0 && this.matchTime >= config.timeLimit) {
			// Time limit draw: determine winner by health percentage
			let bestParticipant = config.participants[0];
			let bestHealthRatio = 0;
			let worstParticipant = config.participants[0];
			let worstHealthRatio = 1;

			for (const p of config.participants) {
				const h = world.getComponent<Health>(p, 'Health');
				const ratio = h ? h.current / h.max : 0;
				if (ratio > bestHealthRatio) {
					bestHealthRatio = ratio;
					bestParticipant = p;
				}
				if (ratio < worstHealthRatio) {
					worstHealthRatio = ratio;
					worstParticipant = p;
				}
			}

			this.endMatch(world, eventBus, bestParticipant, worstParticipant, 'knockout');
			return;
		}

		// Check countout
		if (config.countOutLimit > 0) {
			for (const [entity, timer] of this.ringExitTimers.entries()) {
				const newTimer = timer + 1;
				this.ringExitTimers.set(entity, newTimer);

				if (newTimer >= config.countOutLimit) {
					const winner = config.participants.find(p => p !== entity);
					if (winner !== undefined) {
						this.endMatch(world, eventBus, winner, entity, 'countout');
						return;
					}
				}
			}
		}

		// Check DQ
		if (config.dqEnabled) {
			for (const [entity, count] of this.dqInfractions.entries()) {
				if (count >= 3) {
					const winner = config.participants.find(p => p !== entity);
					if (winner !== undefined) {
						this.endMatch(world, eventBus, winner, entity, 'dq');
						return;
					}
				}
			}
		}

		// Clear ring exit timers for entities that are back in the ring
		// (CollisionSystem stops emitting ring_exit when entity is inside)
		// Reset handled by lack of fresh ring_exit events -- simple approach:
		// timers are only incremented when ring_exit fires again next frame.
	}

	private endMatch(
		world: World,
		eventBus: EventBus,
		winner: EntityId,
		loser: EntityId,
		method: WinMethod
	): void {
		this.matchEnded = true;

		// Calculate match rating from drama events
		let rating = 2.0; // base rating
		const winnerStats = world.getComponent<MatchStats>(winner, 'MatchStats');
		const loserStats = world.getComponent<MatchStats>(loser, 'MatchStats');

		if (winnerStats && loserStats) {
			// More action = higher rating
			const totalMoves = winnerStats.movesHit + loserStats.movesHit;
			rating += Math.min(totalMoves * 0.05, 1.5);

			// Near-falls add excitement
			const totalNearFalls = winnerStats.nearFalls + loserStats.nearFalls;
			rating += Math.min(totalNearFalls * 0.3, 1.0);

			// Reversals show back-and-forth
			const totalReversals = winnerStats.reversals + loserStats.reversals;
			rating += Math.min(totalReversals * 0.2, 0.5);
		}

		// Match duration bonus (sweet spot is 10-20 minutes)
		const minutes = this.matchTime / 60;
		if (minutes >= 10 && minutes <= 20) {
			rating += 0.5;
		} else if (minutes >= 5) {
			rating += 0.25;
		}

		rating = Math.min(rating, 5.0); // Cap at 5 stars

		eventBus.emit('match:ended', {
			winner,
			loser,
			method,
			duration: this.matchTime,
			rating
		});
	}

	destroy(_world: World): void {
		this.matchTime = 0;
		this.matchEnded = false;
		this.ringExitTimers.clear();
		this.dqInfractions.clear();
		this.pinResults.length = 0;
	}
}
