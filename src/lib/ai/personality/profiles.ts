import type { PersonalityProfile } from './PersonalityProfile';

/**
 * Brawler: rushes in, throws heavy strikes, doesn't care about technique.
 * High aggression, low technique. Think Stone Cold or Brock Lesnar.
 */
export const BRAWLER: PersonalityProfile = {
	id: 'brawler',
	name: 'Brawler',
	description: 'Aggressive striker who favors raw power over finesse.',
	weights: {
		aggression: 0.9,
		showmanship: 0.4,
		technique: 0.2,
		psychology: 0.3,
		riskTaking: 0.6
	}
};

/**
 * Technician: chain wrestler, submission specialist, methodical approach.
 * High technique, low showmanship. Think Bret Hart or Daniel Bryan.
 */
export const TECHNICIAN: PersonalityProfile = {
	id: 'technician',
	name: 'Technician',
	description: 'Technical wrestler who methodically works holds and limbs.',
	weights: {
		aggression: 0.3,
		showmanship: 0.2,
		technique: 0.9,
		psychology: 0.7,
		riskTaking: 0.2
	}
};

/**
 * High Flyer: daredevil aerial specialist, crowd favorite.
 * High risk-taking and showmanship. Think Rey Mysterio or Jeff Hardy.
 */
export const HIGH_FLYER: PersonalityProfile = {
	id: 'highflyer',
	name: 'High Flyer',
	description: 'Aerial specialist who takes big risks for big rewards.',
	weights: {
		aggression: 0.5,
		showmanship: 0.9,
		technique: 0.5,
		psychology: 0.3,
		riskTaking: 0.9
	}
};

/**
 * Psychologist: reads the opponent, controls the pace, tells a story.
 * High psychology, moderate everything else. Think The Undertaker or Triple H.
 */
export const PSYCHOLOGIST: PersonalityProfile = {
	id: 'psychologist',
	name: 'Psychologist',
	description: 'Ring general who controls pacing and exploits weaknesses.',
	weights: {
		aggression: 0.5,
		showmanship: 0.5,
		technique: 0.5,
		psychology: 0.9,
		riskTaking: 0.4
	}
};

/**
 * Powerhouse: relies on overwhelming strength and impact moves.
 * High aggression, low speed-dependent moves. Think Big Show or Mark Henry.
 */
export const POWERHOUSE: PersonalityProfile = {
	id: 'powerhouse',
	name: 'Powerhouse',
	description: 'Dominant force who overpowers opponents with sheer strength.',
	weights: {
		aggression: 0.85,
		showmanship: 0.3,
		technique: 0.3,
		psychology: 0.4,
		riskTaking: 0.3
	}
};

/**
 * All preset profiles indexed by id.
 */
export const PRESET_PROFILES: Record<string, PersonalityProfile> = {
	brawler: BRAWLER,
	technician: TECHNICIAN,
	highflyer: HIGH_FLYER,
	psychologist: PSYCHOLOGIST,
	powerhouse: POWERHOUSE
};

/**
 * Get a preset profile by id. Falls back to a balanced profile if not found.
 */
export function getPresetProfile(id: string): PersonalityProfile {
	const preset = PRESET_PROFILES[id];
	if (preset) return preset;

	// Balanced fallback
	return {
		id: 'balanced',
		name: 'Balanced',
		description: 'Well-rounded wrestler with no particular specialization.',
		weights: {
			aggression: 0.5,
			showmanship: 0.5,
			technique: 0.5,
			psychology: 0.5,
			riskTaking: 0.5
		}
	};
}
