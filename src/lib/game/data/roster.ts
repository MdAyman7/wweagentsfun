import type { WrestlerDef, WrestlerStats, Archetype, Build, Alignment } from '../sim/types.ts';

// Move pools by flavour — combined per wrestler.
const STRIKES = ['jab', 'chop', 'forearm', 'uppercut', 'elbow', 'kick'];
const POWER = ['clothesline', 'big_boot', 'bodyslam', 'suplex', 'powerslam', 'spinebuster', 'powerbomb', 'chokeslam'];
const TECH = ['neckbreaker', 'backbreaker', 'german_suplex', 'ddt', 'armbar', 'ankle_lock', 'boston_crab', 'sleeper'];
const AIR = ['dropkick', 'crossbody', 'senton', 'moonsault', 'frog_splash', 'high_knee', 'roundhouse'];

function stats(
	health: number, stamina: number, strength: number, speed: number,
	technique: number, charisma: number, resilience: number
): WrestlerStats {
	return { health, stamina, strength, speed, technique, charisma, resilience };
}

interface Row {
	id: string; name: string; nick: string; align: Alignment; arch: Archetype; build: Build;
	stats: WrestlerStats; moves: string[]; sig: string; fin: string;
	primary: string; secondary: string; skin: string; height: number;
}

const ROWS: Row[] = [
	{ id: 'roman_reigns', name: 'Roman Reigns', nick: 'The Tribal Chief', align: 'heel', arch: 'powerhouse', build: 'heavy',
		stats: stats(126, 92, 90, 72, 78, 99, 88), moves: [...STRIKES, ...POWER], sig: 'superman_punch', fin: 'spear',
		primary: '#111418', secondary: '#c9a227', skin: '#c9986a', height: 1.91 },
	{ id: 'cody_rhodes', name: 'Cody Rhodes', nick: 'The American Nightmare', align: 'face', arch: 'allrounder', build: 'medium',
		stats: stats(112, 96, 80, 84, 84, 94, 82), moves: [...STRIKES, 'clothesline', 'suplex', 'powerslam', 'ddt', 'dropkick', 'cutter'], sig: 'cody_cutter', fin: 'cross_rhodes',
		primary: '#e8e8ee', secondary: '#d13b4a', skin: '#d2a074', height: 1.86 },
	{ id: 'brock_lesnar', name: 'Brock Lesnar', nick: 'The Beast Incarnate', align: 'heel', arch: 'powerhouse', build: 'super_heavy',
		stats: stats(132, 84, 99, 62, 72, 82, 96), moves: [...STRIKES, 'clothesline', 'bodyslam', 'suplex', 'powerslam', 'spinebuster', 'powerbomb'], sig: 'german_suplex', fin: 'f5',
		primary: '#2b2f36', secondary: '#d94a2a', skin: '#caa079', height: 1.91 },
	{ id: 'drew_mcintyre', name: 'Drew McIntyre', nick: 'The Scottish Warrior', align: 'face', arch: 'powerhouse', build: 'heavy',
		stats: stats(120, 90, 90, 76, 78, 86, 86), moves: [...STRIKES, ...POWER, 'ddt'], sig: 'future_shock', fin: 'claymore',
		primary: '#3a2f5a', secondary: '#8a6bd6', skin: '#c99a6e', height: 1.93 },
	{ id: 'randy_orton', name: 'Randy Orton', nick: 'The Viper', align: 'heel', arch: 'technician', build: 'medium',
		stats: stats(116, 90, 82, 78, 90, 92, 86), moves: [...STRIKES, ...TECH, 'powerslam'], sig: 'neckbreaker', fin: 'rko',
		primary: '#1b2a3a', secondary: '#c0c7d0', skin: '#cf9f72', height: 1.96 },
	{ id: 'john_cena', name: 'John Cena', nick: 'The Cenation Leader', align: 'face', arch: 'allrounder', build: 'heavy',
		stats: stats(122, 94, 86, 74, 74, 97, 90), moves: [...STRIKES, 'clothesline', 'bodyslam', 'suplex', 'powerslam', 'spinebuster'], sig: 'five_knuckle', fin: 'attitude_adjustment',
		primary: '#2f6fb0', secondary: '#e3e6ea', skin: '#d0a377', height: 1.85 },
	{ id: 'rey_mysterio', name: 'Rey Mysterio', nick: 'The Master of the 619', align: 'face', arch: 'highflyer', build: 'light',
		stats: stats(100, 100, 55, 99, 86, 92, 70), moves: ['jab', 'kick', 'forearm', ...AIR, 'cutter'], sig: '619', fin: 'frog_finish',
		primary: '#c0392b', secondary: '#f1c40f', skin: '#c98d5f', height: 1.68 },
	{ id: 'finn_balor', name: 'Finn Bálor', nick: 'The Prince', align: 'face', arch: 'highflyer', build: 'medium',
		stats: stats(106, 96, 68, 92, 84, 86, 76), moves: ['jab', 'chop', 'kick', 'clothesline', ...AIR], sig: 'sling_blade', fin: 'coup_de_grace',
		primary: '#111318', secondary: '#e03a4c', skin: '#cf9e72', height: 1.80 },
	{ id: 'charlotte_flair', name: 'Charlotte Flair', nick: 'The Queen', align: 'heel', arch: 'technician', build: 'medium',
		stats: stats(110, 92, 74, 82, 90, 94, 82), moves: [...STRIKES, 'ddt', 'suplex', 'boston_crab', 'ankle_lock', 'big_boot', 'dropkick'], sig: 'big_boot', fin: 'figure_eight',
		primary: '#f3d33a', secondary: '#e8e8ee', skin: '#e0b48a', height: 1.80 },
	{ id: 'seth_rollins', name: 'Seth Rollins', nick: 'The Visionary', align: 'heel', arch: 'allrounder', build: 'medium',
		stats: stats(110, 96, 78, 88, 88, 93, 80), moves: [...STRIKES, 'clothesline', 'ddt', 'suplex', 'dropkick', 'frog_splash', 'high_knee'], sig: 'superkick', fin: 'curb_stomp',
		primary: '#14181d', secondary: '#3aa0d9', skin: '#cc9868', height: 1.85 },
	{ id: 'cm_punk', name: 'CM Punk', nick: 'The Best in the World', align: 'face', arch: 'technician', build: 'medium',
		stats: stats(112, 92, 76, 80, 90, 96, 84), moves: [...STRIKES, ...TECH, 'high_knee'], sig: 'high_knee', fin: 'gts',
		primary: '#1c1f24', secondary: '#e7c24a', skin: '#cf9d6f', height: 1.85 },
	{ id: 'gunther', name: 'Gunther', nick: 'The Ring General', align: 'heel', arch: 'powerhouse', build: 'heavy',
		stats: stats(124, 88, 92, 66, 84, 84, 92), moves: ['chop', 'forearm', 'uppercut', 'elbow', ...POWER, 'sleeper'], sig: 'gunther_chop', fin: 'last_ride',
		primary: '#3a3f47', secondary: '#b7c0c9', skin: '#d3a97e', height: 1.94 }
];

export const ROSTER: WrestlerDef[] = ROWS.map((r) => ({
	id: r.id,
	name: r.name,
	nickname: r.nick,
	alignment: r.align,
	archetype: r.arch,
	build: r.build,
	stats: r.stats,
	moveIds: r.moves,
	signatureId: r.sig,
	finisherId: r.fin,
	appearance: {
		height: r.height,
		primaryColor: r.primary,
		secondaryColor: r.secondary,
		skinTone: r.skin
	}
}));

const BY_ID = new Map<string, WrestlerDef>(ROSTER.map((w) => [w.id, w]));

export function getWrestler(id: string): WrestlerDef | undefined {
	return BY_ID.get(id);
}
