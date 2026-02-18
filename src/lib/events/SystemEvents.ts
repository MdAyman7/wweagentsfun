import type { Frame, Phase } from '../utils/types';

export interface Tick {
	frame: Frame;
	deltaMs: number;
}

export interface PhaseChange {
	phase: Phase;
}

export interface Pause {}

export interface Resume {}

export interface SystemError {
	system: string;
	message: string;
	fatal: boolean;
}
