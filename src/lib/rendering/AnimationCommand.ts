import type { AgentPhase } from '../match/engine/MatchState';
import type { MoveCategory, BodyRegion } from '../utils/types';

/**
 * Rich animation command sent from the sync layer (MatchScreen) to the
 * rendering layer each tick. Carries everything the animation system needs
 * to produce move-specific, context-aware procedural poses.
 *
 * Built from MatchState — no module boundary violations.
 */
export interface AnimationCommand {
	/** Current combat phase (maps to top-level anim state). */
	phase: AgentPhase;
	/** Frames remaining in current phase (for animation timing). */
	phaseFrames: number;
	/** Total frames of current phase (for normalized progress). */
	phaseTotalFrames: number;
	/** Active move ID (null if not attacking). */
	moveId: string | null;
	/** Move category: strike, grapple, aerial, etc. */
	moveCategory: MoveCategory | null;
	/** Body region targeted by the move. */
	targetRegion: BodyRegion | null;
	/** Combo step index (-1 if not in combo). */
	comboStep: number;
	/** Total combo steps (-1 if not in combo). */
	comboTotalSteps: number;
	/** Normalized velocity (0-1). */
	velocity: number;
	/** Whether a comeback is active (for intensity scaling). */
	comebackActive: boolean;
	/** Current emotional state. */
	emotion: string;
	/** Knockback direction and intensity (null if none). */
	knockback: { direction: number; intensity: number } | null;
	/** Opponent's relative position on the X axis. */
	opponentRelativeX: number;
	/** Role in a finisher sequence. */
	finisherRole: 'attacker' | 'defender' | 'none';
}
