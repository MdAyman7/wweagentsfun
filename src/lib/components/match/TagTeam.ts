import type { ComponentData } from '../../ecs/Component';

export interface TagTeam extends ComponentData {
	readonly _type: 'TagTeam';
	teamId: string;
	isLegalMan: boolean;
	/** Frames until tag is allowed again. */
	tagCooldown: number;
}

export function createTagTeam(overrides: Partial<Omit<TagTeam, '_type'>> = {}): TagTeam {
	return {
		_type: 'TagTeam',
		teamId: '',
		isLegalMan: false,
		tagCooldown: 0,
		...overrides
	};
}
