import type { AgentObservation } from '../../components/agent/AgentObservation';
import type { SeededRandom } from '../../utils/random';
import type { ActionResult, Strategy } from '../Strategy';
import { BTNode, BTStatus, createBTContext, type BTContext } from '../bt/BTNode';
import { Selector } from '../bt/Selector';
import { Sequence } from '../bt/Sequence';
import { Condition } from '../bt/Condition';

/**
 * Action leaf node: sets the action result on the context and returns SUCCESS.
 * This is how a behavior tree ultimately produces an action decision.
 */
export class ActionLeaf extends BTNode {
	private readonly action: string;
	private readonly confidence: number;

	constructor(name: string, action: string, confidence: number = 0.8) {
		super(name);
		this.action = action;
		this.confidence = confidence;
	}

	tick(context: BTContext): BTStatus {
		context.resultAction = this.action;
		context.resultConfidence = this.confidence;
		context.resultReasoning = `bt:${this.name}`;
		return BTStatus.SUCCESS;
	}
}

/**
 * Random action leaf: picks randomly from a set of actions.
 * The context's blackboard must have a 'random' key with a SeededRandom instance.
 */
export class RandomActionLeaf extends BTNode {
	private readonly actions: string[];
	private readonly confidence: number;

	constructor(name: string, actions: string[], confidence: number = 0.6) {
		super(name);
		this.actions = actions;
		this.confidence = confidence;
	}

	tick(context: BTContext): BTStatus {
		const random = context.blackboard.get('random') as SeededRandom | undefined;
		const action = random ? random.pick(this.actions) : this.actions[0];
		context.resultAction = action;
		context.resultConfidence = this.confidence;
		context.resultReasoning = `bt:${this.name}:random`;
		return BTStatus.SUCCESS;
	}
}

// ── Observation index constants (matching ObservationSpace layout) ──
const OBS = {
	SELF_HEALTH: 0,
	SELF_STAMINA: 1,
	SELF_MOMENTUM: 2,
	SELF_BLOCKING: 5,
	SELF_IN_GRAPPLE: 6,
	SELF_FATIGUE: 7,
	SELF_PHASE_IDLE: 12,
	SELF_PHASE_STUN: 16,
	OPP_HEALTH: 18,
	OPP_STAMINA: 19,
	OPP_MOMENTUM: 20,
	OPP_BLOCKING: 23,
	OPP_PHASE_IDLE: 25,
	OPP_PHASE_STUN: 26,
	OPP_HEAD_DAMAGE: 27,
	OPP_BODY_DAMAGE: 28,
	OPP_LEGS_DAMAGE: 29,
	DISTANCE: 30,
	CROWD_POP: 31,
	MATCH_TENSION: 33,
	COMEBACK_ELIGIBLE: 36,
	NEAR_CORNER: 39,
	GRAPPLE_FRONT: 42,
	GRAPPLE_REAR: 43
} as const;

/**
 * Build the default wrestling behavior tree.
 *
 * High-level logic:
 * 1. If in danger (low health + opponent has momentum) -> defend
 * 2. If in grapple -> execute grapple moves
 * 3. If momentum is high enough -> attempt finisher
 * 4. If comeback eligible -> go aggressive
 * 5. If far away -> approach (run ropes or close distance)
 * 6. If opponent is stunned -> capitalize
 * 7. Default offensive behavior (strikes/grapples)
 */
export function buildDefaultTree(): BTNode {
	// ── Defensive branch ──
	const defenseBranch = new Sequence('defend_when_danger', [
		new Condition('low_health', (ctx) => ctx.observationVector[OBS.SELF_HEALTH] < 0.25),
		new Condition('opp_has_momentum', (ctx) => ctx.observationVector[OBS.OPP_MOMENTUM] > 0.6),
		new Selector('choose_defense', [
			new Sequence('block_if_close', [
				new Condition('close_range', (ctx) => ctx.observationVector[OBS.DISTANCE] < 0.2),
				new ActionLeaf('block', 'block', 0.85)
			]),
			new ActionLeaf('dodge', 'dodge', 0.75)
		])
	]);

	// ── Grapple branch ──
	const grappleBranch = new Sequence('grapple_actions', [
		new Condition('in_grapple', (ctx) => ctx.observationVector[OBS.SELF_IN_GRAPPLE] > 0.5),
		new Selector('choose_grapple_move', [
			new Sequence('front_grapple', [
				new Condition('front_facelock', (ctx) => ctx.observationVector[OBS.GRAPPLE_FRONT] > 0.5),
				new ActionLeaf('front_grapple', 'front_grapple_move', 0.8)
			]),
			new Sequence('rear_grapple', [
				new Condition('rear_waistlock', (ctx) => ctx.observationVector[OBS.GRAPPLE_REAR] > 0.5),
				new ActionLeaf('rear_grapple', 'rear_grapple_move', 0.8)
			]),
			new ActionLeaf('default_grapple', 'front_grapple_move', 0.6)
		])
	]);

	// ── Finisher branch ──
	const finisherBranch = new Sequence('attempt_finisher', [
		new Condition('high_momentum', (ctx) => ctx.observationVector[OBS.SELF_MOMENTUM] > 0.8),
		new Condition('opp_weakened', (ctx) => ctx.observationVector[OBS.OPP_HEALTH] < 0.35),
		new Condition('close_enough', (ctx) => ctx.observationVector[OBS.DISTANCE] < 0.25),
		new ActionLeaf('finisher', 'finisher', 0.95)
	]);

	// ── Signature branch ──
	const signatureBranch = new Sequence('attempt_signature', [
		new Condition('good_momentum', (ctx) => ctx.observationVector[OBS.SELF_MOMENTUM] > 0.55),
		new Condition('close_enough', (ctx) => ctx.observationVector[OBS.DISTANCE] < 0.3),
		new ActionLeaf('signature', 'signature_move', 0.85)
	]);

	// ── Comeback branch ──
	const comebackBranch = new Sequence('comeback_sequence', [
		new Condition('comeback_ready', (ctx) => ctx.observationVector[OBS.COMEBACK_ELIGIBLE] > 0.5),
		new Selector('comeback_attacks', [
			new Sequence('corner_aerial', [
				new Condition('near_corner', (ctx) => ctx.observationVector[OBS.NEAR_CORNER] > 0.5),
				new ActionLeaf('aerial_comeback', 'aerial_move', 0.8)
			]),
			new ActionLeaf('heavy_strike_comeback', 'heavy_strike', 0.9)
		])
	]);

	// ── Capitalize on stunned opponent ──
	const capitalizeBranch = new Sequence('capitalize_stun', [
		new Condition('opp_stunned', (ctx) => ctx.observationVector[OBS.OPP_PHASE_STUN] > 0.5),
		new Selector('choose_capitalization', [
			new Sequence('pin_if_weak', [
				new Condition('opp_very_weak', (ctx) => ctx.observationVector[OBS.OPP_HEALTH] < 0.2),
				new ActionLeaf('pin_attempt', 'pin_attempt', 0.9)
			]),
			new Sequence('submission_if_damaged_legs', [
				new Condition('legs_damaged', (ctx) => ctx.observationVector[OBS.OPP_LEGS_DAMAGE] > 0.5),
				new ActionLeaf('submission', 'submission', 0.8)
			]),
			new ActionLeaf('heavy_strike_stunned', 'heavy_strike', 0.85)
		])
	]);

	// ── Close distance branch ──
	const closeBranch = new Sequence('close_distance', [
		new Condition('far_away', (ctx) => ctx.observationVector[OBS.DISTANCE] > 0.5),
		new Selector('approach', [
			new ActionLeaf('run_ropes', 'run_ropes', 0.7),
			new ActionLeaf('irish_whip', 'irish_whip', 0.6)
		])
	]);

	// ── Showboat branch (when clearly winning) ──
	const showboatBranch = new Sequence('showboat', [
		new Condition('healthy', (ctx) => ctx.observationVector[OBS.SELF_HEALTH] > 0.7),
		new Condition('crowd_wants_it', (ctx) => ctx.observationVector[OBS.CROWD_POP] > 0.7),
		new Condition('opp_weakened', (ctx) => ctx.observationVector[OBS.OPP_HEALTH] < 0.4),
		new ActionLeaf('taunt', 'taunt', 0.7)
	]);

	// ── Default offense branch ──
	const defaultOffense = new Selector('default_offense', [
		new Sequence('initiate_grapple', [
			new Condition('close_range', (ctx) => ctx.observationVector[OBS.DISTANCE] < 0.2),
			new Condition('has_stamina', (ctx) => ctx.observationVector[OBS.SELF_STAMINA] > 0.3),
			new Condition('opp_not_blocking', (ctx) => ctx.observationVector[OBS.OPP_BLOCKING] < 0.5),
			new ActionLeaf('grapple_initiate', 'grapple_initiate', 0.7)
		]),
		new Sequence('strike_if_close', [
			new Condition('medium_range', (ctx) => ctx.observationVector[OBS.DISTANCE] < 0.35),
			new RandomActionLeaf('random_strike', ['light_strike', 'heavy_strike'], 0.7)
		]),
		new ActionLeaf('light_strike_fallback', 'light_strike', 0.5)
	]);

	// ── Root selector: priority-ordered ──
	return new Selector('root', [
		defenseBranch,
		grappleBranch,
		finisherBranch,
		signatureBranch,
		comebackBranch,
		capitalizeBranch,
		closeBranch,
		showboatBranch,
		defaultOffense
	]);
}

/**
 * BehaviorTreeStrategy: uses a behavior tree to make decisions.
 *
 * The tree is evaluated top-to-bottom each decision tick.
 * The first branch that succeeds determines the action.
 * The tree writes its result to the BTContext, which is then
 * converted to an ActionResult.
 */
export class BehaviorTreeStrategy implements Strategy {
	readonly id = 'behavior_tree';
	private readonly root: BTNode;

	/**
	 * @param root - The root node of the behavior tree.
	 *              Defaults to buildDefaultTree() if not provided.
	 */
	constructor(root?: BTNode) {
		this.root = root ?? buildDefaultTree();
	}

	decide(observation: AgentObservation, random: SeededRandom): ActionResult {
		const context = createBTContext(observation.vector, observation.labels);
		// Make the RNG available to tree nodes via blackboard
		context.blackboard.set('random', random);

		const status = this.root.tick(context);

		// If the tree couldn't decide (all branches failed), fall back to idle
		if (status === BTStatus.FAILURE) {
			return {
				action: 'idle',
				target: null,
				confidence: 0.1,
				reasoning: 'bt:all_branches_failed'
			};
		}

		return {
			action: context.resultAction,
			target: context.resultTarget,
			confidence: context.resultConfidence,
			reasoning: context.resultReasoning
		};
	}

	/**
	 * Reset the tree's internal state (for RUNNING node tracking).
	 */
	reset(): void {
		this.root.reset();
	}
}
