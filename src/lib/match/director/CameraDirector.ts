import type { MatchState } from '../engine/MatchState';
import type {
	DramaSnapshot,
	DramaEvent,
	CameraCue,
	DirectorCameraPreset
} from './types';
import { SeededRandom } from '../../utils/random';
import { clamp } from '../../utils/math';

/** Ring height constant for focal point calculations. */
const RING_HEIGHT = 1.2;

/**
 * CameraDirector — converts drama snapshots and events into camera cues.
 *
 * Modeled after real TV wrestling production:
 *
 * TENSION BANDS:
 *   0.0–0.3: Wide shots, slow cuts (120+ frame holds)
 *   0.3–0.6: Medium shots, moderate cuts (60–90 frame holds)
 *   0.6–0.8: Closeups, faster cuts (30–60 frame holds)
 *   0.8–1.0: Rapid cuts, reaction shots (20–30 frame holds)
 *
 * EVENT OVERRIDES (bypass tension bands):
 *   knockdown     → top_down 45f, then closeup on grounded wrestler
 *   comeback      → crowd 30f, then closeup on comeback wrestler
 *   big_hit ≥15   → closeup on attacker 30f
 *   reversal      → over_shoulder snap (5f transition)
 *   near_finish   → closeup, very fast transition
 *   match_end     → wide celebration shot
 *
 * SeededRandom adds variety: sometimes picks over_shoulder instead of
 * closeup, or holds a crowd shot for drama. Deterministic.
 */
export class CameraDirector {
	private currentPreset: DirectorCameraPreset = 'hard_cam';
	private holdRemaining: number = 120;
	private ticksSinceLastCut: number = 0;
	private readonly minCutInterval: number;
	private pendingOverride: CameraCue | null = null;

	constructor(
		private readonly rng: SeededRandom,
		minCutInterval: number = 20
	) {
		this.minCutInterval = minCutInterval;
	}

	/**
	 * Called every tick. Returns a CameraCue if a cut should happen, null otherwise.
	 */
	update(drama: DramaSnapshot, state: MatchState): CameraCue | null {
		this.ticksSinceLastCut++;
		this.holdRemaining--;

		// Check for event-driven overrides first (highest priority)
		for (const event of drama.events) {
			const override = this.handleDramaEvent(event, state);
			if (override) {
				this.pendingOverride = override;
			}
		}

		// Apply pending override if we've met minimum cut interval
		if (this.pendingOverride && this.ticksSinceLastCut >= this.minCutInterval) {
			const cue = this.pendingOverride;
			this.pendingOverride = null;
			this.applyCut(cue.preset, cue.hold);
			return cue;
		}

		// Hold current angle if we haven't finished the hold period
		if (this.holdRemaining > 0) return null;

		// Minimum cut interval
		if (this.ticksSinceLastCut < this.minCutInterval) return null;

		// Tension-driven camera selection
		return this.selectForTension(drama.tension, state);
	}

	// ─── Event-Driven Overrides ──────────────────────────────────────

	private handleDramaEvent(event: DramaEvent, state: MatchState): CameraCue | null {
		switch (event.type) {
			case 'knockdown':
				return {
					type: 'camera',
					preset: 'top_down',
					target: this.getAgentTarget(event.agentId, state),
					transitionSpeed: 8.0,
					hold: 45
				};

			case 'comeback_start':
				return {
					type: 'camera',
					preset: 'crowd',
					target: this.getAgentTarget(event.agentId, state),
					transitionSpeed: 6.0,
					hold: 30
				};

			case 'big_hit':
				if (event.damage >= 15) {
					return {
						type: 'camera',
						preset: 'closeup',
						target: this.getAgentTarget(event.agentId, state),
						transitionSpeed: 8.0,
						hold: 30
					};
				}
				return null;

			case 'reversal':
				return {
					type: 'camera',
					preset: 'over_shoulder',
					target: this.getAgentTarget(event.agentId, state),
					transitionSpeed: 10.0, // snap cut
					hold: 40
				};

			case 'near_finish':
				return {
					type: 'camera',
					preset: 'closeup',
					target: this.getAgentTarget(event.agentId, state),
					transitionSpeed: 10.0,
					hold: 25
				};

			case 'match_end':
				return {
					type: 'camera',
					preset: 'wide',
					target: this.getMidpoint(state),
					transitionSpeed: 3.0, // slow dramatic pull-out
					hold: 180
				};

			case 'emotion_shift':
				// Only cut for dramatic transitions
				if (event.to === 'clutch' || event.to === 'desperate') {
					return {
						type: 'camera',
						preset: this.rng.chance(0.5) ? 'closeup' : 'over_shoulder',
						target: this.getAgentTarget(event.agentId, state),
						transitionSpeed: 6.0,
						hold: 40
					};
				}
				return null;

			default:
				return null;
		}
	}

	// ─── Tension-Driven Selection ────────────────────────────────────

	private selectForTension(tension: number, state: MatchState): CameraCue | null {
		let preset: DirectorCameraPreset;
		let hold: number;
		let transitionSpeed: number;

		if (tension < 0.3) {
			// Low tension: wide, relaxed cuts
			preset = this.rng.chance(0.7) ? 'hard_cam' : 'wide';
			hold = 120 + this.rng.int(0, 60);
			transitionSpeed = 2.0;
		} else if (tension < 0.6) {
			// Medium tension: variety
			const roll = this.rng.float(0, 1);
			if (roll < 0.4) preset = 'wide';
			else if (roll < 0.7) preset = 'hard_cam';
			else preset = 'over_shoulder';
			hold = 60 + this.rng.int(0, 30);
			transitionSpeed = 4.0;
		} else if (tension < 0.8) {
			// High tension: closeups, faster
			const roll = this.rng.float(0, 1);
			if (roll < 0.5) preset = 'closeup';
			else if (roll < 0.8) preset = 'over_shoulder';
			else preset = 'crowd';
			hold = 30 + this.rng.int(0, 30);
			transitionSpeed = 6.0;
		} else {
			// Peak tension: rapid cuts, reaction shots
			const roll = this.rng.float(0, 1);
			if (roll < 0.4) preset = 'closeup';
			else if (roll < 0.7) preset = 'crowd';
			else preset = 'over_shoulder';
			hold = 20 + this.rng.int(0, 10);
			transitionSpeed = 10.0;
		}

		// Avoid cutting to the same preset
		if (preset === this.currentPreset) {
			preset = preset === 'closeup' ? 'over_shoulder' : 'closeup';
		}

		// Pick target: follow the agent with higher momentum or lower health
		const target = this.selectFocalTarget(preset, state);

		this.applyCut(preset, hold);

		return {
			type: 'camera',
			preset,
			target,
			transitionSpeed,
			hold
		};
	}

	// ─── Target Selection ────────────────────────────────────────────

	private selectFocalTarget(preset: DirectorCameraPreset, state: MatchState): [number, number, number] {
		switch (preset) {
			case 'wide':
			case 'hard_cam':
			case 'top_down':
				return this.getMidpoint(state);

			case 'crowd':
			case 'entrance':
				return [0, RING_HEIGHT + 2, 0];

			case 'closeup':
			case 'over_shoulder': {
				// Focus on the more dramatic agent (lower health or higher momentum)
				const [a, b] = state.agents;
				const dramaA = (1 - a.health / a.maxHealth) + a.momentum / 100;
				const dramaB = (1 - b.health / b.maxHealth) + b.momentum / 100;
				const agent = dramaA >= dramaB ? a : b;
				return [agent.positionX, RING_HEIGHT + agent.height * 0.7, 0];
			}
		}
	}

	private getAgentTarget(agentId: string, state: MatchState): [number, number, number] {
		const agent = state.agents.find((a) => a.id === agentId);
		if (!agent) return this.getMidpoint(state);
		return [agent.positionX, RING_HEIGHT + agent.height * 0.7, 0];
	}

	private getMidpoint(state: MatchState): [number, number, number] {
		const [a, b] = state.agents;
		return [(a.positionX + b.positionX) / 2, RING_HEIGHT + 0.5, 0];
	}

	// ─── Internal ────────────────────────────────────────────────────

	private applyCut(preset: DirectorCameraPreset, hold: number): void {
		this.currentPreset = preset;
		this.holdRemaining = hold;
		this.ticksSinceLastCut = 0;
	}
}
