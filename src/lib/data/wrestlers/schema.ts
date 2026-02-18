import type { Alignment } from '../../utils/types';

export interface WrestlerDef {
	id: string;
	name: string;
	nickname: string;
	alignment: Alignment;
	stats: {
		health: number;
		stamina: number;
		strength: number;
		speed: number;
		technique: number;
		charisma: number;
	};
	movesetId: string;
	personalityId: string;
	appearance: {
		height: number; // meters
		weight: number; // kg
		build: 'light' | 'medium' | 'heavy' | 'super_heavy';
		primaryColor: string;
		secondaryColor: string;
	};
	entrance: {
		musicId: string;
		style: 'walk' | 'run' | 'dramatic' | 'pyro';
	};
}
