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
 * 2. FRUSTRATED STATE IS THE BRIDGE
 *    - Frustrated sits between Calm and Panicking. It triggers when
 *      a wrestler is losing but not critically — moves getting reversed,
 *      opponent landing combos, can't get offense going.
 *    - It creates erratic behavior: higher aggression but more mistakes.
 *    - High ego wrestlers frustrate easily. High adaptability recovers faster.
 *    - This adds dramatic variety — the commentator moment of "he's losing
 *      his cool!" without immediately jumping to full panic.
 *
 * 3. MISTAKES ARE THE EQUALIZER
 *    - Overconfident/Desperate/Frustrated states have 14-20% mistake chance.
 *      Mistakes cause a whiff (lose stamina, enter recovery, opponent
 *      gets a free window). This is the comeback mechanism.
 *    - Clutch has only 2% mistake chance — the reward for reaching it.
 *
 * 4. TRAIT TRADEOFFS ARE SYMMETRIC
 *    - High aggression = more hits dealt but more damage taken.
 *    - High ego = faster domination but faster overconfidence trap.
 *    - High fear threshold = safer play but can't access Clutch easily.
 *    - High crowd sensitivity = big swings (great when supported, awful when booed).
 *    - High momentum influence = explosive peaks but also deep valleys.
 *    - High adaptability = faster emotion transitions, quicker strategy pivots,
 *      but less emotional inertia (can be destabilized by rapid events).
 *
 * 5. TIME GATES PREVENT SNOWBALLING
 *    - Hysteresis (60 ticks base, reduced by adaptability) prevents rapid oscillation.
 *    - Confidence mean-reverts slowly (0.5% per tick toward base).
 *    - Crowd heat decays (0.2% per tick toward 0).
 *    - Momentum decays when idle (0.05 per tick).
 *    - Emotional decay: non-calm states naturally drift back over time.
 *
 * 6. SPEED MODIFIER PREVENTS STAGNATION
 *    - Each emotional state has a speed modifier (0.85 – 1.2).
 *    - Clutch/Desperate/Dominating feel faster (more attacks per second).
 *    - Panicking/Overconfident feel slower (hesitation, showboating).
 *    - Combined with momentum: high momentum = faster decisions.
 *
 * 7. MATCHUP VARIETY
 *    - Same personality matchup: mirror match, decided by small edges.
 *    - High ego vs technician: ego gets early domination but technician
 *      reversals push the ego wrestler into frustration → mistakes.
 *    - Brawler vs psychologist: brawler's aggression vs psychologist's
 *      crowd manipulation and reversal skill.
 *    - High adaptability vs low: adaptive wrestler adjusts mid-match
 *      while stubborn one stays in a rut.
 *
 * ── TUNING GUIDE ──
 *
 * To make matches more dramatic:
 *   ↑ EMOTION_MODIFIERS.clutch.damageMod (bigger clutch finishes)
 *   ↑ COMEBACK triggers in ComebackSystem (more comeback moments)
 *   ↓ EMOTION_MIN_DURATION (faster emotional swings)
 *   ↑ frustrated.mistakeChance (more openings from frustration)
 *
 * To make matches more competitive:
 *   ↓ EMOTION_MODIFIERS spread (closer to 1.0 across all states)
 *   ↑ EMOTION_MIN_DURATION (less volatility)
 *   ↑ Confidence mean-reversion rate
 *   ↓ frustrated state scoring thresholds
 *
 * To increase upset potential:
 *   ↑ mistakeChance on Overconfident/Frustrated
 *   ↑ Clutch modifiers
 *   ↓ Dominating damage mod
 *   ↑ Adaptability for underdog archetypes
 */

/**
 * Preset psychology profiles for each wrestler archetype.
 * 7 traits: aggression, baseConfidence, ego, fearThreshold,
 *           crowdSensitivity, momentumInfluence, adaptability
 */
export const PSYCH_PROFILES: Record<string, PsychProfile> = {
	powerhouse: {
		aggression: 0.7,
		baseConfidence: 0.6,
		ego: 0.5,
		fearThreshold: 0.3,   // hard to scare
		crowdSensitivity: 0.4,
		momentumInfluence: 0.5,
		adaptability: 0.3     // slow to change gameplan (bull-headed)
	},
	highflyer: {
		aggression: 0.6,
		baseConfidence: 0.7,
		ego: 0.4,
		fearThreshold: 0.5,
		crowdSensitivity: 0.8, // feeds off the crowd
		momentumInfluence: 0.8, // momentum-dependent style
		adaptability: 0.6      // reads the flow well
	},
	technician: {
		aggression: 0.3,
		baseConfidence: 0.5,
		ego: 0.2,              // humble, precise
		fearThreshold: 0.4,
		crowdSensitivity: 0.3,
		momentumInfluence: 0.3, // consistent regardless of flow
		adaptability: 0.8       // excellent adaptation (game-planning mid-match)
	},
	brawler: {
		aggression: 0.9,
		baseConfidence: 0.5,
		ego: 0.7,              // high ego, believes they're tough
		fearThreshold: 0.2,    // fearless
		crowdSensitivity: 0.3,
		momentumInfluence: 0.4,
		adaptability: 0.2      // stubborn — "I hit harder" is the only gameplan
	},
	psychologist: {
		aggression: 0.4,
		baseConfidence: 0.6,
		ego: 0.6,
		fearThreshold: 0.6,    // plays mind games but can crack
		crowdSensitivity: 0.7, // reads the crowd
		momentumInfluence: 0.6,
		adaptability: 0.7      // reads opponents well
	},
	balanced: {
		aggression: 0.5,
		baseConfidence: 0.55,
		ego: 0.4,
		fearThreshold: 0.5,
		crowdSensitivity: 0.5,
		momentumInfluence: 0.5,
		adaptability: 0.5      // middle of the road
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
		profile.momentumInfluence >= 0 && profile.momentumInfluence <= 1 &&
		profile.adaptability >= 0 && profile.adaptability <= 1
	);
}
