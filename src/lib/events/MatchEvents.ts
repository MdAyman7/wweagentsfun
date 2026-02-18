import type { EntityId, WinMethod } from '../utils/types';

export interface BellRing {
	matchType: string;
	participants: EntityId[];
}

export interface PinAttempt {
	pinner: EntityId;
	pinned: EntityId;
	frame: number;
}

export interface PinCount {
	count: 1 | 2 | 3;
	kickout: boolean;
}

export interface NearFall {
	pinned: EntityId;
	count: number;
	tension: number;
}

export interface Elimination {
	entity: EntityId;
	eliminatedBy: EntityId;
	method: WinMethod;
}

export interface Tag {
	outgoing: EntityId;
	incoming: EntityId;
	teamId: string;
}

export interface DQ {
	entity: EntityId;
	reason: string;
}

export interface MatchEnded {
	winner: EntityId;
	loser: EntityId;
	method: WinMethod;
	duration: number;
	rating: number;
}
