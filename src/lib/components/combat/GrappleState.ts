import type { ComponentData } from '../../ecs/Component';
import type { EntityId } from '../../utils/types';

export type GrapplePosition = 'neutral' | 'front_facelock' | 'rear_waistlock' | 'side_headlock' | 'corner' | 'top_rope';

export interface GrappleState extends ComponentData {
	readonly _type: 'GrappleState';
	inGrapple: boolean;
	initiator: EntityId | null;
	opponent: EntityId | null;
	position: GrapplePosition;
	/** Progress toward escaping (0–1). */
	escapeProgress: number;
}

export function createGrappleState(overrides: Partial<Omit<GrappleState, '_type'>> = {}): GrappleState {
	return {
		_type: 'GrappleState',
		inGrapple: false,
		initiator: null,
		opponent: null,
		position: 'neutral',
		escapeProgress: 0,
		...overrides
	};
}
