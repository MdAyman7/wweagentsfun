import type { EntityId } from '../utils/types';

export interface Decision {
	entity: EntityId;
	action: string;
	target: EntityId | null;
	confidence: number;
}

export interface StrategySwitch {
	entity: EntityId;
	from: string;
	to: string;
	reason: string;
}
