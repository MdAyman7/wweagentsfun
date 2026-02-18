import type { AgentObservation } from '../../components/agent/AgentObservation';
import type { SeededRandom } from '../../utils/random';
import type { ActionResult, Strategy } from '../Strategy';
import type { PersonalityWeights } from '../personality/PersonalityProfile';
import { createBalancedWeights } from '../personality/PersonalityProfile';
import { BTNode, BTStatus, createBTContext, type BTContext } from '../bt/BTNode';
import { Selector } from '../bt/Selector';
import { Sequence } from '../bt/Sequence';
import { Condition } from '../bt/Condition';
import { type UtilityAction, buildDefaultActions } from './UtilityAIStrategy';
import type { ActionName } from '../rl/ActionSpace';
import { clamp } from '../../utils/math';

// ── Observation indices ──
const OBS = {
	SELF_HEALTH: 0,
	SELF_STAMINA: 1,
	SELF_MOMENTUM: 2,
	SELF_IN_GRAPPLE: 6,
	SELF_FATIGUE: 7,
	OPP_HEALTH: 18,
	OPP_MOMENTUM: 20,
	OPP_BLOCKING: 23,
	OPP_PHASE_STUN: 26,
	DISTANCE: 30,
	CROWD_POP: 31,
	MATCH_TENSION: 33,
	COMEBACK_ELIGIBLE: 36,
	NEAR_CORNER: 39,
	GRAPPLE_FRONT: 42,
	GRAPPLE_REAR: 43
} as const;

/**
 * High-level combat categories the behavior tree routes to.
 * Each category has its own subset of utility-scored actions.
 */
export type CombatCategory = 'strike' | 'grapple' | 'defend' | 'aerial' | 'finish' | 'tactical';

/**
 * Category decision leaf: writes the chosen category to the blackboard
 * so the utility layer can filter actions.
 */
class CategoryLeaf extends BTNode {
	private readonly category: CombatCategory;
	private readonly confidence: number;

	constructor(name: string, category: CombatCategory, confidence: number = 0.8) {
		super(name);
		this.category = category;
		this.confidence = confidence;
	}

	tick(context: BTContext): BTStatus {
		context.blackboard.set('category', this.category);
		context.resultConfidence = this.confidence;
		context.resultReasoning = `hybrid:bt:${this.name}->${this.category}`;
		return BTStatus.SUCCESS;
	}
}

/**
 * Build the high-level decision tree for the hybrid strategy.
 * This tree decides WHAT CATEGORY of action to use, not the specific move.
 * The utility layer then selects the best move within that category.
 */
function buildCategoryTree(): BTNode {
	// If in danger -> defend
	const defendBranch = new Sequence('defend_branch', [
		new Condition('low_health', (ctx) => ctx.observationVector[OBS.SELF_HEALTH] < 0.25),
		new Condition('opp_threatening', (ctx) => ctx.observationVector[OBS.OPP_MOMENTUM] > 0.5),
		new CategoryLeaf('choose_defend', 'defend', 0.85)
	]);

	// If high momentum + opponent weak -> finish
	const finishBranch = new Sequence('finish_branch', [
		new Condition('high_momentum', (ctx) => ctx.observationVector[OBS.SELF_MOMENTUM] > 0.7),
		new Condition('opp_weakened', (ctx) => ctx.observationVector[OBS.OPP_HEALTH] < 0.35),
		new CategoryLeaf('choose_finish', 'finish', 0.9)
	]);

	// If in grapple -> grapple
	const grappleBranch = new Sequence('grapple_branch', [
		new Condition('in_grapple', (ctx) => ctx.observationVector[OBS.SELF_IN_GRAPPLE] > 0.5),
		new CategoryLeaf('choose_grapple', 'grapple', 0.8)
	]);

	// If near corner + opponent stunned -> aerial
	const aerialBranch = new Sequence('aerial_branch', [
		new Condition('near_corner', (ctx) => ctx.observationVector[OBS.NEAR_CORNER] > 0.5),
		new Condition('opp_stunned', (ctx) => ctx.observationVector[OBS.OPP_PHASE_STUN] > 0.5),
		new Condition('has_stamina', (ctx) => ctx.observationVector[OBS.SELF_STAMINA] > 0.4),
		new CategoryLeaf('choose_aerial', 'aerial', 0.8)
	]);

	// If opponent is close and not blocking -> grapple initiate
	const closeGrappleBranch = new Sequence('close_grapple_branch', [
		new Condition('close_range', (ctx) => ctx.observationVector[OBS.DISTANCE] < 0.2),
		new Condition('opp_not_blocking', (ctx) => ctx.observationVector[OBS.OPP_BLOCKING] < 0.5),
		new Condition('has_stamina', (ctx) => ctx.observationVector[OBS.SELF_STAMINA] > 0.3),
		new CategoryLeaf('choose_grapple_close', 'grapple', 0.7)
	]);

	// If far away -> tactical (run ropes, irish whip)
	const tacticalBranch = new Sequence('tactical_branch', [
		new Condition('far_away', (ctx) => ctx.observationVector[OBS.DISTANCE] > 0.45),
		new CategoryLeaf('choose_tactical', 'tactical', 0.65)
	]);

	// Default: strike
	const strikeFallback = new CategoryLeaf('default_strike', 'strike', 0.6);

	return new Selector('hybrid_root', [
		defendBranch,
		finishBranch,
		grappleBranch,
		aerialBranch,
		closeGrappleBranch,
		tacticalBranch,
		strikeFallback
	]);
}

/**
 * Map combat categories to valid action subsets.
 */
const CATEGORY_ACTIONS: Record<CombatCategory, ActionName[]> = {
	strike: ['light_strike', 'heavy_strike'],
	grapple: ['grapple_initiate', 'front_grapple_move', 'rear_grapple_move', 'irish_whip'],
	defend: ['block', 'dodge', 'idle'],
	aerial: ['aerial_move', 'run_ropes'],
	finish: ['finisher', 'signature_move', 'pin_attempt'],
	tactical: ['run_ropes', 'irish_whip', 'taunt']
};

/**
 * HybridStrategy: combines behavior tree (high-level) with utility AI (move selection).
 *
 * The behavior tree runs first to determine the combat category
 * (e.g., "defend", "grapple", "finish"). Then a utility AI evaluates
 * only the actions within that category and selects the best one.
 *
 * This gives the benefits of both approaches:
 * - BT provides structured, priority-based high-level decisions.
 * - Utility AI provides nuanced, context-sensitive move selection.
 */
export class HybridStrategy implements Strategy {
	readonly id = 'hybrid';
	private readonly categoryTree: BTNode;
	private readonly allActions: UtilityAction[];
	private readonly personality: PersonalityWeights;
	private readonly biasStrength: number;
	private readonly noiseFactor: number;

	/**
	 * @param personality - Personality weights for utility scoring. Defaults to balanced.
	 * @param categoryTree - Custom behavior tree for category selection. Defaults to built-in.
	 * @param actions - Custom utility action definitions. Defaults to buildDefaultActions().
	 * @param biasStrength - Personality bias strength. Default 0.5.
	 * @param noiseFactor - Random noise factor. Default 0.05.
	 */
	constructor(
		personality?: PersonalityWeights,
		categoryTree?: BTNode,
		actions?: UtilityAction[],
		biasStrength: number = 0.5,
		noiseFactor: number = 0.05
	) {
		this.personality = personality ?? createBalancedWeights();
		this.categoryTree = categoryTree ?? buildCategoryTree();
		this.allActions = actions ?? buildDefaultActions();
		this.biasStrength = biasStrength;
		this.noiseFactor = noiseFactor;
	}

	decide(observation: AgentObservation, random: SeededRandom): ActionResult {
		const vec = observation.vector;

		// Phase 1: Behavior tree determines the combat category
		const btContext = createBTContext(vec, observation.labels);
		btContext.blackboard.set('random', random);

		const btStatus = this.categoryTree.tick(btContext);

		let category: CombatCategory = 'strike'; // default fallback
		if (btStatus === BTStatus.SUCCESS) {
			category = (btContext.blackboard.get('category') as CombatCategory) ?? 'strike';
		}

		// Phase 2: Filter actions to the chosen category
		const validActions = CATEGORY_ACTIONS[category] ?? CATEGORY_ACTIONS['strike'];
		const filteredUtilityActions = this.allActions.filter((ua) =>
			validActions.includes(ua.action)
		);

		// If no matching utility actions, fall back to the first valid action
		if (filteredUtilityActions.length === 0) {
			return {
				action: validActions[0] ?? 'light_strike',
				target: null,
				confidence: 0.3,
				reasoning: `hybrid:${category}:no_utility_match`
			};
		}

		// Phase 3: Utility AI selects the best move within the category
		const scored = filteredUtilityActions.map((ua) => ({
			action: ua.action,
			category: ua.category,
			score: ua.scoreFn(vec)
		}));

		// Apply personality bias
		const biased = scored.map((s) => {
			let modifier = 0;
			switch (s.category) {
				case 'strike':
					modifier = this.personality.aggression * 0.6 + this.personality.riskTaking * 0.2;
					break;
				case 'grapple':
					modifier = this.personality.technique * 0.6 + this.personality.psychology * 0.2;
					break;
				case 'aerial':
					modifier = this.personality.riskTaking * 0.5 + this.personality.showmanship * 0.4;
					break;
				case 'submission':
					modifier = this.personality.technique * 0.5 + this.personality.psychology * 0.3;
					break;
				case 'defensive':
					modifier = (1 - this.personality.aggression) * 0.4 + this.personality.psychology * 0.3;
					break;
				default:
					modifier = 0.5;
					break;
			}
			const biasedScore = s.score + (modifier - 0.5) * this.biasStrength;
			return { ...s, score: clamp(biasedScore, 0, 1) };
		});

		// Add noise for variety
		const noisy = biased.map((s) => ({
			...s,
			score: clamp(s.score + random.float(-this.noiseFactor, this.noiseFactor), 0, 1)
		}));

		// Select the highest scoring action
		noisy.sort((a, b) => b.score - a.score);
		const best = noisy[0];

		return {
			action: best.action,
			target: null,
			confidence: best.score,
			reasoning: `hybrid:${category}->${best.action}(${best.score.toFixed(3)}) [${btContext.resultReasoning}]`
		};
	}

	/**
	 * Reset the behavior tree's internal state.
	 */
	reset(): void {
		this.categoryTree.reset();
	}
}
