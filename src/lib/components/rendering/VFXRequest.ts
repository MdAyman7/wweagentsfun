import type { ComponentData } from '../../ecs/Component';
import type { Vec3 } from '../../utils/types';

/**
 * One-shot VFX request. Consumed by VFXSystem and then removed.
 */
export interface VFXRequest extends ComponentData {
	readonly _type: 'VFXRequest';
	effectType: 'impact' | 'sweat' | 'dust' | 'flash' | 'sparks';
	position: Vec3;
	/** Time-to-live in frames. */
	ttl: number;
	intensity: number;
}

export function createVFXRequest(
	effectType: VFXRequest['effectType'],
	position: Vec3,
	ttl = 30,
	intensity = 1
): VFXRequest {
	return {
		_type: 'VFXRequest',
		effectType,
		position,
		ttl,
		intensity
	};
}
