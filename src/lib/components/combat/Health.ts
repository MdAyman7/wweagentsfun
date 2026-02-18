import type { ComponentData } from '../../ecs/Component';

export interface Health extends ComponentData {
	readonly _type: 'Health';
	current: number;
	max: number;
	recoveryRate: number;
	/** Recent damage log for psychology/AI analysis. */
	damageLog: Array<{ amount: number; frame: number; moveId: string }>;
}

export function createHealth(overrides: Partial<Omit<Health, '_type'>> = {}): Health {
	return {
		_type: 'Health',
		current: 100,
		max: 100,
		recoveryRate: 0.05,
		damageLog: [],
		...overrides
	};
}
