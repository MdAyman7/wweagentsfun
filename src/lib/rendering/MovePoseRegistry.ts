import type { ProceduralPose } from './ProceduralAnimator';
import type { MoveCategory } from '../utils/types';

/**
 * Transition speed for animation state changes.
 */
export type TransitionMode = 'snap' | 'fast' | 'smooth';

/**
 * Per-move pose configuration. Defines how a specific move looks
 * across its windup → active → recovery phases.
 */
export interface MovePoseConfig {
	/** Which arm leads the attack. */
	leadArm: 'left' | 'right' | 'both';
	/** Target pose during windup (partial — unset channels stay at base). */
	windup: Partial<ProceduralPose>;
	/** Target pose during active/impact (partial). */
	active: Partial<ProceduralPose>;
	/** Whether to use IK during active phase (grapples/finishers). */
	useIK: boolean;
	/** Visual root motion offsets. */
	rootMotion: { windupX: number; activeX: number; activeY: number };
	/** Transition speed override (null = use default). */
	transitionMode: TransitionMode | null;
	/** Upper/lower body split (1 = upper only, 0 = full body). */
	upperBodyRatio: number;
}

// ─── Category Fallback Poses ──────────────────────────────────────

const STRIKE_FALLBACK: MovePoseConfig = {
	leadArm: 'right',
	windup: { rightArmX: 0.3, bodyRotY: -0.15, bodyX: -0.05 },
	active: { rightArmX: -1.2, bodyRotY: 0.2, bodyX: -0.15 },
	useIK: false,
	rootMotion: { windupX: -0.03, activeX: 0.1, activeY: 0 },
	transitionMode: null,
	upperBodyRatio: 0.85
};

const GRAPPLE_FALLBACK: MovePoseConfig = {
	leadArm: 'both',
	windup: { leftArmX: -0.5, rightArmX: -0.5, bodyX: -0.15 },
	active: { leftArmX: -0.7, rightArmX: -0.7, bodyX: 0.3, bodyY: 0.1 },
	useIK: true,
	rootMotion: { windupX: 0.08, activeX: -0.05, activeY: 0.1 },
	transitionMode: null,
	upperBodyRatio: 0.3
};

const AERIAL_FALLBACK: MovePoseConfig = {
	leadArm: 'both',
	windup: { leftLegX: -0.3, rightLegX: -0.3, bodyY: -0.1, bodyX: -0.2 },
	active: { leftArmZ: Math.PI * 0.5, rightArmZ: -Math.PI * 0.5, bodyY: 0.3, bodyX: -0.3 },
	useIK: false,
	rootMotion: { windupX: -0.05, activeX: 0.15, activeY: 0.25 },
	transitionMode: null,
	upperBodyRatio: 0.2
};

const SUBMISSION_FALLBACK: MovePoseConfig = {
	leadArm: 'both',
	windup: { leftArmX: -0.4, rightArmX: -0.4, bodyX: -0.1 },
	active: { leftArmX: -0.6, rightArmX: -0.6, bodyX: -0.2, bodyRotY: 0.15 },
	useIK: true,
	rootMotion: { windupX: 0.05, activeX: 0, activeY: 0 },
	transitionMode: null,
	upperBodyRatio: 0.4
};

const FINISHER_FALLBACK: MovePoseConfig = {
	leadArm: 'both',
	windup: { leftArmX: -0.4, rightArmX: -0.4, bodyX: -0.1, bodyY: -0.05 },
	active: { leftArmX: -0.9, rightArmX: -0.9, bodyX: 0.4, bodyY: 0.2, bodyRotY: 0.2 },
	useIK: true,
	rootMotion: { windupX: 0.1, activeX: -0.1, activeY: 0.15 },
	transitionMode: 'fast',
	upperBodyRatio: 0.2
};

// ─── Move-Specific Poses ──────────────────────────────────────────

const MOVE_POSES: Record<string, MovePoseConfig> = {
	// ── STRIKES ──
	jab: {
		leadArm: 'right',
		windup: { rightArmX: 0.2, bodyRotY: -0.1 },
		active: { rightArmX: -1.3, rightForearmX: -0.1, bodyRotY: 0.15 },
		useIK: false,
		rootMotion: { windupX: -0.02, activeX: 0.06, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.95
	},
	hook: {
		leadArm: 'right',
		windup: { rightArmZ: -Math.PI * 0.4, rightArmX: -0.1, bodyRotY: -0.3 },
		active: { rightArmZ: -Math.PI * 0.15, rightArmX: -0.8, bodyRotY: 0.35, rightForearmX: -0.6 },
		useIK: false,
		rootMotion: { windupX: -0.03, activeX: 0.08, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.8
	},
	uppercut: {
		leadArm: 'right',
		windup: { rightArmX: 0.3, rightArmZ: -Math.PI * 0.1, bodyY: -0.08, bodyX: 0.1 },
		active: { rightArmX: -1.0, rightArmZ: -Math.PI * 0.2, bodyY: 0.08, bodyX: -0.15 },
		useIK: false,
		rootMotion: { windupX: -0.02, activeX: 0.05, activeY: 0.05 },
		transitionMode: null,
		upperBodyRatio: 0.75
	},
	chop: {
		leadArm: 'right',
		windup: { rightArmZ: -Math.PI * 0.6, rightArmX: -0.2, bodyRotY: -0.2 },
		active: { rightArmZ: -Math.PI * 0.1, rightArmX: -0.4, bodyRotY: 0.15 },
		useIK: false,
		rootMotion: { windupX: -0.01, activeX: 0.04, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.9
	},
	kick: {
		leadArm: 'both',
		windup: { rightLegX: -0.6, rightCalfX: 0.5, bodyX: -0.1 },
		active: { rightLegX: 0.7, rightCalfX: 0, bodyX: 0.08 },
		useIK: false,
		rootMotion: { windupX: -0.03, activeX: 0.08, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.25
	},
	roundhouse_kick: {
		leadArm: 'both',
		windup: { rightLegX: -0.5, rightCalfX: 0.4, bodyRotY: -0.3, bodyX: -0.15 },
		active: { rightLegX: 0.6, rightLegZ: 0.3, rightCalfX: 0, bodyRotY: 0.4, bodyX: 0.1 },
		useIK: false,
		rootMotion: { windupX: -0.04, activeX: 0.12, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.2
	},
	superkick: {
		leadArm: 'both',
		windup: { rightLegX: -0.8, rightCalfX: 0.6, bodyX: -0.15, leftArmZ: Math.PI * 0.3 },
		active: { rightLegX: 1.2, rightCalfX: 0, bodyX: 0.1, leftArmZ: Math.PI * 0.4 },
		useIK: false,
		rootMotion: { windupX: -0.05, activeX: 0.15, activeY: 0.05 },
		transitionMode: null,
		upperBodyRatio: 0.2
	},
	clothesline: {
		leadArm: 'right',
		windup: { rightArmZ: -Math.PI * 0.65, rightArmX: 0.1, bodyX: -0.2 },
		active: { rightArmZ: -Math.PI * 0.1, rightArmX: -0.5, bodyX: -0.15, bodyRotY: 0.2 },
		useIK: false,
		rootMotion: { windupX: 0, activeX: 0.2, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.6
	},
	elbow_strike: {
		leadArm: 'right',
		windup: { rightArmX: -0.3, rightForearmX: -1.2, bodyRotY: -0.2 },
		active: { rightArmX: -0.6, rightForearmX: -0.8, bodyRotY: 0.25, bodyX: -0.1 },
		useIK: false,
		rootMotion: { windupX: -0.02, activeX: 0.08, activeY: 0 },
		transitionMode: null,
		upperBodyRatio: 0.9
	},
	knee_strike: {
		leadArm: 'both',
		windup: { rightLegX: -0.5, rightCalfX: 0.7, bodyX: -0.05 },
		active: { rightLegX: 0.4, rightCalfX: -0.2, bodyX: -0.1, bodyY: 0.03 },
		useIK: false,
		rootMotion: { windupX: -0.02, activeX: 0.06, activeY: 0.03 },
		transitionMode: null,
		upperBodyRatio: 0.3
	},

	// ── GRAPPLES ──
	bodyslam: {
		leadArm: 'both',
		windup: { leftArmX: -0.6, rightArmX: -0.6, bodyX: -0.2 },
		active: { leftArmZ: Math.PI * 0.3, rightArmZ: -Math.PI * 0.3, bodyX: 0.4, bodyY: 0.15 },
		useIK: true,
		rootMotion: { windupX: 0.1, activeX: -0.08, activeY: 0.15 },
		transitionMode: null,
		upperBodyRatio: 0.25
	},
	suplex: {
		leadArm: 'both',
		windup: { leftArmX: -0.6, rightArmX: -0.6, bodyX: -0.2 },
		active: { bodyX: 0.6, bodyY: 0.2, leftArmX: -0.3, rightArmX: -0.3 },
		useIK: true,
		rootMotion: { windupX: 0.08, activeX: -0.12, activeY: 0.2 },
		transitionMode: null,
		upperBodyRatio: 0.2
	},
	ddt: {
		leadArm: 'both',
		windup: { leftArmX: -0.7, rightArmX: -0.7, bodyX: -0.15, bodyY: -0.05 },
		active: { bodyX: 0.5, bodyY: -0.15, leftArmX: -0.4, rightArmX: -0.4 },
		useIK: true,
		rootMotion: { windupX: 0.06, activeX: -0.1, activeY: -0.1 },
		transitionMode: null,
		upperBodyRatio: 0.3
	},
	neckbreaker: {
		leadArm: 'right',
		windup: { rightArmX: -0.7, bodyRotY: -0.2, bodyX: -0.1 },
		active: { rightArmX: -0.4, bodyRotY: 0.4, bodyX: 0.3, bodyY: -0.1 },
		useIK: true,
		rootMotion: { windupX: 0.05, activeX: -0.08, activeY: -0.05 },
		transitionMode: null,
		upperBodyRatio: 0.35
	},
	powerbomb: {
		leadArm: 'both',
		windup: { leftArmX: -0.5, rightArmX: -0.5, bodyX: -0.25, bodyY: -0.1 },
		active: { leftArmZ: Math.PI * 0.4, rightArmZ: -Math.PI * 0.4, bodyX: 0.3, bodyY: 0.25 },
		useIK: true,
		rootMotion: { windupX: 0.08, activeX: -0.05, activeY: 0.25 },
		transitionMode: null,
		upperBodyRatio: 0.2
	},
	piledriver: {
		leadArm: 'both',
		windup: { leftArmX: -0.6, rightArmX: -0.6, bodyX: -0.3, bodyY: -0.15 },
		active: { bodyX: 0.2, bodyY: -0.3, leftArmX: -0.4, rightArmX: -0.4 },
		useIK: true,
		rootMotion: { windupX: 0.06, activeX: 0, activeY: -0.2 },
		transitionMode: null,
		upperBodyRatio: 0.2
	},
	backbreaker: {
		leadArm: 'both',
		windup: { leftArmX: -0.5, rightArmX: -0.5, bodyRotY: -0.15 },
		active: { rightLegX: 0.3, bodyX: -0.2, bodyRotY: 0.2, bodyY: -0.05 },
		useIK: true,
		rootMotion: { windupX: 0.06, activeX: -0.05, activeY: 0.05 },
		transitionMode: null,
		upperBodyRatio: 0.25
	},

	// ── AERIALS ──
	dropkick: {
		leadArm: 'both',
		windup: { leftLegX: -0.3, rightLegX: -0.3, bodyY: -0.08, bodyX: -0.2 },
		active: { leftLegX: 0.8, rightLegX: 0.8, bodyY: 0.25, bodyX: -0.4, leftArmZ: Math.PI * 0.5, rightArmZ: -Math.PI * 0.5 },
		useIK: false,
		rootMotion: { windupX: -0.05, activeX: 0.2, activeY: 0.3 },
		transitionMode: null,
		upperBodyRatio: 0.1
	},
	crossbody: {
		leadArm: 'both',
		windup: { bodyY: -0.05, bodyX: -0.15, leftArmZ: Math.PI * 0.3, rightArmZ: -Math.PI * 0.3 },
		active: { bodyY: 0.2, bodyX: -0.3, leftArmZ: Math.PI * 0.6, rightArmZ: -Math.PI * 0.6 },
		useIK: false,
		rootMotion: { windupX: -0.03, activeX: 0.18, activeY: 0.2 },
		transitionMode: null,
		upperBodyRatio: 0.15
	},
	moonsault: {
		leadArm: 'both',
		windup: { bodyX: 0.2, bodyY: -0.1 },
		active: { bodyX: -0.5, bodyY: 0.35, leftArmZ: Math.PI * 0.5, rightArmZ: -Math.PI * 0.5 },
		useIK: false,
		rootMotion: { windupX: -0.08, activeX: 0.12, activeY: 0.35 },
		transitionMode: null,
		upperBodyRatio: 0.1
	},
	diving_elbow: {
		leadArm: 'right',
		windup: { rightForearmX: -1.0, bodyY: -0.05, bodyX: -0.1 },
		active: { rightArmX: -0.8, rightForearmX: -0.8, bodyY: 0.2, bodyX: -0.3 },
		useIK: false,
		rootMotion: { windupX: -0.03, activeX: 0.1, activeY: 0.25 },
		transitionMode: null,
		upperBodyRatio: 0.3
	},
	frog_splash: {
		leadArm: 'both',
		windup: { bodyY: -0.08, bodyX: -0.15 },
		active: { bodyY: 0.3, bodyX: -0.5, leftArmZ: Math.PI * 0.6, rightArmZ: -Math.PI * 0.6, leftLegZ: 0.3, rightLegZ: -0.3 },
		useIK: false,
		rootMotion: { windupX: -0.05, activeX: 0.15, activeY: 0.35 },
		transitionMode: null,
		upperBodyRatio: 0.1
	},
};

/** Category-based fallback configs for unknown moves. */
const CATEGORY_FALLBACKS: Record<string, MovePoseConfig> = {
	strike: STRIKE_FALLBACK,
	grapple: GRAPPLE_FALLBACK,
	aerial: AERIAL_FALLBACK,
	submission: SUBMISSION_FALLBACK,
	signature: STRIKE_FALLBACK,
	finisher: FINISHER_FALLBACK,
};

/**
 * Look up a MovePoseConfig for a given move ID and category.
 * Falls back to category default if no specific config exists.
 */
export function getMovePoseConfig(moveId: string | null, category: string | null): MovePoseConfig | null {
	if (!moveId && !category) return null;

	// Try specific move first
	if (moveId && MOVE_POSES[moveId]) {
		return MOVE_POSES[moveId];
	}

	// Fall back to category
	if (category && CATEGORY_FALLBACKS[category]) {
		return CATEGORY_FALLBACKS[category];
	}

	return STRIKE_FALLBACK;
}

/**
 * Transition speed constants.
 */
export const TRANSITION_SPEEDS: Record<TransitionMode, number> = {
	snap: 100,    // effectively instant
	fast: 25,     // ~4 frames to 90%
	smooth: 10    // ~8 frames to 90%
};
