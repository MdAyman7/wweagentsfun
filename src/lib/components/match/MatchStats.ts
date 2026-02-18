import type { ComponentData } from '../../ecs/Component';

export interface MatchStats extends ComponentData {
	readonly _type: 'MatchStats';
	movesHit: number;
	movesMissed: number;
	damageDealt: number;
	damageTaken: number;
	nearFalls: number;
	reversals: number;
	/** Match rating accumulated from drama events (star rating). */
	matchRating: number;
}

export function createMatchStats(): MatchStats {
	return {
		_type: 'MatchStats',
		movesHit: 0,
		movesMissed: 0,
		damageDealt: 0,
		damageTaken: 0,
		nearFalls: 0,
		reversals: 0,
		matchRating: 0
	};
}
