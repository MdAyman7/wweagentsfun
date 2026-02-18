import type { PsychProfile } from './PsychologyTypes';

/**
 * BalanceConfig — the single source of truth for tunable constants.
 *
 * ── BALANCING STRATEGY ──
 *
 * The psychology system is balanced around these principles:
 *
 * 1. NO EMOTIONAL STATE IS STRICTLY DOMINANT
 *    - Every state has a tradeoff. Dominating deals more damage but
 *      has lower defense. Clutch is strong but requires specific
 *      conditions (low health + high momentum + high confidence).
 *    - The modifier ranges are bounded: damage [0.7, 1.6], aggression
 *      [0.3, 2.5]. This prevents any combination from being game-breaking.
 *
 * 2. MISTAKES ARE THE EQUALIZER
 *    - Overconfident/Desperate states have 18-20% mistake chance.
 *      Mistakes cause a whiff (lose stamina, enter recovery, opponent
 *      gets a free window). This is the comeback mechanism.
 *    - Clutch has only 2% mistake chance — the reward for reaching it.
 *
 * 3. TRAIT TRADEOFFS ARE SYMMETRIC
 *    - High aggression = more hits dealt but more damage taken.
 *    - High ego = faster domination but faster overconfidence trap.
 *    - High fear threshold = safer play but can't access Clutch easily.
 *    - High crowd sensitivity = big swings (great when supported, awful when booed).
 *    - High momentum influence = explosive peaks but also deep valleys.
 *
 * 4. TIME GATES PREVENT SNOWBALLING
 *    - EMOTION_MIN_DURATION (60 ticks = 1 sec) prevents rapid oscillation.
 *    - Confidence mean-reverts slowly (0.5% per tick toward base).
 *    - Crowd heat decays (0.2% per tick toward 0).
 *    - Momentum decays when idle (0.05 per tick).
 *
 * 5. MATCHUP VARIETY
 *    - Same personality matchup: mirror match, decided by small edges.
 *    - High ego vs technician: ego gets early domination but technician
 *      reversals punish overconfidence.
 *    - Brawler vs psychologist: brawler's aggression vs psychologist's
 *      crowd manipulation and reversal skill.
 *
 * ── TUNING GUIDE ──
 *
 * To make matches more dramatic:
 *   ↑ EMOTION_MODIFIERS.clutch.damageMod (bigger clutch finishes)
 *   ↑ COMEBACK triggers in ComebackSystem (more comeback moments)
 *   ↓ EMOTION_MIN_DURATION (faster emotional swings)
 *
 * To make matches more competitive:
 *   ↓ EMOTION_MODIFIERS spread (closer to 1.0 across all states)
 *   ↑ EMOTION_MIN_DURATION (less volatility)
 *   ↑ Confidence mean-reversion rate
 *
 * To increase upset potential:
 *   ↑ mistakeChance on Overconfident
 *   ↑ Clutch modifiers
 *   ↓ Dominating damage mod
 */

/**
 * Preset psychology profiles for each wrestler archetype.
 * Traits: aggression, baseConfidence, ego, fearThreshold, crowdSensitivity, momentumInfluence
 */
export const PSYCH_PROFILES: Record<string, PsychProfile> = {
	powerhouse: {
		aggression: 0.7,
		baseConfidence: 0.6,
		ego: 0.5,
		fearThreshold: 0.3,   // hard to scare
		crowdSensitivity: 0.4,
		momentumInfluence: 0.5
	},
	highflyer: {
		aggression: 0.6,
		baseConfidence: 0.7,
		ego: 0.4,
		fearThreshold: 0.5,
		crowdSensitivity: 0.8, // feeds off the crowd
		momentumInfluence: 0.8  // momentum-dependent style
	},
	technician: {
		aggression: 0.3,
		baseConfidence: 0.5,
		ego: 0.2,              // humble, precise
		fearThreshold: 0.4,
		crowdSensitivity: 0.3,
		momentumInfluence: 0.3  // consistent regardless of flow
	},
	brawler: {
		aggression: 0.9,
		baseConfidence: 0.5,
		ego: 0.7,              // high ego, believes they're tough
		fearThreshold: 0.2,    // fearless
		crowdSensitivity: 0.3,
		momentumInfluence: 0.4
	},
	psychologist: {
		aggression: 0.4,
		baseConfidence: 0.6,
		ego: 0.6,
		fearThreshold: 0.6,    // plays mind games but can crack
		crowdSensitivity: 0.7, // reads the crowd
		momentumInfluence: 0.6
	},
	balanced: {
		aggression: 0.5,
		baseConfidence: 0.55,
		ego: 0.4,
		fearThreshold: 0.5,
		crowdSensitivity: 0.5,
		momentumInfluence: 0.5
	}
};

/**
 * Validate that a PsychProfile has all traits in [0, 1].
 */
export function validateProfile(profile: PsychProfile): boolean {
	return (
		profile.aggression >= 0 && profile.aggression <= 1 &&
		profile.baseConfidence >= 0 && profile.baseConfidence <= 1 &&
		profile.ego >= 0 && profile.ego <= 1 &&
		profile.fearThreshold >= 0 && profile.fearThreshold <= 1 &&
		profile.crowdSensitivity >= 0 && profile.crowdSensitivity <= 1 &&
		profile.momentumInfluence >= 0 && profile.momentumInfluence <= 1
	);
}
