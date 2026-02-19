import type { MoveCategory } from '../utils/types';

/**
 * Combo Definition — describes a chainable sequence of moves.
 *
 * Each combo is a named sequence of moveIds that can be chained
 * within a timing window. Combos reward commitment with scaling
 * damage/momentum and punish overcommitment with increasing stamina costs.
 *
 * DESIGN PRINCIPLES:
 *   - Combos are optional — single attacks still work fine
 *   - Each step has a window (frames) to input the next attack
 *   - Damage scales UP as the chain progresses (reward commitment)
 *   - Stamina scales UP as the chain progresses (prevent infinite chains)
 *   - Missing a hit or getting reversed breaks the combo
 *   - Momentum bonus increases per step (crowd goes wild)
 *   - Finisher unlock: some combos allow a finisher as the final hit
 *
 * ANTI-SPAM:
 *   - Combo window is tight (12–18 frames = 0.2–0.3 seconds)
 *   - Stamina cost multiplier grows exponentially per step
 *   - Recovery frames increase on the final hit of a combo
 *   - Can't start the same combo twice in a row (cooldown)
 */

// ─── Data Types ─────────────────────────────────────────────────────

/**
 * A single step in a combo chain.
 */
export interface ComboStep {
	/** The move to execute at this step. */
	moveId: string;
	/** Frames available to input the next attack after this step's ATTACK_ACTIVE ends.
	 *  The "combo window" — shorter = harder but more stylish. */
	windowFrames: number;
}

/**
 * Complete combo definition — a named chain of moves with scaling rules.
 */
export interface ComboDefinition {
	/** Unique combo identifier (e.g., 'three_hit_strike_combo'). */
	id: string;
	/** Human-readable name for commentary/UI. */
	name: string;
	/** The ordered sequence of moves that form this combo. */
	steps: ComboStep[];
	/** Which wrestling style this combo suits (for AI personality matching). */
	style: 'powerhouse' | 'highflyer' | 'technician' | 'brawler' | 'universal';
	/** Minimum momentum required to START this combo (0 = no requirement). */
	momentumThreshold: number;
	/** If true, a finisher can be chained after the last step as a "combo finisher". */
	finisherUnlock: boolean;
	/** Cooldown in ticks after completing this combo before it can be used again. */
	cooldownFrames: number;

	// ─── Scaling Curves ─────────────────────────────────────────
	/** Damage multiplier at each step index (1-indexed). Step 1 = base, step 2 = scaled, etc.
	 *  If not provided, uses the default scaling formula. */
	damageScaling?: number[];
	/** Stamina cost multiplier at each step index. Default formula used if omitted. */
	staminaScaling?: number[];
	/** Momentum bonus at each step index. Default formula used if omitted. */
	momentumBonus?: number[];
}

/**
 * Live combo state tracked per fighter during a match.
 * This is the "combo meter" — tracks where we are in a chain.
 */
export interface ComboState {
	/** Currently active combo definition (null = not in a combo). */
	activeComboId: string | null;
	/** Current step index in the active combo (0-based). */
	currentStep: number;
	/** Total consecutive hits landed in the current combo. */
	hitCount: number;
	/** Frames remaining in the current combo window (0 = window closed). */
	windowFramesLeft: number;
	/** Whether the combo window is currently open. */
	windowOpen: boolean;
	/** Accumulated damage dealt during this combo chain. */
	comboDamage: number;
	/** Per-combo cooldowns: comboId → remaining frames. */
	cooldowns: Map<string, number>;
	/** The last completed combo's final move, for finisher chaining. */
	lastComboMoveId: string | null;
}

/**
 * Create a fresh ComboState for a new match.
 */
export function createDefaultComboState(): ComboState {
	return {
		activeComboId: null,
		currentStep: 0,
		hitCount: 0,
		windowFramesLeft: 0,
		windowOpen: false,
		comboDamage: 0,
		cooldowns: new Map(),
		lastComboMoveId: null
	};
}

// ─── Scaling Formulas ───────────────────────────────────────────────

/**
 * Default damage scaling for combo step N (0-indexed).
 *
 * Formula: 1.0 + step * 0.15
 *   Step 0 (opener): ×1.0
 *   Step 1:          ×1.15
 *   Step 2:          ×1.30
 *   Step 3:          ×1.45
 *   Step 4+:         ×1.60 (capped)
 *
 * The bonus rewards sustained offense. Max cap prevents infinite scaling.
 */
export function getDefaultDamageScale(step: number): number {
	return Math.min(1.0 + step * 0.15, 1.60);
}

/**
 * Default stamina cost scaling for combo step N (0-indexed).
 *
 * Formula: 1.0 + step * 0.25
 *   Step 0 (opener): ×1.0
 *   Step 1:          ×1.25
 *   Step 2:          ×1.50
 *   Step 3:          ×1.75
 *   Step 4+:         ×2.00 (capped)
 *
 * Stamina scaling is steeper than damage — this is the anti-spam mechanism.
 * Longer combos drain stamina FAST, forcing the fighter to eventually stop.
 */
export function getDefaultStaminaScale(step: number): number {
	return Math.min(1.0 + step * 0.25, 2.0);
}

/**
 * Default momentum bonus per combo step (0-indexed).
 *
 * Formula: 2 + step * 3
 *   Step 0: +2 bonus momentum
 *   Step 1: +5
 *   Step 2: +8
 *   Step 3: +11
 *   Step 4+: +14 (capped)
 *
 * Crowd loves combos — momentum spikes encourage dramatic play.
 */
export function getDefaultMomentumBonus(step: number): number {
	return Math.min(2 + step * 3, 14);
}

/**
 * Get the damage scale for a specific combo at a specific step.
 * Uses the combo's custom scaling if defined, else falls back to default.
 */
export function getComboDamageScale(combo: ComboDefinition, step: number): number {
	if (combo.damageScaling && step < combo.damageScaling.length) {
		return combo.damageScaling[step];
	}
	return getDefaultDamageScale(step);
}

/**
 * Get the stamina scale for a specific combo at a specific step.
 */
export function getComboStaminaScale(combo: ComboDefinition, step: number): number {
	if (combo.staminaScaling && step < combo.staminaScaling.length) {
		return combo.staminaScaling[step];
	}
	return getDefaultStaminaScale(step);
}

/**
 * Get the momentum bonus for a specific combo at a specific step.
 */
export function getComboMomentumBonus(combo: ComboDefinition, step: number): number {
	if (combo.momentumBonus && step < combo.momentumBonus.length) {
		return combo.momentumBonus[step];
	}
	return getDefaultMomentumBonus(step);
}

// ─── Default Combo Definitions ──────────────────────────────────────

const DEFAULT_COMBOS: ComboDefinition[] = [
	// ── Brawler Combos ──
	{
		id: 'jab_jab_chop',
		name: 'One-Two Chop',
		style: 'brawler',
		momentumThreshold: 0,
		finisherUnlock: false,
		cooldownFrames: 120, // 2 second cooldown
		steps: [
			{ moveId: 'jab', windowFrames: 14 },
			{ moveId: 'jab', windowFrames: 14 },
			{ moveId: 'chop', windowFrames: 0 }  // 0 = final step, no chain
		]
	},
	{
		id: 'chop_forearm_clothesline',
		name: 'Stiff Combo',
		style: 'brawler',
		momentumThreshold: 20,
		finisherUnlock: false,
		cooldownFrames: 180,
		steps: [
			{ moveId: 'chop', windowFrames: 16 },
			{ moveId: 'forearm_smash', windowFrames: 14 },
			{ moveId: 'clothesline', windowFrames: 0 }
		]
	},
	{
		id: 'strike_rush',
		name: 'Strike Rush',
		style: 'brawler',
		momentumThreshold: 40,
		finisherUnlock: true,
		cooldownFrames: 300,
		steps: [
			{ moveId: 'jab', windowFrames: 12 },
			{ moveId: 'jab', windowFrames: 12 },
			{ moveId: 'forearm_smash', windowFrames: 14 },
			{ moveId: 'superkick', windowFrames: 0 }
		],
		damageScaling: [1.0, 1.1, 1.25, 1.5],
		momentumBonus: [2, 4, 6, 12]
	},

	// ── Powerhouse Combos ──
	{
		id: 'slam_suplex_combo',
		name: 'Power Surge',
		style: 'powerhouse',
		momentumThreshold: 30,
		finisherUnlock: false,
		cooldownFrames: 240,
		steps: [
			{ moveId: 'body_slam', windowFrames: 18 },
			{ moveId: 'vertical_suplex', windowFrames: 16 },
			{ moveId: 'powerbomb', windowFrames: 0 }
		],
		damageScaling: [1.0, 1.2, 1.5],
		staminaScaling: [1.0, 1.2, 1.4]
	},
	{
		id: 'backbreaker_ddt',
		name: 'Spine Crusher',
		style: 'powerhouse',
		momentumThreshold: 15,
		finisherUnlock: false,
		cooldownFrames: 180,
		steps: [
			{ moveId: 'backbreaker', windowFrames: 16 },
			{ moveId: 'ddt', windowFrames: 0 }
		]
	},

	// ── High Flyer Combos ──
	{
		id: 'kick_enzuigiri_dropkick',
		name: 'Flying Fury',
		style: 'highflyer',
		momentumThreshold: 25,
		finisherUnlock: false,
		cooldownFrames: 180,
		steps: [
			{ moveId: 'kick', windowFrames: 14 },
			{ moveId: 'enzuigiri', windowFrames: 16 },
			{ moveId: 'dropkick', windowFrames: 0 }
		]
	},
	{
		id: 'aerial_assault',
		name: 'Aerial Assault',
		style: 'highflyer',
		momentumThreshold: 50,
		finisherUnlock: true,
		cooldownFrames: 360,
		steps: [
			{ moveId: 'dropkick', windowFrames: 18 },
			{ moveId: 'enzuigiri', windowFrames: 16 },
			{ moveId: 'diving_crossbody', windowFrames: 0 }
		],
		damageScaling: [1.0, 1.2, 1.6],
		momentumBonus: [3, 6, 15]
	},

	// ── Technician Combos ──
	{
		id: 'grapple_chain',
		name: 'Chain Wrestling',
		style: 'technician',
		momentumThreshold: 10,
		finisherUnlock: false,
		cooldownFrames: 180,
		steps: [
			{ moveId: 'headlock_takeover', windowFrames: 18 },
			{ moveId: 'snap_suplex', windowFrames: 16 },
			{ moveId: 'neckbreaker', windowFrames: 0 }
		],
		staminaScaling: [1.0, 1.1, 1.2]  // technicians are more efficient
	},
	{
		id: 'suplex_city',
		name: 'Suplex City',
		style: 'technician',
		momentumThreshold: 40,
		finisherUnlock: true,
		cooldownFrames: 360,
		steps: [
			{ moveId: 'snap_suplex', windowFrames: 18 },
			{ moveId: 'vertical_suplex', windowFrames: 18 },
			{ moveId: 'german_suplex', windowFrames: 16 },
			{ moveId: 'german_suplex', windowFrames: 0 }
		],
		damageScaling: [1.0, 1.15, 1.35, 1.6],
		staminaScaling: [1.0, 1.15, 1.3, 1.5],
		momentumBonus: [3, 5, 8, 15]
	},

	// ── Universal Combos (any style can use) ──
	{
		id: 'quick_combo',
		name: 'Quick Combo',
		style: 'universal',
		momentumThreshold: 0,
		finisherUnlock: false,
		cooldownFrames: 90,
		steps: [
			{ moveId: 'jab', windowFrames: 12 },
			{ moveId: 'kick', windowFrames: 0 }
		]
	}
];

// ─── Registry ───────────────────────────────────────────────────────

/**
 * ComboRegistry — central registry for all combo definitions.
 *
 * Pre-loaded with the default combo set. Additional combos can be
 * registered at runtime (e.g., wrestler-specific combos from data files).
 *
 * Query methods:
 *   - get(id) — look up a specific combo
 *   - getByStyle(style) — get all combos for a wrestling style
 *   - findCombosStartingWith(moveId) — find combos that start with a given move
 *   - findNextCombo(currentMoveId, style) — find a combo that continues from a move
 */
export class ComboRegistry {
	private combos: Map<string, ComboDefinition> = new Map();
	private byStyle: Map<string, ComboDefinition[]> = new Map();
	/** Reverse index: moveId → combos that have this move as step 0 */
	private byOpener: Map<string, ComboDefinition[]> = new Map();

	constructor(initialCombos?: ComboDefinition[]) {
		const combos = initialCombos ?? DEFAULT_COMBOS;
		for (const combo of combos) {
			this.register(combo);
		}
	}

	/**
	 * Register a new combo definition.
	 */
	register(combo: ComboDefinition): void {
		this.combos.set(combo.id, combo);

		// Style index
		const styleList = this.byStyle.get(combo.style) ?? [];
		const existingIdx = styleList.findIndex((c) => c.id === combo.id);
		if (existingIdx >= 0) {
			styleList[existingIdx] = combo;
		} else {
			styleList.push(combo);
		}
		this.byStyle.set(combo.style, styleList);

		// Opener index
		if (combo.steps.length > 0) {
			const openerMoveId = combo.steps[0].moveId;
			const openerList = this.byOpener.get(openerMoveId) ?? [];
			const existIdx = openerList.findIndex((c) => c.id === combo.id);
			if (existIdx >= 0) {
				openerList[existIdx] = combo;
			} else {
				openerList.push(combo);
			}
			this.byOpener.set(openerMoveId, openerList);
		}
	}

	/** Look up a combo by ID. */
	get(id: string): ComboDefinition | undefined {
		return this.combos.get(id);
	}

	/** Get all combos for a given style (includes 'universal'). */
	getByStyle(style: string): ComboDefinition[] {
		const styleSpecific = this.byStyle.get(style) ?? [];
		const universal = this.byStyle.get('universal') ?? [];
		return [...styleSpecific, ...universal];
	}

	/** Find all combos that start with a given move. */
	findCombosStartingWith(moveId: string): ComboDefinition[] {
		return this.byOpener.get(moveId) ?? [];
	}

	/**
	 * Given the current move just executed, find a combo this move could
	 * be the opener for, filtered by style compatibility.
	 *
	 * Returns all matching combos (caller picks the best one).
	 */
	findPotentialCombos(moveId: string, style: string): ComboDefinition[] {
		const combos = this.findCombosStartingWith(moveId);
		return combos.filter((c) => c.style === style || c.style === 'universal');
	}

	/**
	 * Given an active combo and the current step, return the next expected moveId.
	 * Returns null if the combo is complete or invalid.
	 */
	getNextMoveInCombo(comboId: string, currentStep: number): string | null {
		const combo = this.combos.get(comboId);
		if (!combo) return null;
		const nextStep = currentStep + 1;
		if (nextStep >= combo.steps.length) return null;
		return combo.steps[nextStep].moveId;
	}

	/** Get all registered combos. */
	getAll(): ComboDefinition[] {
		return Array.from(this.combos.values());
	}

	/** Check if a combo ID is registered. */
	has(id: string): boolean {
		return this.combos.has(id);
	}

	get size(): number {
		return this.combos.size;
	}
}
