import { lerp, clamp } from '../utils/math';
import type { AnimationCommand } from './AnimationCommand';
import { AnimLayerStack } from './AnimLayerStack';
import { MovePoseEvaluator } from './MovePoseEvaluator';
import { FinisherAnimController } from './FinisherAnimController';
import { TRANSITION_SPEEDS, type TransitionMode } from './MovePoseRegistry';

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
 * Full procedural pose output — 21-channel pose that drives all body parts.
 * Used as the result of layered blend computation each frame.
 */
export interface ProceduralPose {
	// ── Arms (local Euler) ──
	leftArmZ: number;       // shoulder spread (base pose + procedural)
	rightArmZ: number;
	leftArmX: number;       // forward/back swing (walk cycle, punch)
	rightArmX: number;
	leftForearmX: number;   // elbow bend (0 = straight, negative = flexed)
	rightForearmX: number;

	// ── Legs (local Euler) ──
	leftLegX: number;       // forward/back swing (walk cycle)
	rightLegX: number;
	leftLegZ: number;       // lateral leg spread
	rightLegZ: number;
	leftCalfX: number;      // knee bend
	rightCalfX: number;

	// ── Torso ──
	bodyX: number;          // forward lean / knockback tilt
	bodyZ: number;          // lateral tilt (knockback direction)
	bodyY: number;          // Y position offset (breathing bob, knockdown)
	bodyRotY: number;       // torso Y-axis twist (hooks, suplexes)

	// ── Head ──
	headY: number;          // Y position override (-1 = use default)
	headX: number;          // head tilt forward/back
	headZ: number;          // head tilt lateral

	// ── Root Motion (visual-only offsets) ──
	rootDeltaX: number;     // frame-to-frame X offset
	rootDeltaY: number;     // frame-to-frame Y offset (jumps)
	rootDeltaZ: number;     // frame-to-frame Z offset
}

/** Creates a zeroed-out procedural pose. */
export function zeroPose(): ProceduralPose {
	return {
		leftArmZ: 0, rightArmZ: 0,
		leftArmX: 0, rightArmX: 0,
		leftForearmX: 0, rightForearmX: 0,
		leftLegX: 0, rightLegX: 0,
		leftLegZ: 0, rightLegZ: 0,
		leftCalfX: 0, rightCalfX: 0,
		bodyX: 0, bodyZ: 0, bodyY: 0, bodyRotY: 0,
		headY: -1, headX: 0, headZ: 0,
		rootDeltaX: 0, rootDeltaY: 0, rootDeltaZ: 0
	};
}

/** Smoothly interpolate between two procedural poses. */
function lerpPose(a: ProceduralPose, b: ProceduralPose, t: number): ProceduralPose {
	return {
		leftArmZ: lerp(a.leftArmZ, b.leftArmZ, t),
		rightArmZ: lerp(a.rightArmZ, b.rightArmZ, t),
		leftArmX: lerp(a.leftArmX, b.leftArmX, t),
		rightArmX: lerp(a.rightArmX, b.rightArmX, t),
		leftForearmX: lerp(a.leftForearmX, b.leftForearmX, t),
		rightForearmX: lerp(a.rightForearmX, b.rightForearmX, t),
		leftLegX: lerp(a.leftLegX, b.leftLegX, t),
		rightLegX: lerp(a.rightLegX, b.rightLegX, t),
		leftLegZ: lerp(a.leftLegZ, b.leftLegZ, t),
		rightLegZ: lerp(a.rightLegZ, b.rightLegZ, t),
		leftCalfX: lerp(a.leftCalfX, b.leftCalfX, t),
		rightCalfX: lerp(a.rightCalfX, b.rightCalfX, t),
		bodyX: lerp(a.bodyX, b.bodyX, t),
		bodyZ: lerp(a.bodyZ, b.bodyZ, t),
		bodyY: lerp(a.bodyY, b.bodyY, t),
		bodyRotY: lerp(a.bodyRotY, b.bodyRotY, t),
		headY: b.headY, // headY is a flag, don't lerp
		headX: lerp(a.headX, b.headX, t),
		headZ: lerp(a.headZ, b.headZ, t),
		rootDeltaX: lerp(a.rootDeltaX, b.rootDeltaX, t),
		rootDeltaY: lerp(a.rootDeltaY, b.rootDeltaY, t),
		rootDeltaZ: lerp(a.rootDeltaZ, b.rootDeltaZ, t),
	};
}

// ─── Base Pose Targets (Layer 0) ─────────────────────────────────────

const BASE_POSES: Record<AnimStateId, ProceduralPose> = {
	// Boxing guard — fists up near chin, elbows in, slight forward lean
	stance: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.12, rightArmZ: -Math.PI * 0.12,
		leftArmX: -1.2, rightArmX: -1.0,
		leftForearmX: -1.6, rightForearmX: -1.8,
		leftLegX: -0.12, rightLegX: 0.08,
		leftLegZ: -0.06, rightLegZ: 0.06,
		bodyX: -0.10, bodyY: -0.03,
	},
	// Moving — slightly looser guard, leaning forward
	moving: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.15, rightArmZ: -Math.PI * 0.15,
		leftArmX: -1.0, rightArmX: -0.9,
		leftForearmX: -1.4, rightForearmX: -1.5,
		bodyX: -0.12, bodyY: -0.04,
	},
	// Attacking — right arm extends forward, body turns into punch
	attacking: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.15, rightArmZ: -Math.PI * 0.05,
		leftArmX: -1.2, rightArmX: -Math.PI * 0.7,
		leftForearmX: -1.6, rightForearmX: -0.3,
		leftLegX: -0.25, rightLegX: 0.3,
		bodyX: -0.25, bodyZ: 0.08, bodyY: -0.02,
		bodyRotY: -0.15,
	},
	// Stunned — staggering back, arms dropped, wobbling
	stunned: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.2, rightArmZ: -Math.PI * 0.2,
		leftArmX: 0.2, rightArmX: 0.2,
		leftForearmX: -0.4, rightForearmX: -0.4,
		leftLegX: 0.08, rightLegX: -0.08,
		bodyX: 0.30, bodyZ: 0.12, bodyY: -0.10,
	},
	// Grounded — fallen flat, body horizontal, arms spread
	// bodyY offset carefully tuned so stickman lies ON the ring surface, not through it
	grounded: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.6, rightArmZ: -Math.PI * 0.6,
		leftArmX: 0.3, rightArmX: 0.3,
		leftLegX: 0.15, rightLegX: -0.15,
		leftCalfX: 0.2, rightCalfX: 0.2,
		bodyX: Math.PI * 0.45, bodyZ: 0.15, bodyY: -0.25,
		headY: 0.12,
	},
	// Getting up — pushing off floor, struggling to rise
	getting_up: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.35, rightArmZ: -Math.PI * 0.15,
		leftArmX: -0.5, rightArmX: -0.3,
		leftForearmX: -0.8, rightForearmX: -0.5,
		leftLegX: -0.5, rightLegX: 0.2,
		leftCalfX: 0.4, rightCalfX: 0.3,
		bodyX: Math.PI * 0.2, bodyZ: 0.08, bodyY: -0.15,
	},
	// Blocking — wrists crossed near shoulders, tight defensive shell
	blocking: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.08, rightArmZ: -Math.PI * 0.08,
		leftArmX: -1.5, rightArmX: -1.5,
		leftForearmX: -2.2, rightForearmX: -2.2,
		leftLegX: -0.15, rightLegX: 0.15,
		leftCalfX: 0.1, rightCalfX: 0.1,
		bodyX: -0.15, bodyY: -0.06,
	},
	// Recovery — catching breath, guard dropping
	recovery: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.18, rightArmZ: -Math.PI * 0.18,
		leftArmX: -0.6, rightArmX: -0.6,
		leftForearmX: -1.0, rightForearmX: -1.0,
		leftLegX: -0.05, rightLegX: 0.05,
		bodyX: 0.15, bodyY: -0.05,
	},
	// Taunting — arms raised high, chest out, showboating
	taunting: {
		...zeroPose(),
		leftArmZ: Math.PI * 0.75, rightArmZ: -Math.PI * 0.75,
		leftArmX: -0.8, rightArmX: -0.8,
		leftForearmX: -1.0, rightForearmX: -1.0,
		bodyX: -0.15, bodyY: 0.08,
	},
};

// ─── Procedural Layer Configs ────────────────────────────────────────

const BREATHING: Partial<Record<AnimStateId, { amplitude: number; speed: number }>> = {
	stance:   { amplitude: 0.008, speed: 2.0 },
	blocking: { amplitude: 0.010, speed: 2.5 },
	recovery: { amplitude: 0.022, speed: 3.5 },
	stunned:  { amplitude: 0.015, speed: 2.8 },
	taunting: { amplitude: 0.010, speed: 2.2 }
};

const STANCE_BOUNCE = {
	amplitude: 0.025, armPump: 0.08, legFlex: 0.06, speed: 3.5
};

const WALK_CYCLE = {
	armSwingAmplitude: 0.4, legSwingAmplitude: 0.35,
	bodyBobAmplitude: 0.02, bodySwayAmplitude: 0.04, speed: 7.0
};

const STUN_WOBBLE = {
	bodyZAmplitude: 0.12, bodyXAmplitude: 0.08, armFlail: 0.15, speed: 3.5
};

const TAUNT_PUMP = {
	amplitude: 0.3, speed: 4.5, bodyPump: 0.06
};

// ─── Transition Speed Table ──────────────────────────────────────────

/**
 * Determine transition speed based on source → target state pair.
 */
function getTransitionSpeed(from: AnimStateId, to: AnimStateId): number {
	// SNAP transitions (instant)
	if (to === 'grounded') return TRANSITION_SPEEDS.snap;

	// FAST transitions
	if (to === 'stunned') return TRANSITION_SPEEDS.fast;
	if (to === 'attacking') return TRANSITION_SPEEDS.fast;
	if (to === 'blocking') return TRANSITION_SPEEDS.fast;
	if (from === 'recovery' && to === 'stance') return TRANSITION_SPEEDS.smooth;
	if (from === 'attacking' && to === 'recovery') return TRANSITION_SPEEDS.fast;

	// SMOOTH transitions (default)
	return TRANSITION_SPEEDS.smooth;
}

/**
 * ProceduralAnimator — drives time-based, state-aware procedural animation
 * for a single wrestler using a 4-layer blend stack.
 *
 * Layer Architecture:
 *   Layer 0: BASE_POSE      — Foundation pose for current FSM state
 *   Layer 1: LOCOMOTION     — Walk cycle (lower body, active during movement)
 *   Layer 2: COMBAT_UPPER   — Move-specific attack/block poses (upper body)
 *   Layer 3: PROCEDURAL     — Additive: breathing, bounce, wobble, knockback
 *
 * Supports:
 *   - Move-specific poses via AnimationCommand + MovePoseEvaluator
 *   - Variable-speed transitions (snap/fast/smooth)
 *   - Combo intensity scaling
 *   - Visual-only root motion
 *   - Finisher cinematic override via FinisherAnimController
 */
export class ProceduralAnimator {
	private _state: AnimStateId = 'stance';
	private _prevState: AnimStateId = 'stance';
	private _time = 0;
	private _walkPhase = 0;

	/** The layer stack for blending. */
	private readonly _layerStack = new AnimLayerStack();

	/** Move-specific pose evaluator (Layer 2). */
	private readonly _moveEval = new MovePoseEvaluator();

	/** Finisher animation controller. */
	private readonly _finisherCtrl = new FinisherAnimController();

	/** The current smoothly interpolated pose. */
	private _current: ProceduralPose = { ...BASE_POSES.stance };

	/** Velocity magnitude for walk cycle (0-1). */
	private _velocity = 0;

	/** Knockback tilt — decays over time. */
	private _knockbackTiltZ = 0;
	private _knockbackTiltDecay = 6.0;

	/** Current transition speed. */
	private _transitionSpeed = TRANSITION_SPEEDS.smooth;

	/** Current animation command (updated each frame). */
	private _command: AnimationCommand | null = null;

	get state(): AnimStateId { return this._state; }

	/** Get the finisher controller for external access. */
	get finisherController(): FinisherAnimController { return this._finisherCtrl; }

	/**
	 * Set the animation state with variable-speed transitions.
	 */
	setState(state: AnimStateId): void {
		if (this._state === state) return;
		this._prevState = this._state;
		this._transitionSpeed = getTransitionSpeed(this._prevState, state);
		this._state = state;
	}

	/**
	 * Set the full animation command for this frame.
	 * Replaces the old setState() + setVelocity() approach.
	 */
	setCommand(cmd: AnimationCommand): void {
		this._command = cmd;
		this._velocity = clamp(Math.abs(cmd.velocity), 0, 1);

		// Map phase to AnimStateId and set state
		const stateMap: Record<string, AnimStateId> = {
			idle: 'stance', moving: 'moving', windup: 'attacking',
			active: 'attacking', recovery: 'recovery', combo_window: 'stance',
			blocking: 'blocking', stun: 'stunned', knockdown: 'grounded',
			getting_up: 'getting_up', taunting: 'taunting',
			finisher_setup: 'attacking', finisher_impact: 'attacking',
			finisher_locked: 'stunned'
		};
		const animState = stateMap[cmd.phase] ?? 'stance';
		this.setState(animState);
	}

	setVelocity(v: number): void {
		this._velocity = clamp(Math.abs(v), 0, 1);
	}

	applyKnockback(direction: number, intensity: number): void {
		// Strong knockback — fighters visually fly back on impact
		this._knockbackTiltZ = direction * intensity * 1.5;
	}

	/**
	 * Advance animation by dt seconds. Returns the computed 21-channel pose.
	 */
	update(dt: number): ProceduralPose {
		this._time += dt;
		const cmd = this._command;

		// ── Check if finisher controller should take over ──
		if (cmd) {
			const finisherResult = this._finisherCtrl.evaluate(cmd);
			if (finisherResult) {
				// Finisher overrides all layers
				const t = 1 - Math.exp(-TRANSITION_SPEEDS.fast * dt);
				this._current = lerpPose(this._current, finisherResult.pose, t);
				return this._current;
			}
		}

		// ── Layer 0: Base Pose ──
		const base = BASE_POSES[this._state] ?? BASE_POSES.stance;
		this._layerStack.setPose(0, base);
		this._layerStack.setWeight(0, 1.0);

		// ── Layer 1: Locomotion ──
		const isMoving = this._state === 'moving' && this._velocity > 0.01;
		const locomotionPose = zeroPose();
		if (isMoving) {
			this.computeWalkCycle(dt, locomotionPose);
		}
		this._layerStack.setPose(1, locomotionPose);
		this._layerStack.setWeight(1, isMoving ? this._velocity : 0);

		// ── Layer 2: Combat Upper (move-specific poses) ──
		if (cmd) {
			const combatResult = this._moveEval.evaluate(cmd);
			this._layerStack.setPose(2, combatResult.pose);
			this._layerStack.setWeight(2, combatResult.weight);
		} else {
			this._layerStack.setWeight(2, 0);
		}

		// ── Layer 3: Procedural Additive ──
		const proceduralPose = zeroPose();
		this.applyBreathing(proceduralPose);
		this.applyStanceBounce(proceduralPose);
		this.applyStunWobble(proceduralPose);
		this.applyTauntPump(proceduralPose);
		this.applyAttackDynamic(proceduralPose);
		this.applyGettingUpStruggle(proceduralPose);
		this.applyKnockbackTilt(dt, proceduralPose);
		this._layerStack.setPose(3, proceduralPose);
		this._layerStack.setWeight(3, 1.0);

		// ── Compute blended target ──
		const target = this._layerStack.computeFinalPose();

		// ── Smooth transition to target ──
		const t = 1 - Math.exp(-this._transitionSpeed * dt);
		this._current = lerpPose(this._current, target, t);

		return this._current;
	}

	getPose(): ProceduralPose {
		return { ...this._current };
	}

	// ─── Walk Cycle (Layer 1) ─────────────────────────────────────────

	private computeWalkCycle(dt: number, pose: ProceduralPose): void {
		this._walkPhase += dt * WALK_CYCLE.speed * this._velocity;
		const phase = this._walkPhase * Math.PI * 2;
		const intensity = this._velocity;

		// Arms swing opposite to legs
		pose.leftArmX = Math.sin(phase) * WALK_CYCLE.armSwingAmplitude * intensity;
		pose.rightArmX = -Math.sin(phase) * WALK_CYCLE.armSwingAmplitude * intensity;

		// Legs swing
		pose.leftLegX = Math.sin(phase) * WALK_CYCLE.legSwingAmplitude * intensity;
		pose.rightLegX = -Math.sin(phase) * WALK_CYCLE.legSwingAmplitude * intensity;

		// Knee bend on weight-bearing leg
		pose.leftCalfX = Math.max(0, -Math.sin(phase)) * 0.15 * intensity;
		pose.rightCalfX = Math.max(0, Math.sin(phase)) * 0.15 * intensity;

		// Body bob
		pose.bodyY = Math.abs(Math.sin(phase)) * WALK_CYCLE.bodyBobAmplitude * intensity;

		// Lateral sway
		pose.bodyZ = Math.sin(phase) * WALK_CYCLE.bodySwayAmplitude * intensity;

		// Forward lean
		pose.bodyX = -intensity * 0.04;
	}

	// ─── Procedural Layers (Layer 3, Additive) ─────────────────────────

	private applyBreathing(pose: ProceduralPose): void {
		const config = BREATHING[this._state];
		if (!config) return;
		const breath = Math.sin(this._time * config.speed * Math.PI * 2) * config.amplitude;
		pose.bodyY += breath;
		const armSway = breath * 0.3;
		pose.leftArmZ += armSway;
		pose.rightArmZ -= armSway;
	}

	private applyStanceBounce(pose: ProceduralPose): void {
		if (this._state !== 'stance') return;
		const phase = this._time * STANCE_BOUNCE.speed * Math.PI * 2;
		const bounce = Math.abs(Math.sin(phase)) * STANCE_BOUNCE.amplitude;
		pose.bodyY -= bounce;
		const armPump = Math.sin(phase) * STANCE_BOUNCE.armPump;
		pose.leftArmX += armPump * 0.5;
		pose.rightArmX += armPump * 0.5;
		const legFlex = Math.abs(Math.sin(phase)) * STANCE_BOUNCE.legFlex;
		pose.leftLegX -= legFlex * 0.3;
		pose.rightLegX += legFlex * 0.3;
		pose.leftCalfX += legFlex * 0.2;
		pose.rightCalfX += legFlex * 0.2;
		pose.bodyZ += Math.sin(phase * 0.5) * 0.025;
	}

	private applyStunWobble(pose: ProceduralPose): void {
		if (this._state !== 'stunned') return;
		const phase = this._time * STUN_WOBBLE.speed * Math.PI * 2;
		pose.bodyZ += Math.sin(phase) * STUN_WOBBLE.bodyZAmplitude;
		pose.bodyX += Math.cos(phase * 0.7) * STUN_WOBBLE.bodyXAmplitude;
		pose.leftArmX += Math.sin(phase * 1.3) * STUN_WOBBLE.armFlail;
		pose.rightArmX += Math.cos(phase * 1.1) * STUN_WOBBLE.armFlail;
		pose.leftLegX += Math.sin(phase * 0.5) * 0.08;
		pose.rightLegX += Math.cos(phase * 0.5) * 0.08;
		// Head wobble
		pose.headX += Math.sin(phase * 0.9) * 0.05;
		pose.headZ += Math.cos(phase * 0.7) * 0.04;
	}

	private applyTauntPump(pose: ProceduralPose): void {
		if (this._state !== 'taunting') return;
		const pump = Math.sin(this._time * TAUNT_PUMP.speed * Math.PI * 2) * TAUNT_PUMP.amplitude;
		pose.leftArmX += pump;
		pose.rightArmX += pump;
		pose.bodyY += Math.abs(pump) * TAUNT_PUMP.bodyPump;
		pose.bodyX -= Math.abs(pump) * 0.03;
	}

	private applyAttackDynamic(pose: ProceduralPose): void {
		if (this._state !== 'attacking') return;
		// Only add subtle procedural overlay when no command (legacy path)
		if (this._command && this._command.moveId) return;
		const strikePhase = this._time * 12 * Math.PI * 2;
		pose.rightArmX += Math.sin(strikePhase) * 0.08;
		pose.bodyZ += Math.sin(strikePhase * 0.5) * 0.05;
		pose.leftLegX -= 0.05;
	}

	private applyGettingUpStruggle(pose: ProceduralPose): void {
		if (this._state !== 'getting_up') return;
		const phase = this._time * 2.5 * Math.PI * 2;
		pose.bodyX += Math.sin(phase) * 0.08;
		pose.bodyZ += Math.cos(phase * 0.7) * 0.05;
		pose.leftArmX += Math.sin(phase) * 0.1;
	}

	private applyKnockbackTilt(dt: number, pose: ProceduralPose): void {
		if (Math.abs(this._knockbackTiltZ) < 0.001) {
			this._knockbackTiltZ = 0;
			return;
		}
		pose.bodyZ += this._knockbackTiltZ;
		pose.bodyX += Math.abs(this._knockbackTiltZ) * 0.7;
		// Strong push — fighters slide/fly back on impact (cinematic distance)
		pose.rootDeltaX += this._knockbackTiltZ * 0.8 * dt;
		pose.rootDeltaY += Math.abs(this._knockbackTiltZ) * 0.12 * dt; // lift on hit
		// Arms flail during knockback
		pose.leftArmX += this._knockbackTiltZ * 0.3;
		pose.rightArmX -= this._knockbackTiltZ * 0.3;
		// Slower decay — knockback persists longer for dramatic slide
		this._knockbackTiltZ *= Math.exp(-3.5 * dt);
	}
}
