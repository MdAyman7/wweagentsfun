import type { Seed } from '../utils/types';
import { SeededRandom } from '../utils/random';

export interface LeagueConfig {
	id: string;
	name: string;
	participants: Array<{ id: string; name: string }>;
	matchesPerParticipant: number;
	seed: Seed;
	matchType: string;
}

export interface LeagueStanding {
	participantId: string;
	name: string;
	wins: number;
	losses: number;
	draws: number;
	points: number;
	matchRatingAvg: number;
	streak: number; // positive = win streak, negative = loss streak
}

export interface ScheduledMatch {
	id: string;
	week: number;
	participantA: string;
	participantB: string;
	winner: string | null;
	matchRating: number;
	status: 'scheduled' | 'complete';
}

export class LeagueManager {
	private standings: Map<string, LeagueStanding> = new Map();
	private schedule: ScheduledMatch[] = [];
	private random: SeededRandom;
	readonly config: LeagueConfig;

	constructor(config: LeagueConfig) {
		this.config = config;
		this.random = new SeededRandom(config.seed);

		// Initialize standings
		for (const p of config.participants) {
			this.standings.set(p.id, {
				participantId: p.id,
				name: p.name,
				wins: 0,
				losses: 0,
				draws: 0,
				points: 0,
				matchRatingAvg: 0,
				streak: 0
			});
		}

		this.generateSchedule();
	}

	private generateSchedule(): void {
		const participants = this.config.participants;
		let matchId = 0;
		let week = 0;

		// Round-robin scheduling
		for (let round = 0; round < this.config.matchesPerParticipant; round++) {
			const shuffled = [...participants];
			this.random.shuffle(shuffled);

			for (let i = 0; i < shuffled.length - 1; i += 2) {
				this.schedule.push({
					id: `league_match_${matchId++}`,
					week: week,
					participantA: shuffled[i].id,
					participantB: shuffled[i + 1].id,
					winner: null,
					matchRating: 0,
					status: 'scheduled'
				});
			}
			week++;
		}
	}

	recordResult(matchId: string, winnerId: string, matchRating: number): void {
		const match = this.schedule.find((m) => m.id === matchId);
		if (!match) return;

		match.winner = winnerId;
		match.matchRating = matchRating;
		match.status = 'complete';

		const loserId = match.participantA === winnerId ? match.participantB : match.participantA;

		// Update winner
		const winner = this.standings.get(winnerId);
		if (winner) {
			winner.wins++;
			winner.points += 3;
			winner.streak = winner.streak >= 0 ? winner.streak + 1 : 1;
			this.updateAvgRating(winner, matchRating);
		}

		// Update loser
		const loser = this.standings.get(loserId);
		if (loser) {
			loser.losses++;
			loser.streak = loser.streak <= 0 ? loser.streak - 1 : -1;
			this.updateAvgRating(loser, matchRating);
		}
	}

	private updateAvgRating(standing: LeagueStanding, rating: number): void {
		const totalMatches = standing.wins + standing.losses + standing.draws;
		standing.matchRatingAvg =
			(standing.matchRatingAvg * (totalMatches - 1) + rating) / totalMatches;
	}

	getNextMatch(): ScheduledMatch | undefined {
		return this.schedule.find((m) => m.status === 'scheduled');
	}

	getRankings(): LeagueStanding[] {
		return [...this.standings.values()].sort((a, b) => {
			if (b.points !== a.points) return b.points - a.points;
			if (b.wins !== a.wins) return b.wins - a.wins;
			return b.matchRatingAvg - a.matchRatingAvg;
		});
	}

	getSchedule(): readonly ScheduledMatch[] {
		return this.schedule;
	}

	getStanding(participantId: string): LeagueStanding | undefined {
		return this.standings.get(participantId);
	}
}
