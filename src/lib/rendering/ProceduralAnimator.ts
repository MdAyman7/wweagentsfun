import { lerp, clamp } from '../utils/math';

/**
 * Animation state ID — mirrors the pose IDs used by WrestlerRenderer
 * but drives procedural (time-based) motion layers on top of static poses.
 */
export type AnimStateId =
	| 'stance'
	| 'attacking'
	| 'stunned'
	| 'grounded'
	| 'blocking'
	| 'recovery'
	| 'moving'
	| 'taunting'
	| 'getting_up';

/**
 * Full procedural pose output — all body-part rotations that the
 * ProceduralAnimator computes each frame. These are ADDITIVE offsets
 * on top of base pose values, except where noted.
 */
export interface ProceduralPose {
	// ── Arms (local Euler) ──
	leftArmZ: number;   // shoulder spread (base pose + procedural)
	rightArmZ: number;
	leftArmX: number;   // forward/back swing (walk cycle, punch)
	rightArmX: number;

	// ── Legs (local Euler) ──
	leftLegX: number;   // forward/back swing (walk cycle)
	rightLegX: number;

	// ── Torso ──
	bodyX: number;      // forward lean / knockback tilt
	bodyZ: number;      // lateral tilt (knockback direction)
	bodyY: number;      // Y position offset (breathing bob, knockdown)

	// ── Head ──
	headY: number;      // Y position override (-1 = use default)
}

/** Creates a zeroed-out procedural pose. */
function zeroPose(): ProceduralPose {
	return {
		leftArmZ: 0, rightArmZ: 0,
		leftArmX: 0, rightArmX: 0,
		leftLegX: 0, rightLegX: 0,
		bodyX: 0, bodyZ: 0, bodyY: 0,
		headY: -1
	};
}

/** Smoothly interpolate between two procedural poses. */
function lerpPose(a: ProceduralPose, b: ProceduralPose, t: number): ProceduralPose {
	return {
		leftArmZ: lerp(a.leftArmZ, b.leftArmZ, t),
		rightArmZ: lerp(a.rightArmZ, b.rightArmZ, t),
		leftArmX: lerp(a.leftArmX, b.leftArmX, t),
		rightArmX: lerp(a.rightArmX, b.rightArmX, t),
		leftLegX: lerp(a.leftLegX, b.leftLegX, t),
		rightLegX: lerp(a.rightLegX, b.rightLegX, t),
		bodyX: lerp(a.bodyX, b.bodyX, t),
		bodyZ: lerp(a.bodyZ, b.bodyZ, t),
		bodyY: lerp(a.bodyY, b.bodyY, t),
		headY: b.headY // headY is a flag, don't lerp
	};
}

// ─── Base Pose Targets (static component) ────────────────────────────

const BASE_POSES: Record<AnimStateId, ProceduralPose> = {
	stance: {
		leftArmZ: Math.PI * 0.15, rightArmZ: -Math.PI * 0.15,
		leftArmX: 0, rightArmX: 0,
		leftLegX: 0, rightLegX: 0,
		bodyX: 0, bodyZ: 0, bodyY: 0,
		headY: -1
	},
	moving: {
		leftArmZ: Math.PI * 0.12, rightArmZ: -Math.PI * 0.12,
		leftArmX: 0, rightArmX: 0,
		leftLegX: 0, rightLegX: 0,
		bodyX: -0.05, bodyZ: 0, bodyY: 0, // slight forward lean
		headY: -1
	},
	attacking: {
		leftArmZ: Math.PI * 0.1, rightArmZ: -Math.PI * 0.1,
		leftArmX: 0, rightArmX: -Math.PI * 0.65, // right arm punches forward
		leftLegX: -0.15, rightLegX: 0.2,          // lunge stance
		bodyX: -0.15, bodyZ: 0, bodyY: 0,         // lean into the punch
		headY: -1
	},
	stunned: {
		leftArmZ: Math.PI * 0.05, rightArmZ: -Math.PI * 0.05,
		leftArmX: 0.1, rightArmX: 0.1,
		leftLegX: 0, rightLegX: 0,
		bodyX: 0.2, bodyZ: 0, bodyY: -0.05,       // lean back, slumped
		headY: -1
	},
	grounded: {
		leftArmZ: Math.PI * 0.4, rightArmZ: -Math.PI * 0.4,
		leftArmX: 0, rightArmX: 0,
		leftLegX: 0, rightLegX: 0,
		bodyX: Math.PI * 0.5, bodyZ: 0, bodyY: -0.6, // flat on ground
		headY: 0.15
	},
	getting_up: {
		leftArmZ: Math.PI * 0.3, rightArmZ: -Math.PI * 0.3,
		leftArmX: -0.3, rightArmX: -0.3,          // arms pushing up
		leftLegX: -0.3, rightLegX: 0.3,           // legs staggered
		bodyX: Math.PI * 0.25, bodyZ: 0, bodyY: -0.3, // halfway up
		headY: -1
	},
	blocking: {
		leftArmZ: Math.PI * 0.55, rightArmZ: -Math.PI * 0.55,
		leftArmX: -0.3, rightArmX: -0.3,          // arms raised in front
		leftLegX: -0.08, rightLegX: 0.08,         // braced stance
		bodyX: -0.08, bodyZ: 0, bodyY: 0,
		headY: -1
	},
	recovery: {
		leftArmZ: Math.PI * 0.08, rightArmZ: -Math.PI * 0.08,
		leftArmX: 0.05, rightArmX: 0.05,
		leftLegX: 0, rightLegX: 0,
		bodyX: 0.15, bodyZ: 0, bodyY: -0.03,      // slightly hunched
		headY: -1
	},
	taunting: {
		leftArmZ: Math.PI * 0.7, rightArmZ: -Math.PI * 0.7, // arms wide
		leftArmX: -0.2, rightArmX: -0.2,
		leftLegX: 0, rightLegX: 0,
		bodyX: -0.1, bodyZ: 0, bodyY: 0.05,       // chest out, puffed up
		headY: -1
	}
};

// ─── Procedural Layer Configs ────────────────────────────────────────

/** Breathing parameters per state. */
const BREATHING: Partial<Record<AnimStateId, { amplitude: number; speed: number }>> = {
	stance:   { amplitude: 0.012, speed: 2.0 },
	blocking: { amplitude: 0.008, speed: 2.5 },
	recovery: { amplitude: 0.018, speed: 3.0 },  // heavy breathing after exertion
	stunned:  { amplitude: 0.015, speed: 2.8 },
	taunting: { amplitude: 0.01,  speed: 2.2 }
};

/** Walk cycle parameters. */
const WALK_CYCLE = {
	armSwingAmplitude: 0.35,   // radians of arm X swing
	legSwingAmplitude: 0.3,    // radians of leg X swing
	bodyBobAmplitude: 0.015,   // Y bounce
	speed: 8.0                 // cycle frequency
};

/** Stun wobble parameters. */
const STUN_WOBBLE = {
	bodyZAmplitude: 0.08,
	bodyXAmplitude: 0.05,
	speed: 4.0
};

/** Taunt arm pump. */
const TAUNT_PUMP = {
	amplitude: 0.25,
	speed: 5.0
};

/**
 * ProceduralAnimator — drives time-based, state-aware procedural animation
 * for a single wrestler. Computes a full ProceduralPose each frame by layering:
 *
 * 1. **Base Pose** — static target rotations per state (idle arms spread, attack lean, etc.)
 * 2. **Procedural Layers** — sin/cos oscillations for breathing, walk cycles, wobble
 * 3. **Smooth Transitions** — exponential lerp between poses when state changes
 *
 * No external animation files. Pure math on mesh rotations.
 */
export class ProceduralAnimator {
	private _state: AnimStateId = 'stance';
	private _time = 0;
	private _walkPhase = 0;

	/** The current interpolated pose (updated each frame). */
	private _current: ProceduralPose = { ...BASE_POSES.stance };
	/** The computed target pose (base + procedural layers). */
	private _target: ProceduralPose = { ...BASE_POSES.stance };

	/** Velocity magnitude for walk cycle intensity (0 = still, 1 = full walk). */
	private _velocity = 0;

	/** Knockback tilt — decays over time. */
	private _knockbackTiltZ = 0;
	private _knockbackTiltDecay = 6.0;

	/** Transition speed (higher = faster blend). */
	private readonly LERP_SPEED = 10;

	/** Get the current animation state. */
	get state(): AnimStateId { return this._state; }

	/**
	 * Set the animation state. If changing, triggers a smooth transition.
	 */
	setState(state: AnimStateId): void {
		if (this._state === state) return;
		this._state = state;

		// Reset walk phase when stopping movement
		if (state !== 'moving') {
			// Don't abruptly reset — let it fade via velocity = 0
		}
	}

	/**
	 * Set movement velocity for walk cycle. 0 = stopped, 1 = full speed.
	 */
	setVelocity(v: number): void {
		this._velocity = clamp(Math.abs(v), 0, 1);
	}

	/**
	 * Apply a knockback visual tilt (call on hit received).
	 * @param direction -1 = tilt left, +1 = tilt right
	 * @param intensity 0–1 range
	 */
	applyKnockback(direction: number, intensity: number): void {
		this._knockbackTiltZ = direction * intensity * 0.25;
	}

	/**
	 * Advance animation by dt seconds. Returns the computed procedural pose.
	 */
	update(dt: number): ProceduralPose {
		this._time += dt;

		// ── 1. Start with base pose for current state ──
		const base = BASE_POSES[this._state] ?? BASE_POSES.stance;
		// Clone base as starting target
		this._target = { ...base };

		// ── 2. Layer procedural effects ──
		this.applyBreathing();
		this.applyWalkCycle(dt);
		this.applyStunWobble();
		this.applyTauntPump();
		this.applyKnockbackTilt(dt);

		// ── 3. Smooth transition: lerp current → target ──
		const t = 1 - Math.exp(-this.LERP_SPEED * dt);
		this._current = lerpPose(this._current, this._target, t);

		return this._current;
	}

	/**
	 * Get the current pose without advancing time (read-only snapshot).
	 */
	getPose(): ProceduralPose {
		return { ...this._current };
	}

	// ─── Procedural Layers ───────────────────────────────────────────

	/** Subtle breathing bob on idle/blocking/recovery/stunned. */
	private applyBreathing(): void {
		const config = BREATHING[this._state];
		if (!config) return;

		const breath = Math.sin(this._time * config.speed * Math.PI * 2) * config.amplitude;
		this._target.bodyY += breath;

		// Subtle arm sway with breathing
		const armSway = breath * 0.3;
		this._target.leftArmZ += armSway;
		this._target.rightArmZ -= armSway;
	}

	/** Walk cycle: arm swing, leg swing, body bob. Only active when moving. */
	private applyWalkCycle(dt: number): void {
		if (this._state !== 'moving' || this._velocity < 0.01) return;

		this._walkPhase += dt * WALK_CYCLE.speed * this._velocity;
		const phase = this._walkPhase * Math.PI * 2;
		const intensity = this._velocity;

		// Arms swing opposite to legs (natural gait)
		const armSwing = Math.sin(phase) * WALK_CYCLE.armSwingAmplitude * intensity;
		this._target.leftArmX += armSwing;
		this._target.rightArmX -= armSwing;

		// Legs swing
		const legSwing = Math.sin(phase) * WALK_CYCLE.legSwingAmplitude * intensity;
		this._target.leftLegX += legSwing;
		this._target.rightLegX -= legSwing;

		// Body bob (double frequency — one bob per step)
		const bob = Math.abs(Math.sin(phase)) * WALK_CYCLE.bodyBobAmplitude * intensity;
		this._target.bodyY += bob;

		// Slight torso twist
		this._target.bodyZ += Math.sin(phase) * 0.03 * intensity;
	}

	/** Stun wobble: body sways drunkenly. */
	private applyStunWobble(): void {
		if (this._state !== 'stunned') return;

		const phase = this._time * STUN_WOBBLE.speed * Math.PI * 2;
		this._target.bodyZ += Math.sin(phase) * STUN_WOBBLE.bodyZAmplitude;
		this._target.bodyX += Math.cos(phase * 0.7) * STUN_WOBBLE.bodyXAmplitude;

		// Staggering leg motion
		this._target.leftLegX += Math.sin(phase * 0.5) * 0.06;
		this._target.rightLegX += Math.cos(phase * 0.5) * 0.06;
	}

	/** Taunt: arms pump up and down rhythmically. */
	private applyTauntPump(): void {
		if (this._state !== 'taunting') return;

		const pump = Math.sin(this._time * TAUNT_PUMP.speed * Math.PI * 2) * TAUNT_PUMP.amplitude;
		this._target.leftArmX += pump;
		this._target.rightArmX += pump;

		// Body pumps with arms
		this._target.bodyY += Math.abs(pump) * 0.04;
	}

	/** Knockback tilt — visual-only, decays exponentially. */
	private applyKnockbackTilt(dt: number): void {
		if (Math.abs(this._knockbackTiltZ) < 0.001) {
			this._knockbackTiltZ = 0;
			return;
		}

		this._target.bodyZ += this._knockbackTiltZ;
		this._target.bodyX += Math.abs(this._knockbackTiltZ) * 0.5; // lean back when hit

		// Decay
		this._knockbackTiltZ *= Math.exp(-this._knockbackTiltDecay * dt);
	}
}
