import type { ComponentData } from '../../ecs/Component';
import type { EntityId, Frame } from '../../utils/types';

/**
 * Present on an entity while it is executing a move.
 * Removed when the move completes (enters idle after recovery).
 */
export interface ActiveMove extends ComponentData {
	readonly _type: 'ActiveMove';
	moveId: string;
	startFrame: Frame;
	targetId: EntityId | null;
	/** Current move phase: windup → active → recovery. */
	movePhase: 'windup' | 'active' | 'recovery';
	/** Whether the hit has already been confirmed this move. */
	hitConfirmed: boolean;
}

export function createActiveMove(
	moveId: string,
	startFrame: Frame,
	targetId: EntityId | null = null
): ActiveMove {
	return {
		_type: 'ActiveMove',
		moveId,
		startFrame,
		targetId,
		movePhase: 'windup',
		hitConfirmed: false
	};
}
