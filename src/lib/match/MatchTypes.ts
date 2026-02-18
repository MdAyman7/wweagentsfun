/**
 * Match type rule definitions.
 * Each match type configures: participant count, win conditions, special rules.
 */

export interface MatchTypeRules {
	id: string;
	name: string;
	minParticipants: number;
	maxParticipants: number;
	winConditions: WinCondition[];
	countOut: boolean;
	dq: boolean;
	ropeBreak: boolean;
	falls: number; // 1 for singles, 2 for 2-out-of-3, etc.
	timeLimit: number; // seconds, 0 = unlimited
	specialRules: string[];
}

export type WinCondition = 'pinfall' | 'submission' | 'knockout' | 'escape' | 'elimination' | 'ladder_retrieve';

export const MATCH_TYPES: Record<string, MatchTypeRules> = {
	singles: {
		id: 'singles',
		name: 'Singles Match',
		minParticipants: 2,
		maxParticipants: 2,
		winConditions: ['pinfall', 'submission', 'knockout'],
		countOut: true,
		dq: true,
		ropeBreak: true,
		falls: 1,
		timeLimit: 1800,
		specialRules: []
	},
	no_dq: {
		id: 'no_dq',
		name: 'No Disqualification Match',
		minParticipants: 2,
		maxParticipants: 2,
		winConditions: ['pinfall', 'submission', 'knockout'],
		countOut: false,
		dq: false,
		ropeBreak: false,
		falls: 1,
		timeLimit: 0,
		specialRules: ['weapons_allowed']
	},
	tag_team: {
		id: 'tag_team',
		name: 'Tag Team Match',
		minParticipants: 4,
		maxParticipants: 4,
		winConditions: ['pinfall', 'submission'],
		countOut: true,
		dq: true,
		ropeBreak: true,
		falls: 1,
		timeLimit: 1800,
		specialRules: ['tag_required', 'legal_man']
	},
	royal_rumble: {
		id: 'royal_rumble',
		name: 'Royal Rumble',
		minParticipants: 10,
		maxParticipants: 30,
		winConditions: ['elimination'],
		countOut: false,
		dq: false,
		ropeBreak: false,
		falls: 0,
		timeLimit: 0,
		specialRules: ['over_top_rope', 'timed_entry']
	},
	cage: {
		id: 'cage',
		name: 'Steel Cage Match',
		minParticipants: 2,
		maxParticipants: 2,
		winConditions: ['pinfall', 'submission', 'escape'],
		countOut: false,
		dq: false,
		ropeBreak: false,
		falls: 1,
		timeLimit: 0,
		specialRules: ['cage_walls', 'cage_door']
	},
	triple_threat: {
		id: 'triple_threat',
		name: 'Triple Threat Match',
		minParticipants: 3,
		maxParticipants: 3,
		winConditions: ['pinfall', 'submission'],
		countOut: false,
		dq: false,
		ropeBreak: true,
		falls: 1,
		timeLimit: 0,
		specialRules: []
	},
	iron_man: {
		id: 'iron_man',
		name: 'Iron Man Match',
		minParticipants: 2,
		maxParticipants: 2,
		winConditions: ['pinfall', 'submission', 'knockout'],
		countOut: true,
		dq: true,
		ropeBreak: true,
		falls: 999, // unlimited; most falls wins at time limit
		timeLimit: 3600,
		specialRules: ['most_falls_wins']
	}
};

export function getMatchType(id: string): MatchTypeRules | undefined {
	return MATCH_TYPES[id];
}
