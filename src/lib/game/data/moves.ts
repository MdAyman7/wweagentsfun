import type { MoveDef, MoveCategory, BodyRegion } from '../sim/types.ts';

/** Terse builder with sensible per-category defaults. */
function mk(
	id: string,
	name: string,
	category: MoveCategory,
	damage: number,
	opts: Partial<MoveDef> = {}
): MoveDef {
	// Tight ranges — fighters trade chest-to-chest; the renderer maps 1:1.
	const range =
		category === 'aerial' ? 1.6 : category === 'grapple' || category === 'submission' ? 0.95 : 1.15;
	return {
		id,
		name,
		category,
		region: (opts.region ?? 'body') as BodyRegion,
		damage,
		staminaCost: opts.staminaCost ?? Math.round(damage * 0.65),
		momentum: opts.momentum ?? Math.round(6 + damage * 0.5),
		range: opts.range ?? range,
		windup: opts.windup ?? (category === 'grapple' ? 20 : 13),
		active: opts.active ?? 4,
		recovery: opts.recovery ?? (category === 'grapple' ? 24 : 16),
		reverseResist: opts.reverseResist ?? (category === 'strike' ? 0.3 : 0.45),
		aerial: opts.aerial,
		knockdown: opts.knockdown,
		submission: opts.submission
	};
}

export const MOVES: MoveDef[] = [
	// ── Strikes ──
	mk('jab', 'Jab', 'strike', 4, { region: 'head', windup: 6, recovery: 8, staminaCost: 3 }),
	mk('chop', 'Knife-Edge Chop', 'strike', 6, { region: 'body' }),
	mk('forearm', 'Forearm Smash', 'strike', 6, { region: 'head' }),
	mk('uppercut', 'European Uppercut', 'strike', 9, { region: 'head' }),
	mk('elbow', 'Elbow Strike', 'strike', 8, { region: 'head' }),
	mk('kick', 'Kick', 'strike', 7, { region: 'legs' }),
	mk('roundhouse', 'Roundhouse Kick', 'strike', 12, { region: 'head', knockdown: true, windup: 12 }),
	mk('dropkick', 'Dropkick', 'aerial', 12, { knockdown: true, aerial: true }),
	mk('clothesline', 'Clothesline', 'strike', 11, { knockdown: true, range: 1.4 }),
	mk('big_boot', 'Big Boot', 'strike', 12, { region: 'head', knockdown: true }),
	mk('running_knee', 'Running Knee', 'strike', 13, { region: 'head', knockdown: true, windup: 12 }),
	mk('high_knee', 'High Knee', 'strike', 10, { region: 'head', knockdown: true }),

	// ── Grapples ──
	mk('bodyslam', 'Body Slam', 'grapple', 11, { knockdown: true }),
	mk('suplex', 'Vertical Suplex', 'grapple', 13, { knockdown: true }),
	mk('german_suplex', 'German Suplex', 'grapple', 15, { knockdown: true }),
	mk('ddt', 'DDT', 'grapple', 14, { region: 'head', knockdown: true }),
	mk('neckbreaker', 'Neckbreaker', 'grapple', 12, { region: 'head', knockdown: true }),
	mk('backbreaker', 'Backbreaker', 'grapple', 11, { region: 'body' }),
	mk('powerslam', 'Powerslam', 'grapple', 15, { knockdown: true }),
	mk('spinebuster', 'Spinebuster', 'grapple', 15, { knockdown: true }),
	mk('powerbomb', 'Powerbomb', 'grapple', 18, { knockdown: true, windup: 18 }),
	mk('chokeslam', 'Chokeslam', 'grapple', 18, { knockdown: true, windup: 16 }),
	mk('cutter', 'Cutter', 'grapple', 14, { region: 'head', knockdown: true }),

	// ── Aerials ──
	mk('crossbody', 'Crossbody', 'aerial', 12, { knockdown: true, aerial: true }),
	mk('senton', 'Senton Bomb', 'aerial', 14, { knockdown: true, aerial: true }),
	mk('moonsault', 'Moonsault', 'aerial', 16, { knockdown: true, aerial: true, windup: 14 }),
	mk('frog_splash', 'Frog Splash', 'aerial', 16, { knockdown: true, aerial: true, windup: 14 }),

	// ── Submissions ──
	mk('armbar', 'Armbar', 'submission', 3, { region: 'arms', submission: true }),
	mk('sleeper', 'Sleeper Hold', 'submission', 3, { region: 'head', submission: true }),
	mk('ankle_lock', 'Ankle Lock', 'submission', 3, { region: 'legs', submission: true }),
	mk('boston_crab', 'Boston Crab', 'submission', 4, { region: 'legs', submission: true }),

	// ── Signatures ──
	mk('superman_punch', 'Superman Punch', 'signature', 15, { region: 'head', knockdown: true }),
	mk('five_knuckle', 'Five Knuckle Shuffle', 'signature', 12, { region: 'head', knockdown: true }),
	mk('619', '619', 'signature', 13, { region: 'head', knockdown: true }),
	mk('sling_blade', 'Sling Blade', 'signature', 13, { knockdown: true }),
	mk('superkick', 'Superkick', 'signature', 16, { region: 'head', knockdown: true }),
	mk('future_shock', 'Future Shock DDT', 'signature', 15, { region: 'head', knockdown: true }),
	mk('cody_cutter', 'Cody Cutter', 'signature', 15, { region: 'head', knockdown: true, aerial: true }),
	mk('gunther_chop', 'Thunderous Chop', 'signature', 14, { region: 'body', knockdown: true }),

	// ── Finishers ──
	mk('spear', 'Spear', 'finisher', 26, { knockdown: true, windup: 16 }),
	mk('cross_rhodes', 'Cross Rhodes', 'finisher', 25, { knockdown: true, windup: 14 }),
	mk('f5', 'F-5', 'finisher', 30, { knockdown: true, windup: 16 }),
	mk('claymore', 'Claymore Kick', 'finisher', 27, { region: 'head', knockdown: true, windup: 14 }),
	mk('rko', 'RKO', 'finisher', 27, { region: 'head', knockdown: true, windup: 10 }),
	mk('attitude_adjustment', 'Attitude Adjustment', 'finisher', 25, { knockdown: true, windup: 14 }),
	mk('frog_finish', 'Top-Rope Frog Splash', 'finisher', 25, { knockdown: true, aerial: true, windup: 16 }),
	mk('coup_de_grace', 'Coup de Grâce', 'finisher', 26, { knockdown: true, aerial: true, windup: 16 }),
	mk('figure_eight', 'Figure-Eight', 'finisher', 8, { region: 'legs', submission: true }),
	mk('curb_stomp', 'Curb Stomp', 'finisher', 27, { region: 'head', knockdown: true, windup: 12 }),
	mk('gts', 'Go To Sleep', 'finisher', 27, { region: 'head', knockdown: true, windup: 14 }),
	mk('last_ride', 'Last Ride Powerbomb', 'finisher', 28, { knockdown: true, windup: 18 })
];

const BY_ID = new Map<string, MoveDef>(MOVES.map((m) => [m.id, m]));

export function getMove(id: string): MoveDef | undefined {
	return BY_ID.get(id);
}

/** Shared pool every wrestler can throw (basics), by category. */
export const BASIC_STRIKES = ['jab', 'chop', 'forearm', 'uppercut', 'elbow', 'kick'];
export const BASIC_GRAPPLES = ['bodyslam', 'suplex', 'ddt', 'neckbreaker', 'backbreaker'];
