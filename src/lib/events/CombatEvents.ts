import type { EntityId, Frame, BodyRegion } from '../utils/types';

export interface MoveStarted {
	entity: EntityId;
	moveId: string;
	frame: Frame;
}

export interface MoveHit {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	damage: number;
	region: BodyRegion;
}

export interface MoveMissed {
	entity: EntityId;
	moveId: string;
}

export interface MoveBlocked {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	chipDamage: number;
}

export interface Reversal {
	reverser: EntityId;
	originalMove: string;
	reversalMove: string;
}

export interface Counter {
	counterer: EntityId;
	attacker: EntityId;
	windowFrame: Frame;
}

export interface FinisherReady {
	entity: EntityId;
	finisherId: string;
	momentum: number;
}

export interface FinisherHit {
	attacker: EntityId;
	defender: EntityId;
	finisherId: string;
	damage: number;
}

export interface SubmissionLock {
	attacker: EntityId;
	defender: EntityId;
	holdId: string;
}

export interface RopeBreak {
	entity: EntityId;
}
