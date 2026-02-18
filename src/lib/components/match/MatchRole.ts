import type { ComponentData } from '../../ecs/Component';
import type { Alignment } from '../../utils/types';

export interface MatchRole extends ComponentData {
	readonly _type: 'MatchRole';
	alignment: Alignment;
	/** Entry order (for Royal Rumble). */
	entryOrder: number;
	/** Whether this wrestler has been eliminated. */
	eliminated: boolean;
	/** Wrestler display name. */
	name: string;
}

export function createMatchRole(overrides: Partial<Omit<MatchRole, '_type'>> = {}): MatchRole {
	return {
		_type: 'MatchRole',
		alignment: 'face',
		entryOrder: 0,
		eliminated: false,
		name: 'Unknown',
		...overrides
	};
}
