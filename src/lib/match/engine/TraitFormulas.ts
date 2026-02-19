import type { AgentState } from './MatchState';
import type {
	PsychProfile,
	AgentPsychState,
	EmotionModifiers
} from './PsychologyTypes';
import { EMOTION_MODIFIERS } from './PsychologyTypes';
import { clamp } from '../../utils/math';

/**
 * TraitFormulas — converts raw trait values + emotional state into
 * concrete gameplay modifiers.
 *
 * The formula chain:
 *
 *   TRAIT (static 0-1)
 *     × EMOTION MODIFIER (from state machine)
 *     × CONTEXT FACTOR (health, momentum, match time)
 *     = EFFECTIVE MODIFIER (applied to gameplay)
 *
 * ── TRAIT IMPACT FORMULAS ──
 *
 * 1. AGGRESSION FORMULA:
 *    effectiveAggression = (trait.aggression × emotionMod.aggressionMod)
 *      × (0.8 + confidence × 0.4)              // confident = more aggressive
 *      × (1.0 + momentumInfluence × momentum)   // momentum amplifies
 *
 * 2. CONFIDENCE FORMULA:
 *    Confidence is DYNAMIC (updated each tick by EmotionMachine).
 *    Impact: affects block chance, special move willingness, crit bonus.
 *    effectiveConfidence = psych.confidence
 *      × (0.7 + ego × 0.3)                     // ego inflates perceived confidence
 *      × emotionContextFactor                   // clutch/desperate modify
 *
 * 3. EGO FORMULA:
 *    Ego doesn't directly modify combat. Instead it:
 *    - Amplifies confidence recovery speed (bouncing back after setbacks)
 *    - Accelerates transition to Overconfident state
 *    - Increases showboating (using bigger moves when winning)
 *    effectiveEgoBias = ego × (1 + healthAdvantage)  // ego inflates when winning
 *
 * 4. FEAR FORMULA:
 *    fearFactor = fearThreshold × (1 - healthPct)
 *      × (1 + takenStreak × 0.15)              // getting hit amplifies fear
 *      × inverseCrowdSupport                    // crowd boos amplify fear
 *    Higher fearFactor → more likely to block, less likely to attack.
 *
 * 5. CROWD SENSITIVITY FORMULA:
 *    crowdImpact = crowdSensitivity × psych.crowdHeat
 *    Positive crowdImpact: boosts confidence, special move weight, crit chance.
 *    Negative crowdImpact: increases fear, block tendency.
 *
 * 6. MOMENTUM INFLUENCE FORMULA:
 *    momentumDrive = momentumInfluence × (momentum / 100)
 *    Higher momentumDrive:
 *      - Increases willingness to use signature/finisher
 *      - Boosts damage slightly
 *      - Reduces idle/rest tendency
 *
 * 7. ADAPTABILITY FORMULA:
 *    Adaptability modifies:
 *      - Hysteresis duration (high adapt = shorter emotion lock)
 *      - Speed of confidence recovery
 *      - Reduced idle tendency when losing (adapts strategy)
 *
 * 8. SPEED FORMULA:
 *    effectiveSpeed = emotionMod.speedMod
 *      × (0.9 + momentum × 0.2)                // high momentum = faster
 *      × comebackBoost                          // comeback boosts speed
 *    Affects: decision interval, windup frame reduction
 */

/**
 * Complete set of effective modifiers computed for one agent at one moment.
 * Used by Agent.decide() and CombatResolver.resolve().
 */
export interface EffectiveModifiers {
	/** Final aggression multiplier for attack weights (0.3 - 2.5) */
	aggression: number;
	/** Final defense multiplier for block/dodge weights (0.2 - 2.0) */
	defense: number;
	/** Final multiplier for signature/finisher move weights (0.1 - 3.0) */
	specialMove: number;
	/** Flat mistake probability (0.0 - 0.3) */
	mistakeChance: number;
	/** Damage multiplier applied in CombatResolver (0.7 - 1.6) */
	damage: number;
	/** Reversal chance multiplier when defending (0.3 - 2.0) */
	reversal: number;
	/** Critical hit chance multiplier (0.5 - 2.0) */
	crit: number;
	/** Speed modifier for decision pacing and attack speed (0.7 - 1.4) */
	speed: number;
	/** Willingness to rest/idle (0.0 - 0.6) */
	idleTendency: number;
	/** Finisher probability boost (0.0 - 1.0, additive to base finisher chance) */
	finisherBoost: number;
	/** The current emotional state (for logging) */
	emotion: string;
	/** Confidence level (for logging) */
	confidence: number;
}

/**
 * Compute effective modifiers for one agent given their current state.
 *
 * This is THE central function that combines traits, emotions, and context
 * into actionable gameplay numbers.
 */
export function computeEffectiveModifiers(
	agent: AgentState,
	opponent: AgentState,
	psych: AgentPsychState,
	profile: PsychProfile
): EffectiveModifiers {
	const emo = EMOTION_MODIFIERS[psych.emotion];
	const healthPct = agent.health / agent.maxHealth;
	const oppHealthPct = opponent.health / opponent.maxHealth;
	const healthAdvantage = healthPct - oppHealthPct;
	const momentumPct = agent.momentum / 100;

	// ── 1. Effective Aggression ──
	const rawAggression = profile.aggression * emo.aggressionMod;
	const confidenceAggressionBoost = 0.8 + psych.confidence * 0.4;
	const momentumAggressionBoost = 1.0 + profile.momentumInfluence * momentumPct * 0.3;
	const aggression = clamp(
		rawAggression * confidenceAggressionBoost * momentumAggressionBoost,
		0.3,
		2.5
	);

	// ── 2. Effective Defense ──
	const rawDefense = (1.0 - profile.aggression * 0.5) * emo.defenseMod;
	const fearFactor = computeFearFactor(healthPct, psych, profile);
	const defense = clamp(
		rawDefense * (1.0 + fearFactor * 0.5),
		0.2,
		2.0
	);

	// ── 3. Special Move Modifier ──
	const rawSpecial = emo.specialMoveMod;
	const confidenceSpecialBoost = 0.6 + psych.confidence * 0.8;
	const momentumSpecialBoost = 1.0 + profile.momentumInfluence * momentumPct * 0.6;
	const specialMove = clamp(
		rawSpecial * confidenceSpecialBoost * momentumSpecialBoost,
		0.1,
		3.0
	);

	// ── 4. Mistake Chance ──
	const baseMistake = emo.mistakeChance;
	// Fear increases mistakes
	const fearMistakeBoost = fearFactor * 0.08;
	// Low stamina increases mistakes
	const staminaMistake = clamp((1 - agent.stamina / agent.maxStamina) * 0.05, 0, 0.05);
	// Ego can cause careless mistakes when overconfident
	const egoMistake = psych.emotion === 'overconfident' ? profile.ego * 0.06 : 0;
	// Frustration compounds mistakes from taken streaks
	const frustrationMistake = psych.emotion === 'frustrated'
		? psych.takenStreak * 0.02
		: 0;
	const mistakeChance = clamp(
		baseMistake + fearMistakeBoost + staminaMistake + egoMistake + frustrationMistake,
		0.0,
		0.3
	);

	// ── 5. Damage Modifier ──
	const rawDamage = emo.damageMod;
	const confidenceDamage = 0.9 + psych.confidence * 0.2;
	const crowdDamage = 1.0 + psych.crowdHeat * profile.crowdSensitivity * 0.1;
	const damage = clamp(
		rawDamage * confidenceDamage * crowdDamage,
		0.7,
		1.6
	);

	// ── 6. Reversal Modifier ──
	const rawReversal = emo.reversalMod;
	const crowdReversal = 1.0 + Math.max(0, psych.crowdHeat) * profile.crowdSensitivity * 0.15;
	const reversal = clamp(
		rawReversal * crowdReversal,
		0.3,
		2.0
	);

	// ── 7. Crit Modifier ──
	const rawCrit = emo.critMod;
	const momentumCrit = 1.0 + profile.momentumInfluence * momentumPct * 0.2;
	const crit = clamp(
		rawCrit * momentumCrit,
		0.5,
		2.0
	);

	// ── 8. Speed Modifier ──
	// Emotional speed base + momentum boost + comeback boost
	const rawSpeed = emo.speedMod;
	const momentumSpeedBoost = 0.9 + momentumPct * 0.2;
	const comebackSpeedBoost = agent.comebackActive ? 1.15 : 1.0;
	const speed = clamp(
		rawSpeed * momentumSpeedBoost * comebackSpeedBoost,
		0.7,
		1.4
	);

	// ── 9. Idle Tendency ──
	// Low when aggressive/desperate/comeback, high when panicking/low stamina
	let idleTendency = 0.1;
	if (psych.emotion === 'panicking') idleTendency = 0.3;
	if (psych.emotion === 'frustrated') idleTendency = 0.05; // frustrated = keeps going
	if (psych.emotion === 'desperate') idleTendency = 0.02;
	if (psych.emotion === 'clutch') idleTendency = 0.05;
	if (agent.comebackActive) idleTendency = 0.01;
	// Adaptable wrestlers rest less when losing (they adjust strategy)
	if (healthAdvantage < -0.15 && profile.adaptability > 0.5) {
		idleTendency *= (1.0 - profile.adaptability * 0.4);
	}
	// Stamina depletion overrides everything except comeback
	if (!agent.comebackActive && agent.stamina / agent.maxStamina < 0.2) {
		idleTendency = Math.max(idleTendency, 0.35);
	}
	idleTendency = clamp(idleTendency, 0.0, 0.6);

	// ── 10. Finisher Boost ──
	// Probability boost for finisher moves, driven by momentum + emotion + confidence
	let finisherBoost = 0;
	if (momentumPct >= 0.8) {
		// High momentum: significant finisher urge
		finisherBoost = 0.2 + profile.momentumInfluence * 0.3;
		// Clutch state makes finishers feel inevitable
		if (psych.emotion === 'clutch') finisherBoost += 0.2;
		// Desperate fighters go for broke
		if (psych.emotion === 'desperate') finisherBoost += 0.15;
		// Overconfident wrestlers love the big move
		if (psych.emotion === 'overconfident') finisherBoost += 0.1;
	}
	finisherBoost = clamp(finisherBoost, 0, 1.0);

	return {
		aggression,
		defense,
		specialMove,
		mistakeChance,
		damage,
		reversal,
		crit,
		speed,
		idleTendency,
		finisherBoost,
		emotion: psych.emotion,
		confidence: psych.confidence
	};
}

/**
 * Compute the effective hysteresis duration for an agent.
 * Adaptable wrestlers transition between emotions faster.
 */
export function computeEffectiveHysteresis(profile: PsychProfile): number {
	// Base: 60 ticks (1 second). High adaptability reduces to ~36 ticks.
	return Math.round(60 * (1.0 - profile.adaptability * 0.4));
}

/**
 * Compute the fear factor for an agent.
 * Higher = more afraid. Range [0, 1].
 */
function computeFearFactor(
	healthPct: number,
	psych: AgentPsychState,
	profile: PsychProfile
): number {
	// Base fear from health deficit
	const healthFear = clamp(1.0 - healthPct, 0, 1);
	// Fear threshold gates how easily they get scared
	const thresholdedFear = healthFear * profile.fearThreshold;
	// Taking hits amplifies fear
	const streakFear = psych.takenStreak * 0.08;
	// Crowd hostility amplifies fear
	const crowdFear = Math.max(0, -psych.crowdHeat) * profile.crowdSensitivity * 0.15;
	// Near-knockdown events compound fear
	const knockdownFear = psych.nearKnockdowns * 0.05;
	// Confidence counteracts fear
	const confidenceReduction = psych.confidence * 0.3;
	// Adaptability reduces fear (can adjust gameplan under pressure)
	const adaptReduction = profile.adaptability * 0.1;

	return clamp(
		thresholdedFear + streakFear + crowdFear + knockdownFear - confidenceReduction - adaptReduction,
		0,
		1
	);
}
