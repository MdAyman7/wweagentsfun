import type { MoveCategory, BodyRegion } from '../../utils/types';

export interface MoveDef {
	id: string;
	name: string;
	category: MoveCategory;
	/** Frames before the hit is active (wind-up). */
	windupFrames: number;
	/** Frames the hitbox is active. */
	activeFrames: number;
	/** Frames of recovery after the move. */
	recoveryFrames: number;
	baseDamage: number;
	staminaCost: number;
	/** Body region targeted. */
	region: BodyRegion;
	/** Momentum gained on successful hit. */
	momentumGain: number;
	hitbox: {
		range: number; // meters
		angle: number; // degrees (180 = full front arc)
	};
	canBeReversed: boolean;
	/** Frame window where the move can be reversed (counted from windup start). */
	reversalWindow: number;
	/** Required grapple position (null = standalone move). */
	requiresGrapple: string | null;
	/** Animation clip IDs. */
	animations: {
		windup: string;
		active: string;
		recovery: string;
	};
}
