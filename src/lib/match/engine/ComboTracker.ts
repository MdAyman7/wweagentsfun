import {
	ComboRegistry,
	type ComboDefinition,
	type ComboState,
	createDefaultComboState,
	getComboDamageScale,
	getComboStaminaScale,
	getComboMomentumBonus
} from '../../combat/ComboRegistry';

/**
 * ComboTracker — per-fighter combo state machine.
 *
 * Tracks active combos, validates chain progression, computes scaling,
 * and manages combo cooldowns. One instance per fighter per match.
 *
 * The match loop consults the tracker at two critical points:
 *
 *   1. AFTER a hit lands (runCombatPhase):
 *      - Call onHitLanded(moveId) to advance/start a combo
 *      - If a combo step matched, call shouldOpenComboWindow() → returns window frames
 *      - Set the FSM's comboWindowPending flag
 *
 *   2. DURING the combo window (AI decision or auto-chain):
 *      - Call getNextComboMove() to get the expected next move
 *      - Push REQUEST_COMBO_ATTACK into the FSM
 *
 * Combo break conditions (handled by the match loop calling onComboBreak()):
 *   - Attack missed
 *   - Attack was reversed
 *   - Fighter got hit (HIT_RECEIVED in COMBO_WINDOW)
 *   - Fighter got knocked down
 *   - Combo window expired (COMBO_WINDOW_EXPIRED action)
 *
 * DESIGN:
 *   - ComboTracker is pure logic — no FSM mutation, no reducer dispatch
 *   - The match loop is the bridge between ComboTracker and FSM/Reducer
 *   - All combo state reads are via the ComboState snapshot
 *   - Cooldowns tick down every simulation tick (called by match loop)
 */
export class ComboTracker {
	private state: ComboState;
	private readonly registry: ComboRegistry;
	/** Wrestling style for this fighter (for combo matching). */
	private readonly style: string;

	constructor(registry: ComboRegistry, style: string) {
		this.registry = registry;
		this.style = style;
		this.state = createDefaultComboState();
	}

	// ─── Public Reads ───────────────────────────────────────────

	/** Current combo state snapshot (read-only). */
	get comboState(): Readonly<ComboState> {
		return this.state;
	}

	/** Whether a combo is currently active. */
	get isInCombo(): boolean {
		return this.state.activeComboId !== null;
	}

	/** Current combo step (0-indexed). -1 if not in combo. */
	get currentStep(): number {
		return this.state.activeComboId !== null ? this.state.currentStep : -1;
	}

	/** Total hits in current combo chain. */
	get hitCount(): number {
		return this.state.hitCount;
	}

	/** Accumulated damage in current combo. */
	get comboDamage(): number {
		return this.state.comboDamage;
	}

	/** Active combo definition (null if not in combo). */
	get activeCombo(): ComboDefinition | undefined {
		return this.state.activeComboId
			? this.registry.get(this.state.activeComboId)
			: undefined;
	}

	// ─── Combat Event Handlers ──────────────────────────────────

	/**
	 * Called when a hit lands successfully.
	 * Determines if this hit starts, continues, or completes a combo.
	 *
	 * @returns Object with combo status for the match loop to process.
	 */
	onHitLanded(moveId: string, damage: number): ComboHitResult {
		if (this.state.activeComboId) {
			// Already in a combo — check if this move matches the expected step
			return this.advanceCombo(moveId, damage);
		} else {
			// Not in a combo — check if this move can start one
			return this.tryStartCombo(moveId, damage);
		}
	}

	/**
	 * Called when the combo should break (miss, reversal, hit received, window expired).
	 */
	onComboBreak(reason: ComboBreakReason): void {
		if (!this.state.activeComboId) return;

		this.state = {
			...this.state,
			activeComboId: null,
			currentStep: 0,
			hitCount: 0,
			windowFramesLeft: 0,
			windowOpen: false,
			comboDamage: 0,
			lastComboMoveId: null
		};

		// (The match loop emits the COMBO_BREAK log entry using the reason)
		void reason; // consumed by match loop for logging
	}

	/**
	 * Check if a combo window should open after the current attack.
	 * Called after onHitLanded() returns a successful combo step.
	 *
	 * @returns The number of frames for the window, or 0 if no window.
	 */
	getComboWindowFrames(): number {
		const combo = this.activeCombo;
		if (!combo) return 0;

		const step = this.state.currentStep;
		if (step >= combo.steps.length) return 0;

		// Current step's window frames (0 = final step, no window)
		return combo.steps[step].windowFrames;
	}

	/**
	 * Get the next expected move ID in the current combo chain.
	 * Returns null if not in a combo or combo is complete.
	 */
	getNextComboMove(): string | null {
		const combo = this.activeCombo;
		if (!combo) return null;

		const nextStep = this.state.currentStep + 1;
		if (nextStep >= combo.steps.length) return null;

		return combo.steps[nextStep].moveId;
	}

	/**
	 * Check if the current combo unlocks a finisher.
	 * True when the combo is complete AND has finisherUnlock = true.
	 */
	isFinisherUnlocked(): boolean {
		const combo = this.activeCombo;
		if (!combo || !combo.finisherUnlock) return false;
		return this.state.currentStep >= combo.steps.length - 1;
	}

	// ─── Scaling Queries ────────────────────────────────────────

	/**
	 * Get the damage scale multiplier for the current combo step.
	 */
	getDamageScale(): number {
		const combo = this.activeCombo;
		if (!combo) return 1.0;
		return getComboDamageScale(combo, this.state.currentStep);
	}

	/**
	 * Get the stamina cost multiplier for the current combo step.
	 */
	getStaminaScale(): number {
		const combo = this.activeCombo;
		if (!combo) return 1.0;
		return getComboStaminaScale(combo, this.state.currentStep);
	}

	/**
	 * Get the bonus momentum for the current combo step.
	 */
	getMomentumBonus(): number {
		const combo = this.activeCombo;
		if (!combo) return 0;
		return getComboMomentumBonus(combo, this.state.currentStep);
	}

	// ─── Tick ───────────────────────────────────────────────────

	/**
	 * Called once per simulation tick. Decrements combo cooldowns.
	 */
	tick(): void {
		// Decrement all cooldowns
		for (const [comboId, remaining] of this.state.cooldowns.entries()) {
			if (remaining <= 1) {
				this.state.cooldowns.delete(comboId);
			} else {
				this.state.cooldowns.set(comboId, remaining - 1);
			}
		}
	}

	// ─── Internal ───────────────────────────────────────────────

	/**
	 * Try to start a new combo with the given move as the opener.
	 */
	private tryStartCombo(moveId: string, damage: number): ComboHitResult {
		const potentialCombos = this.registry.findPotentialCombos(moveId, this.style);

		for (const combo of potentialCombos) {
			// Skip if on cooldown
			if (this.state.cooldowns.has(combo.id)) continue;

			// Check if first step matches
			if (combo.steps.length > 0 && combo.steps[0].moveId === moveId) {
				// Start the combo!
				this.state = {
					...this.state,
					activeComboId: combo.id,
					currentStep: 0,
					hitCount: 1,
					comboDamage: damage,
					lastComboMoveId: moveId,
					windowOpen: false,
					windowFramesLeft: 0
				};

				return {
					comboStarted: true,
					comboContinued: false,
					comboCompleted: false,
					comboId: combo.id,
					comboName: combo.name,
					step: 0,
					totalSteps: combo.steps.length,
					damageScale: getComboDamageScale(combo, 0),
					staminaScale: getComboStaminaScale(combo, 0),
					momentumBonus: getComboMomentumBonus(combo, 0),
					finisherUnlocked: false,
					windowFrames: combo.steps[0].windowFrames
				};
			}
		}

		// No combo found — this is a standalone hit
		return {
			comboStarted: false,
			comboContinued: false,
			comboCompleted: false,
			comboId: null,
			comboName: null,
			step: 0,
			totalSteps: 0,
			damageScale: 1.0,
			staminaScale: 1.0,
			momentumBonus: 0,
			finisherUnlocked: false,
			windowFrames: 0
		};
	}

	/**
	 * Advance the active combo by one step.
	 */
	private advanceCombo(moveId: string, damage: number): ComboHitResult {
		const combo = this.activeCombo;
		if (!combo) {
			// Defensive: shouldn't happen if activeComboId is set
			return this.tryStartCombo(moveId, damage);
		}

		const expectedStep = this.state.currentStep + 1;

		// Check if the move matches the expected step
		if (expectedStep < combo.steps.length && combo.steps[expectedStep].moveId === moveId) {
			// Combo continues!
			const isComplete = expectedStep === combo.steps.length - 1;

			this.state = {
				...this.state,
				currentStep: expectedStep,
				hitCount: this.state.hitCount + 1,
				comboDamage: this.state.comboDamage + damage,
				lastComboMoveId: moveId,
				windowOpen: false,
				windowFramesLeft: 0
			};

			if (isComplete) {
				// Combo completed — apply cooldown and reset state
				const cooldownFrames = combo.cooldownFrames;
				this.state.cooldowns.set(combo.id, cooldownFrames);

				// Keep the activeComboId briefly so the match loop can check finisher unlock
				// It will be cleared on the next onComboBreak() or naturally
			}

			return {
				comboStarted: false,
				comboContinued: !isComplete,
				comboCompleted: isComplete,
				comboId: combo.id,
				comboName: combo.name,
				step: expectedStep,
				totalSteps: combo.steps.length,
				damageScale: getComboDamageScale(combo, expectedStep),
				staminaScale: getComboStaminaScale(combo, expectedStep),
				momentumBonus: getComboMomentumBonus(combo, expectedStep),
				finisherUnlocked: isComplete && combo.finisherUnlock,
				windowFrames: combo.steps[expectedStep].windowFrames
			};
		} else {
			// Wrong move — combo broken, but this move might start a new combo
			this.onComboBreak('wrong_move');
			return this.tryStartCombo(moveId, damage);
		}
	}
}

// ─── Result Types ───────────────────────────────────────────────────

/**
 * Result of processing a hit through the combo tracker.
 * The match loop uses this to determine what to do next.
 */
export interface ComboHitResult {
	/** A new combo started with this hit. */
	comboStarted: boolean;
	/** An existing combo chain continued. */
	comboContinued: boolean;
	/** The combo was completed (final step landed). */
	comboCompleted: boolean;
	/** Combo ID (null if no combo). */
	comboId: string | null;
	/** Combo display name (null if no combo). */
	comboName: string | null;
	/** Current step index in the combo (0-based). */
	step: number;
	/** Total steps in this combo. */
	totalSteps: number;
	/** Damage scale multiplier for this step. */
	damageScale: number;
	/** Stamina cost multiplier for this step. */
	staminaScale: number;
	/** Bonus momentum for this step. */
	momentumBonus: number;
	/** Whether the completed combo unlocks a finisher. */
	finisherUnlocked: boolean;
	/** Frames for the combo window after this step (0 = no window / final step). */
	windowFrames: number;
}

/** Reason for combo break (for logging). */
export type ComboBreakReason =
	| 'miss'
	| 'reversed'
	| 'hit_received'
	| 'knocked_down'
	| 'window_expired'
	| 'wrong_move';
