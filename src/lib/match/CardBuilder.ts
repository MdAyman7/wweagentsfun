import type { MatchConfig } from './MatchFactory';

/**
 * A match card is an ordered list of matches for a "show" / event.
 * The main event is always last. Matches can have stipulations.
 */

export interface CardMatch {
	id: string;
	matchConfig: MatchConfig;
	isMainEvent: boolean;
	title: string;
	stipulation: string;
	order: number;
	result: { winner: string; method: string; rating: number } | null;
}

export interface ShowCard {
	name: string;
	matches: CardMatch[];
	venue: string;
}

export class CardBuilder {
	private matches: CardMatch[] = [];
	private showName = 'Live Event';
	private venue = 'Default Arena';

	setShowName(name: string): this {
		this.showName = name;
		return this;
	}

	setVenue(venue: string): this {
		this.venue = venue;
		return this;
	}

	addMatch(
		title: string,
		config: MatchConfig,
		stipulation = '',
		isMainEvent = false
	): this {
		this.matches.push({
			id: `card_match_${this.matches.length}`,
			matchConfig: config,
			isMainEvent,
			title,
			stipulation,
			order: this.matches.length,
			result: null
		});
		return this;
	}

	build(): ShowCard {
		// Ensure main event is last
		const sorted = [...this.matches].sort((a, b) => {
			if (a.isMainEvent && !b.isMainEvent) return 1;
			if (!a.isMainEvent && b.isMainEvent) return -1;
			return a.order - b.order;
		});

		// Reassign order
		sorted.forEach((m, i) => (m.order = i));

		return {
			name: this.showName,
			matches: sorted,
			venue: this.venue
		};
	}
}
