import type { EntityId, Seed } from '../utils/types';
import { SeededRandom } from '../utils/random';

export interface TournamentConfig {
	id: string;
	name: string;
	format: 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss';
	participants: TournamentParticipant[];
	seed: Seed;
	matchType: string;
}

export interface TournamentParticipant {
	id: string;
	name: string;
	wrestlerConfig: unknown; // WrestlerConfig reference
	seed: number;
}

export interface BracketMatch {
	id: string;
	round: number;
	position: number;
	participantA: string | null;
	participantB: string | null;
	winner: string | null;
	loser: string | null;
	status: 'pending' | 'ready' | 'in_progress' | 'complete';
}

export interface TournamentState {
	config: TournamentConfig;
	bracket: BracketMatch[];
	currentRound: number;
	champion: string | null;
	standings: Map<string, { wins: number; losses: number; points: number }>;
}

export class TournamentManager {
	private state: TournamentState;
	private random: SeededRandom;

	constructor(config: TournamentConfig) {
		this.random = new SeededRandom(config.seed);
		this.state = {
			config,
			bracket: [],
			currentRound: 0,
			champion: null,
			standings: new Map()
		};

		// Initialize standings
		for (const p of config.participants) {
			this.state.standings.set(p.id, { wins: 0, losses: 0, points: 0 });
		}

		this.generateBracket();
	}

	private generateBracket(): void {
		switch (this.state.config.format) {
			case 'single_elimination':
				this.generateSingleElimination();
				break;
			case 'round_robin':
				this.generateRoundRobin();
				break;
			default:
				this.generateSingleElimination();
		}
	}

	private generateSingleElimination(): void {
		const participants = [...this.state.config.participants];
		// Sort by seed, then shuffle within same seed
		participants.sort((a, b) => a.seed - b.seed);

		// Pad to next power of 2
		const size = Math.pow(2, Math.ceil(Math.log2(participants.length)));
		const totalRounds = Math.log2(size);

		let matchId = 0;
		// First round
		for (let i = 0; i < size / 2; i++) {
			const a = participants[i] ?? null;
			const b = participants[size - 1 - i] ?? null;
			const match: BracketMatch = {
				id: `match_${matchId++}`,
				round: 0,
				position: i,
				participantA: a?.id ?? null,
				participantB: b?.id ?? null,
				winner: null,
				loser: null,
				status: a && b ? 'ready' : 'pending'
			};

			// Bye: auto-advance
			if (a && !b) {
				match.winner = a.id;
				match.status = 'complete';
			} else if (!a && b) {
				match.winner = b.id;
				match.status = 'complete';
			}

			this.state.bracket.push(match);
		}

		// Subsequent rounds (empty slots)
		for (let round = 1; round < totalRounds; round++) {
			const matchesInRound = size / Math.pow(2, round + 1);
			for (let i = 0; i < matchesInRound; i++) {
				this.state.bracket.push({
					id: `match_${matchId++}`,
					round,
					position: i,
					participantA: null,
					participantB: null,
					winner: null,
					loser: null,
					status: 'pending'
				});
			}
		}

		// Advance byes
		this.advanceByes();
	}

	private generateRoundRobin(): void {
		const participants = this.state.config.participants;
		let matchId = 0;
		let round = 0;

		for (let i = 0; i < participants.length; i++) {
			for (let j = i + 1; j < participants.length; j++) {
				this.state.bracket.push({
					id: `match_${matchId++}`,
					round: round++,
					position: 0,
					participantA: participants[i].id,
					participantB: participants[j].id,
					winner: null,
					loser: null,
					status: 'ready'
				});
			}
		}
	}

	private advanceByes(): void {
		for (const match of this.state.bracket) {
			if (match.status === 'complete' && match.winner) {
				this.advanceWinner(match);
			}
		}
	}

	private advanceWinner(completedMatch: BracketMatch): void {
		const nextRound = completedMatch.round + 1;
		const nextPosition = Math.floor(completedMatch.position / 2);
		const nextMatch = this.state.bracket.find(
			(m) => m.round === nextRound && m.position === nextPosition
		);

		if (nextMatch && completedMatch.winner) {
			if (completedMatch.position % 2 === 0) {
				nextMatch.participantA = completedMatch.winner;
			} else {
				nextMatch.participantB = completedMatch.winner;
			}
			if (nextMatch.participantA && nextMatch.participantB) {
				nextMatch.status = 'ready';
			}
		}
	}

	/** Record a match result and advance the bracket. */
	recordResult(matchId: string, winnerId: string): void {
		const match = this.state.bracket.find((m) => m.id === matchId);
		if (!match) return;

		const loserId = match.participantA === winnerId ? match.participantB : match.participantA;
		match.winner = winnerId;
		match.loser = loserId;
		match.status = 'complete';

		// Update standings
		const winnerStanding = this.state.standings.get(winnerId);
		if (winnerStanding) {
			winnerStanding.wins++;
			winnerStanding.points += 3;
		}
		if (loserId) {
			const loserStanding = this.state.standings.get(loserId);
			if (loserStanding) {
				loserStanding.losses++;
			}
		}

		// Advance winner in elimination brackets
		if (this.state.config.format === 'single_elimination') {
			this.advanceWinner(match);
		}

		// Check for champion
		const finalMatch = this.state.bracket[this.state.bracket.length - 1];
		if (finalMatch.status === 'complete' && finalMatch.winner) {
			this.state.champion = finalMatch.winner;
		}
	}

	/** Get the next match that's ready to play. */
	getNextMatch(): BracketMatch | undefined {
		return this.state.bracket.find((m) => m.status === 'ready');
	}

	get bracket(): readonly BracketMatch[] {
		return this.state.bracket;
	}

	get champion(): string | null {
		return this.state.champion;
	}

	get standings(): ReadonlyMap<string, { wins: number; losses: number; points: number }> {
		return this.state.standings;
	}
}
