import type { EntityId } from '../utils/types';

export interface MatchComplete {
	matchId: string;
	winner: EntityId;
	bracketPosition: number;
}

export interface RoundComplete {
	round: number;
	results: Array<{ winner: EntityId; loser: EntityId }>;
}

export interface Champion {
	entity: EntityId;
	tournamentId: string;
}
