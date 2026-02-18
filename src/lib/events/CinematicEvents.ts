import type { EntityId, Frame } from '../utils/types';

export interface CameraCut {
	preset: string;
	target: EntityId;
	duration: number;
}

export interface SlowMotion {
	factor: number;
	durationFrames: number;
}

export interface ReplayStart {
	startFrame: Frame;
	endFrame: Frame;
}

export interface ReplayEnd {}
