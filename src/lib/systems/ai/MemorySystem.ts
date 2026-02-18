import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { AgentMemory } from '../../components/agent/AgentMemory';

/** Maximum number of moves to remember in each ring buffer. */
const MAX_MEMORY_ENTRIES = 20;

interface MoveHitEvent {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	damage: number;
	region: string;
}

interface ReversalEvent {
	reverser: EntityId;
	originalMove: string;
	reversalMove: string;
}

interface MoveMissedEvent {
	entity: EntityId;
	moveId: string;
}

/**
 * MemorySystem
 *
 * Listens to combat events and updates each agent's short-term memory.
 * This gives the AI a sense of what has happened recently, enabling
 * adaptive strategies like avoiding moves that get reversed, or
 * exploiting opponent patterns.
 *
 * Memory is updated via event listeners subscribed during init(),
 * not during execute(). The execute step processes any pending
 * memory updates that were buffered from events.
 */
export class MemorySystem extends System {
	readonly name = 'MemorySystem';
	readonly phase: Phase = 'ai';
	readonly priority = 20;

	private pendingHits: MoveHitEvent[] = [];
	private pendingReversals: ReversalEvent[] = [];
	private pendingMisses: MoveMissedEvent[] = [];

	private memoryQuery = new Query(['AgentMemory', 'AgentBrain']);

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:move_hit', (ev: MoveHitEvent) => {
			this.pendingHits.push(ev);
		});

		eventBus.on('combat:reversal', (ev: ReversalEvent) => {
			this.pendingReversals.push(ev);
		});

		eventBus.on('combat:move_missed', (ev: MoveMissedEvent) => {
			this.pendingMisses.push(ev);
		});
	}

	execute(world: World, _dt: number, _eventBus: EventBus): void {
		// Process all pending events and apply to relevant agent memories
		for (const hit of this.pendingHits) {
			this.recordMoveForEntity(world, hit.attacker, hit.moveId, 'self');
			this.recordMoveForEntity(world, hit.defender, hit.moveId, 'opponent');
		}

		for (const reversal of this.pendingReversals) {
			this.recordReversalForEntity(world, reversal.reverser, reversal.originalMove);
		}

		for (const miss of this.pendingMisses) {
			this.recordMissForEntity(world, miss.entity, miss.moveId);
		}

		// Clear pending buffers
		this.pendingHits.length = 0;
		this.pendingReversals.length = 0;
		this.pendingMisses.length = 0;
	}

	private recordMoveForEntity(world: World, entity: EntityId, moveId: string, perspective: 'self' | 'opponent'): void {
		const memory = world.getComponent<AgentMemory>(entity, 'AgentMemory');
		if (!memory) return;

		if (perspective === 'self') {
			const recentMoves = [...memory.recentMoves, moveId];
			if (recentMoves.length > MAX_MEMORY_ENTRIES) {
				recentMoves.shift();
			}
			world.addComponent(entity, 'AgentMemory', {
				...memory,
				recentMoves
			});
		} else {
			const opponentMoves = [...memory.opponentMoves, moveId];
			if (opponentMoves.length > MAX_MEMORY_ENTRIES) {
				opponentMoves.shift();
			}
			world.addComponent(entity, 'AgentMemory', {
				...memory,
				opponentMoves
			});
		}
	}

	private recordReversalForEntity(world: World, reverser: EntityId, originalMove: string): void {
		const memory = world.getComponent<AgentMemory>(reverser, 'AgentMemory');
		if (!memory) return;

		const countersSucceeded = memory.countersSucceeded + 1;
		const countersAttempted = memory.countersAttempted + 1;
		const counterSuccessRate = countersAttempted > 0
			? countersSucceeded / countersAttempted
			: 0;

		const reversedMoves = [...memory.reversedMoves, originalMove];
		if (reversedMoves.length > MAX_MEMORY_ENTRIES) {
			reversedMoves.shift();
		}

		world.addComponent(reverser, 'AgentMemory', {
			...memory,
			countersSucceeded,
			countersAttempted,
			counterSuccessRate,
			reversedMoves
		});
	}

	private recordMissForEntity(world: World, entity: EntityId, _moveId: string): void {
		const memory = world.getComponent<AgentMemory>(entity, 'AgentMemory');
		if (!memory) return;

		// A missed move counts as a failed counter opportunity for the opponent,
		// but for the attacker it is just a whiff. We increment countersAttempted
		// to degrade the success rate when moves miss.
		const countersAttempted = memory.countersAttempted + 1;
		const counterSuccessRate = countersAttempted > 0
			? memory.countersSucceeded / countersAttempted
			: 0;

		world.addComponent(entity, 'AgentMemory', {
			...memory,
			countersAttempted,
			counterSuccessRate
		});
	}

	destroy(_world: World): void {
		this.pendingHits.length = 0;
		this.pendingReversals.length = 0;
		this.pendingMisses.length = 0;
	}
}
