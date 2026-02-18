/**
 * Personality weight dimensions that bias AI decision-making.
 * Each value is normalized to [0, 1].
 */
export interface PersonalityWeights {
	/** Preference for offensive, damage-dealing actions. */
	aggression: number;
	/** Preference for flashy, crowd-pleasing moves. */
	showmanship: number;
	/** Preference for technical wrestling and chain grappling. */
	technique: number;
	/** Preference for pacing, storytelling, and exploiting opponent weakness. */
	psychology: number;
	/** Willingness to attempt high-risk, high-reward moves. */
	riskTaking: number;
}

/**
 * Complete personality profile for an AI wrestler.
 * Combines raw weights with metadata and the bias application function.
 */
export interface PersonalityProfile {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly weights: PersonalityWeights;
}

/**
 * Apply personality bias to a set of utility scores.
 *
 * Each action has a base utility score and a category tag.
 * The personality weights boost or diminish scores based on category alignment.
 *
 * @param baseScores - Array of { action, category, score } where score is in [0, 1].
 * @param weights - The personality weights to apply.
 * @param biasStrength - How strongly personality affects scores (0 = no effect, 1 = full effect). Default 0.5.
 * @returns New array of { action, category, score } with personality-biased scores, clamped to [0, 1].
 */
export function applyPersonalityBias(
	baseScores: Array<{ action: string; category: string; score: number }>,
	weights: PersonalityWeights,
	biasStrength: number = 0.5
): Array<{ action: string; category: string; score: number }> {
	return baseScores.map(({ action, category, score }) => {
		let modifier = 0;

		switch (category) {
			case 'strike':
				modifier = weights.aggression * 0.6 + weights.riskTaking * 0.2;
				break;
			case 'grapple':
				modifier = weights.technique * 0.6 + weights.psychology * 0.2;
				break;
			case 'aerial':
				modifier = weights.riskTaking * 0.5 + weights.showmanship * 0.4;
				break;
			case 'submission':
				modifier = weights.technique * 0.5 + weights.psychology * 0.3;
				break;
			case 'signature':
			case 'finisher':
				modifier = weights.showmanship * 0.4 + weights.aggression * 0.3 + weights.psychology * 0.2;
				break;
			case 'taunt':
			case 'showboat':
				modifier = weights.showmanship * 0.7 + weights.psychology * 0.2;
				break;
			case 'defensive':
				// Defensive actions are inversely related to aggression
				modifier = (1 - weights.aggression) * 0.4 + weights.psychology * 0.3;
				break;
			case 'tactical':
				modifier = weights.psychology * 0.5 + weights.technique * 0.3;
				break;
			default:
				modifier = 0;
				break;
		}

		// Blend the modifier with the base score
		const biasedScore = score + (modifier - 0.5) * biasStrength;
		return {
			action,
			category,
			score: Math.max(0, Math.min(1, biasedScore))
		};
	});
}

/**
 * Create a balanced personality where all weights are equal.
 */
export function createBalancedWeights(): PersonalityWeights {
	return {
		aggression: 0.5,
		showmanship: 0.5,
		technique: 0.5,
		psychology: 0.5,
		riskTaking: 0.5
	};
}

/**
 * Linearly interpolate between two personality profiles.
 * Useful for dynamic personality shifts during a match (e.g., becoming more aggressive when losing).
 */
export function lerpWeights(
	a: PersonalityWeights,
	b: PersonalityWeights,
	t: number
): PersonalityWeights {
	const clampedT = Math.max(0, Math.min(1, t));
	return {
		aggression: a.aggression + (b.aggression - a.aggression) * clampedT,
		showmanship: a.showmanship + (b.showmanship - a.showmanship) * clampedT,
		technique: a.technique + (b.technique - a.technique) * clampedT,
		psychology: a.psychology + (b.psychology - a.psychology) * clampedT,
		riskTaking: a.riskTaking + (b.riskTaking - a.riskTaking) * clampedT
	};
}
