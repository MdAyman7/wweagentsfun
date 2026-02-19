import type { MatchState } from '../engine/MatchState';
import type {
	DramaSnapshot,
	DramaEvent,
	CinematicCue,
	CameraCue,
	SlowMotionCue,
	AtmosphereCue,
	VFXCue
} from './types';

/**
 * FinisherSequencer — 10-phase cinematic state machine for finisher moments.
 *
 * When a finisher_trigger drama event is detected, the sequencer takes over
 * camera direction and emits a precisely-timed series of cinematic cues:
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Phase 1:  TRIGGER          1 tick   — Detection, sequence starts   │
 * │ Phase 2:  CAMERA_TAKEOVER  5 ticks  — Closeup on attacker, snap    │
 * │ Phase 3:  SLOW_MOTION      3 ticks  — Time dilation to 0.15        │
 * │ Phase 4:  LIGHTING_BOOST   3 ticks  — Exposure 2.2, spots 2.0     │
 * │ Phase 5:  CROWD_ROAR       5 ticks  — Exposure 2.4, spots 2.2     │
 * │ Phase 6:  EXECUTION        variable — Wait for finisher_impact     │
 * │ Phase 7:  IMPACT_FREEZE    10 ticks — Near-freeze (factor 0.05)    │
 * │ Phase 8:  DAMAGE_RESOLVE   1 tick   — Top-down on fallen defender  │
 * │ Phase 9:  REPLAY_CAPTURE   15 ticks — Mark for instant replay      │
 * │ Phase 10: RESTORE          10 ticks — Return to normal atmosphere  │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Counter-finisher: If counter_finisher detected during EXECUTION,
 * snap camera to defender and skip to RESTORE.
 *
 * The sequencer is READ-ONLY — it never mutates MatchState.
 * It emits CinematicCue[] that the MatchDirector appends to its output.
 */

type FinisherPhase =
	| 'IDLE'
	| 'TRIGGER'
	| 'CAMERA_TAKEOVER'
	| 'SLOW_MOTION'
	| 'LIGHTING_BOOST'
	| 'CROWD_ROAR'
	| 'EXECUTION'
	| 'IMPACT_FREEZE'
	| 'DAMAGE_RESOLVE'
	| 'REPLAY_CAPTURE'
	| 'RESTORE';

/** Phase durations in simulation ticks. */
const PHASE_DURATIONS: Partial<Record<FinisherPhase, number>> = {
	TRIGGER: 1,
	CAMERA_TAKEOVER: 5,
	SLOW_MOTION: 3,
	LIGHTING_BOOST: 3,
	CROWD_ROAR: 5,
	// EXECUTION is variable (waits for finisher_impact event)
	IMPACT_FREEZE: 10,
	DAMAGE_RESOLVE: 1,
	REPLAY_CAPTURE: 15,
	RESTORE: 10
};

/** Ring height for target calculations. */
const RING_HEIGHT = 0.3;

export class FinisherSequencer {
	private phase: FinisherPhase = 'IDLE';
	private phaseTimer = 0;
	private attackerId: string | null = null;
	private defenderId: string | null = null;
	private moveId: string | null = null;
	private moveName: string | null = null;
	private _isActive = false;
	private impactReceived = false;
	private countered = false;

	/** Whether the sequencer is currently running a finisher sequence. */
	get isActive(): boolean {
		return this._isActive;
	}

	/**
	 * Called every tick by MatchDirector.
	 * Scans drama events for finisher triggers and advances the sequence.
	 *
	 * @returns Array of cinematic cues to emit this tick.
	 */
	update(drama: DramaSnapshot, state: MatchState): CinematicCue[] {
		const cues: CinematicCue[] = [];

		// Check for new finisher trigger (only if not already active)
		if (!this._isActive) {
			for (const event of drama.events) {
				if (event.type === 'finisher_trigger') {
					this.startSequence(event);
					break;
				}
			}
		}

		if (!this._isActive) return cues;

		// Check for counter-finisher during execution
		if (this.phase === 'EXECUTION' || this.phase === 'CAMERA_TAKEOVER' ||
			this.phase === 'SLOW_MOTION' || this.phase === 'LIGHTING_BOOST' ||
			this.phase === 'CROWD_ROAR') {
			for (const event of drama.events) {
				if (event.type === 'counter_finisher') {
					this.countered = true;
					// Snap camera to defender who caught it
					cues.push({
						type: 'camera',
						preset: 'closeup',
						target: this.getAgentTarget(event.defenderId, state),
						transitionSpeed: 10.0,
						hold: 50
					});
					// Skip to restore
					this.transitionTo('RESTORE');
					return cues;
				}
			}
		}

		// Check for finisher impact during execution
		if (this.phase === 'EXECUTION') {
			for (const event of drama.events) {
				if (event.type === 'finisher_impact') {
					this.impactReceived = true;
					this.transitionTo('IMPACT_FREEZE');
					break;
				}
			}
		}

		// Advance current phase
		this.phaseTimer--;

		// Phase-specific cue generation
		switch (this.phase) {
			case 'TRIGGER':
				// Phase 1: Detection tick — no cues (setup only)
				if (this.phaseTimer <= 0) this.transitionTo('CAMERA_TAKEOVER');
				break;

			case 'CAMERA_TAKEOVER':
				// Phase 2: Snap closeup on attacker
				if (this.phaseTimer === (PHASE_DURATIONS.CAMERA_TAKEOVER! - 1)) {
					cues.push(this.createCameraCue('closeup', this.attackerId!, state, 10.0, 120));
				}
				if (this.phaseTimer <= 0) this.transitionTo('SLOW_MOTION');
				break;

			case 'SLOW_MOTION':
				// Phase 3: Enter slow motion
				if (this.phaseTimer === (PHASE_DURATIONS.SLOW_MOTION! - 1)) {
					cues.push({
						type: 'slow_motion',
						factor: 0.15,
						durationTicks: 60,
						rampInPct: 0.1,
						rampOutPct: 0
					} satisfies SlowMotionCue);
				}
				if (this.phaseTimer <= 0) this.transitionTo('LIGHTING_BOOST');
				break;

			case 'LIGHTING_BOOST':
				// Phase 4: Boost lighting
				if (this.phaseTimer === (PHASE_DURATIONS.LIGHTING_BOOST! - 1)) {
					cues.push({
						type: 'atmosphere',
						exposure: 2.2,
						spotlightIntensity: 2.0,
						titantronIntensity: 1.0,
						transitionTicks: 8
					} satisfies AtmosphereCue);
				}
				if (this.phaseTimer <= 0) this.transitionTo('CROWD_ROAR');
				break;

			case 'CROWD_ROAR':
				// Phase 5: Peak lighting, crowd energy
				if (this.phaseTimer === (PHASE_DURATIONS.CROWD_ROAR! - 1)) {
					cues.push({
						type: 'atmosphere',
						exposure: 2.4,
						spotlightIntensity: 2.2,
						transitionTicks: 5
					} satisfies AtmosphereCue);
				}
				if (this.phaseTimer <= 0) this.transitionTo('EXECUTION');
				break;

			case 'EXECUTION':
				// Phase 6: Wait for finisher_impact event
				// Camera tracks attacker during setup
				// Safety timeout: if no impact after 120 ticks, abort
				if (this.phaseTimer <= -120) {
					this.transitionTo('RESTORE');
				}
				break;

			case 'IMPACT_FREEZE':
				// Phase 7: Near-freeze slow motion on impact
				if (this.phaseTimer === (PHASE_DURATIONS.IMPACT_FREEZE! - 1)) {
					cues.push({
						type: 'slow_motion',
						factor: 0.05,
						durationTicks: 12,
						rampInPct: 0,
						rampOutPct: 0.3
					} satisfies SlowMotionCue);

					// Max intensity VFX at impact point
					if (this.attackerId && this.defenderId) {
						const impactPos = this.getMidpoint(this.attackerId, this.defenderId, state);
						cues.push({
							type: 'vfx',
							effect: 'impact',
							position: impactPos,
							intensity: 2.5
						} satisfies VFXCue);
						cues.push({
							type: 'vfx',
							effect: 'flash',
							position: impactPos,
							intensity: 2.0
						} satisfies VFXCue);
						cues.push({
							type: 'vfx',
							effect: 'dust',
							position: [impactPos[0], RING_HEIGHT, 0],
							intensity: 2.0
						} satisfies VFXCue);
						cues.push({
							type: 'vfx',
							effect: 'sparks',
							position: impactPos,
							intensity: 2.0
						} satisfies VFXCue);
					}
				}
				if (this.phaseTimer <= 0) this.transitionTo('DAMAGE_RESOLVE');
				break;

			case 'DAMAGE_RESOLVE':
				// Phase 8: Top-down camera on fallen defender
				if (this.phaseTimer === (PHASE_DURATIONS.DAMAGE_RESOLVE! - 1) && this.defenderId) {
					cues.push(this.createCameraCue('top_down', this.defenderId, state, 8.0, 60));
				}
				if (this.phaseTimer <= 0) this.transitionTo('REPLAY_CAPTURE');
				break;

			case 'REPLAY_CAPTURE':
				// Phase 9: Replay capture window — ReplayManager handles this via drama events
				if (this.phaseTimer <= 0) this.transitionTo('RESTORE');
				break;

			case 'RESTORE':
				// Phase 10: Return to normal atmosphere
				if (this.phaseTimer === (PHASE_DURATIONS.RESTORE! - 1)) {
					cues.push({
						type: 'atmosphere',
						exposure: 1.0,
						spotlightIntensity: 1.0,
						titantronIntensity: 0.4,
						fogDensity: 0.025,
						transitionTicks: 20
					} satisfies AtmosphereCue);
				}
				if (this.phaseTimer <= 0) this.endSequence();
				break;
		}

		return cues;
	}

	// ─── Internal ────────────────────────────────────────────────────

	private startSequence(event: DramaEvent & { type: 'finisher_trigger' }): void {
		this._isActive = true;
		this.attackerId = event.attackerId;
		this.defenderId = event.defenderId;
		this.moveId = event.moveId;
		this.moveName = event.moveName;
		this.impactReceived = false;
		this.countered = false;
		this.transitionTo('TRIGGER');
	}

	private endSequence(): void {
		this._isActive = false;
		this.phase = 'IDLE';
		this.phaseTimer = 0;
		this.attackerId = null;
		this.defenderId = null;
		this.moveId = null;
		this.moveName = null;
		this.impactReceived = false;
		this.countered = false;
	}

	private transitionTo(nextPhase: FinisherPhase): void {
		this.phase = nextPhase;
		this.phaseTimer = PHASE_DURATIONS[nextPhase] ?? 0;
	}

	private createCameraCue(
		preset: CameraCue['preset'],
		agentId: string,
		state: MatchState,
		transitionSpeed: number,
		hold: number
	): CameraCue {
		return {
			type: 'camera',
			preset,
			target: this.getAgentTarget(agentId, state),
			transitionSpeed,
			hold
		};
	}

	private getAgentTarget(agentId: string, state: MatchState): [number, number, number] {
		const agent = state.agents.find((a) => a.id === agentId);
		if (!agent) return [0, RING_HEIGHT + 0.8, 0];
		return [agent.positionX, RING_HEIGHT + agent.height * 0.7, 0];
	}

	private getMidpoint(
		attackerId: string,
		defenderId: string,
		state: MatchState
	): [number, number, number] {
		const attacker = state.agents.find((a) => a.id === attackerId);
		const defender = state.agents.find((a) => a.id === defenderId);
		if (!attacker || !defender) return [0, RING_HEIGHT + 0.5, 0];
		return [
			(attacker.positionX + defender.positionX) / 2,
			RING_HEIGHT + 0.5,
			0
		];
	}
}
