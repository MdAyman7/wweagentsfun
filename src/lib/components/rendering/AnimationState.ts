import type { ComponentData } from '../../ecs/Component';

export interface AnimationState extends ComponentData {
	readonly _type: 'AnimationState';
	clipId: string;
	frame: number;
	speed: number;
	/** Blend weights for layered animations (indexed by layer). */
	blendWeights: number[];
	/** Whether the current animation should loop. */
	looping: boolean;
}

export function createAnimationState(overrides: Partial<Omit<AnimationState, '_type'>> = {}): AnimationState {
	return {
		_type: 'AnimationState',
		clipId: 'idle',
		frame: 0,
		speed: 1,
		blendWeights: [1],
		looping: true,
		...overrides
	};
}
