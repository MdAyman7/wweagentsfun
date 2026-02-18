import { writable } from 'svelte/store';
import type { BracketMatch } from '../match/TournamentManager';

export interface TournamentUIState {
	active: boolean;
	name: string;
	format: string;
	bracket: BracketMatch[];
	currentRound: number;
	champion: string | null;
	standings: Array<{ id: string; name: string; wins: number; losses: number; points: number }>;
}

export const tournamentState = writable<TournamentUIState>({
	active: false,
	name: '',
	format: '',
	bracket: [],
	currentRound: 0,
	champion: null,
	standings: []
});

export function resetTournamentStore(): void {
	tournamentState.set({
		active: false,
		name: '',
		format: '',
		bracket: [],
		currentRound: 0,
		champion: null,
		standings: []
	});
}
