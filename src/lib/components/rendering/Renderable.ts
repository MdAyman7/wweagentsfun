import type { ComponentData } from '../../ecs/Component';

export interface Renderable extends ComponentData {
	readonly _type: 'Renderable';
	meshId: string;
	visible: boolean;
	layer: number;
	castShadow: boolean;
	receiveShadow: boolean;
}

export function createRenderable(overrides: Partial<Omit<Renderable, '_type'>> = {}): Renderable {
	return {
		_type: 'Renderable',
		meshId: '',
		visible: true,
		layer: 0,
		castShadow: true,
		receiveShadow: true,
		...overrides
	};
}
