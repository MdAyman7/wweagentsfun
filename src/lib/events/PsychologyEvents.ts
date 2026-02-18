import type { EntityId } from '../utils/types';

export interface CrowdPop {
	intensity: number;
	trigger: string;
}

export interface HeatChange {
	entity: EntityId;
	delta: number;
	newValue: number;
}

export interface Comeback {
	entity: EntityId;
	triggerEvent: string;
}

export interface DramaPeak {
	tension: number;
	frame: number;
}
