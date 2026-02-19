import type { MatchState } from '../engine/MatchState';
import type {
	DramaSnapshot,
	DramaEvent,
	AtmosphereCue,
	VFXCue,
	DirectorEffectType
} from './types';
import { clamp, lerp, remap } from '../../utils/math';

/** Ring height for VFX position calculations. */
const RING_HEIGHT = 1.2;

/** Ticks between atmosphere updates (don't spam every tick). */
const ATMOSPHERE_UPDATE_INTERVAL = 30;

/**
 * AtmosphereController — generates lighting and VFX cues from tension.
 *
 * LIGHTING MAPPING:
 *   Tension 0.0–0.3: Normal (exposure 1.2, full spots, fog 0.015)
 *   Tension 0.3–0.6: Warm (exposure 1.3)
 *   Tension 0.6–0.8: Dramatic (exposure 1.5, titantron pulses)
 *   Tension 0.8–1.0: Peak (exposure 1.8, spots narrow, fog thins)
 *   Comeback:         Red burst (exposure 2.0 for 30 ticks)
 *   Match end:        Flash white (exposure 3.0 for 5 ticks)
 *
 * VFX EVENTS:
 *   big_hit      → impact + flash at contact point
 *   knockdown    → dust at ground + impact
 *   comeback     → sparks burst from wrestler
 *   near_finish  → flash + sparks
 */
export class AtmosphereController {
	private targetExposure = 1.0;
	private targetSpotIntensity = 1.0;
	private targetTitantronIntensity = 0.4;
	private targetFogDensity = 0.025;
	private ticksSinceAtmosphereUpdate = 0;
	private flashCooldown = 0;

	/**
	 * Called every tick with the current drama snapshot.
	 * Returns atmosphere and VFX cues to apply.
	 */
	update(
		drama: DramaSnapshot,
		state: MatchState
	): { atmosphere: AtmosphereCue | null; vfx: VFXCue[] } {
		const vfx = this.generateVFXForEvents(drama.events, state);

		this.ticksSinceAtmosphereUpdate++;
		if (this.flashCooldown > 0) this.flashCooldown--;

		// Check for flash events (high priority, overrides normal atmosphere)
		let atmosphereOverride: AtmosphereCue | null = null;
		for (const event of drama.events) {
			if (event.type === 'match_end') {
				atmosphereOverride = {
					type: 'atmosphere',
					exposure: 3.0,
					spotlightIntensity: 2.0,
					titantronIntensity: 1.0,
					transitionTicks: 5
				};
			} else if (event.type === 'comeback_start' && this.flashCooldown <= 0) {
				atmosphereOverride = {
					type: 'atmosphere',
					exposure: 2.0,
					spotlightIntensity: 1.8,
					transitionTicks: 15
				};
				this.flashCooldown = 60;
			} else if (event.type === 'finisher_trigger' && this.flashCooldown <= 0) {
				// Finisher setup: dramatic lighting boost
				atmosphereOverride = {
					type: 'atmosphere',
					exposure: 2.2,
					spotlightIntensity: 2.0,
					titantronIntensity: 1.0,
					transitionTicks: 10
				};
				this.flashCooldown = 30;
			} else if (event.type === 'finisher_impact') {
				// Finisher impact: intense flash
				atmosphereOverride = {
					type: 'atmosphere',
					exposure: 2.8,
					spotlightIntensity: 2.2,
					titantronIntensity: 1.0,
					transitionTicks: 3
				};
				this.flashCooldown = 30;
			}
		}

		if (atmosphereOverride) {
			this.ticksSinceAtmosphereUpdate = 0;
			return { atmosphere: atmosphereOverride, vfx };
		}

		// Normal atmosphere update on interval
		if (this.ticksSinceAtmosphereUpdate < ATMOSPHERE_UPDATE_INTERVAL) {
			return { atmosphere: null, vfx };
		}

		this.ticksSinceAtmosphereUpdate = 0;
		const atmosphere = this.computeAtmosphereForTension(drama.tension);
		return { atmosphere, vfx };
	}

	// ─── Tension → Atmosphere ────────────────────────────────────────

	private computeAtmosphereForTension(tension: number): AtmosphereCue {
		let exposure: number;
		let spotIntensity: number;
		let titantronIntensity: number;
		let fogDensity: number;

		if (tension < 0.3) {
			// Low tension: dark, intimate baseline
			exposure = 1.0;
			spotIntensity = 1.0;
			titantronIntensity = 0.4;
			fogDensity = 0.025;
		} else if (tension < 0.6) {
			// Medium tension: ring gets slightly brighter
			exposure = lerp(1.0, 1.15, remap(tension, 0.3, 0.6, 0, 1));
			spotIntensity = lerp(1.0, 1.1, remap(tension, 0.3, 0.6, 0, 1));
			titantronIntensity = lerp(0.4, 0.6, remap(tension, 0.3, 0.6, 0, 1));
			fogDensity = 0.025;
		} else if (tension < 0.8) {
			// High tension: ring lights intensify, fog thins to reveal action
			exposure = lerp(1.15, 1.4, remap(tension, 0.6, 0.8, 0, 1));
			spotIntensity = lerp(1.1, 1.4, remap(tension, 0.6, 0.8, 0, 1));
			titantronIntensity = lerp(0.6, 0.8, remap(tension, 0.6, 0.8, 0, 1));
			fogDensity = lerp(0.025, 0.018, remap(tension, 0.6, 0.8, 0, 1));
		} else {
			// Peak tension: ring blazes, surrounding darkness deepens contrast
			exposure = lerp(1.4, 1.7, remap(tension, 0.8, 1.0, 0, 1));
			spotIntensity = lerp(1.4, 1.8, remap(tension, 0.8, 1.0, 0, 1));
			titantronIntensity = lerp(0.8, 1.0, remap(tension, 0.8, 1.0, 0, 1));
			fogDensity = lerp(0.018, 0.012, remap(tension, 0.8, 1.0, 0, 1));
		}

		// Only emit if values changed significantly
		const changed =
			Math.abs(exposure - this.targetExposure) > 0.05 ||
			Math.abs(spotIntensity - this.targetSpotIntensity) > 0.05;

		if (!changed) return {
			type: 'atmosphere',
			transitionTicks: 30
		};

		this.targetExposure = exposure;
		this.targetSpotIntensity = spotIntensity;
		this.targetTitantronIntensity = titantronIntensity;
		this.targetFogDensity = fogDensity;

		return {
			type: 'atmosphere',
			exposure,
			spotlightIntensity: spotIntensity,
			titantronIntensity,
			fogDensity,
			transitionTicks: 30
		};
	}

	// ─── Event → VFX ─────────────────────────────────────────────────

	private generateVFXForEvents(events: DramaEvent[], state: MatchState): VFXCue[] {
		const vfx: VFXCue[] = [];

		for (const event of events) {
			switch (event.type) {
				case 'big_hit': {
					const target = this.getAgentPosition(event.agentId, state);
					// Impact at the defender's position (opponent)
					const opponent = state.agents.find((a) => a.id !== event.agentId);
					const defenderPos: [number, number, number] = opponent
						? [opponent.positionX, RING_HEIGHT + opponent.height * 0.5, 0]
						: target;

					vfx.push({
						type: 'vfx',
						effect: 'impact',
						position: defenderPos,
						intensity: clamp(event.damage / 20, 0.5, 2.0)
					});
					vfx.push({
						type: 'vfx',
						effect: 'flash',
						position: defenderPos,
						intensity: 1.0
					});
					break;
				}

				case 'knockdown': {
					const pos = this.getAgentPosition(event.agentId, state);
					vfx.push({
						type: 'vfx',
						effect: 'dust',
						position: [pos[0], RING_HEIGHT, pos[2]],
						intensity: 1.5
					});
					vfx.push({
						type: 'vfx',
						effect: 'impact',
						position: pos,
						intensity: 1.0
					});
					break;
				}

				case 'comeback_start': {
					const pos = this.getAgentPosition(event.agentId, state);
					vfx.push({
						type: 'vfx',
						effect: 'sparks',
						position: pos,
						intensity: 2.0
					});
					break;
				}

				case 'near_finish': {
					const pos = this.getAgentPosition(event.agentId, state);
					vfx.push({
						type: 'vfx',
						effect: 'flash',
						position: pos,
						intensity: 0.8
					});
					break;
				}

				case 'reversal': {
					const pos = this.getAgentPosition(event.agentId, state);
					vfx.push({
						type: 'vfx',
						effect: 'sparks',
						position: pos,
						intensity: 1.2
					});
					break;
				}

				case 'finisher_trigger': {
					// Sparks burst when finisher is triggered
					const attackerPos = this.getAgentPosition(event.attackerId, state);
					vfx.push({
						type: 'vfx',
						effect: 'sparks',
						position: attackerPos,
						intensity: 2.5
					});
					break;
				}

				case 'finisher_impact': {
					// Max intensity impact + flash + dust + sparks
					const attackerId = event.attackerId;
					const opponent = state.agents.find((a) => a.id !== attackerId);
					const impactPos: [number, number, number] = opponent
						? [opponent.positionX, RING_HEIGHT + opponent.height * 0.5, 0]
						: [0, RING_HEIGHT + 0.8, 0];

					vfx.push({
						type: 'vfx',
						effect: 'impact',
						position: impactPos,
						intensity: 2.5
					});
					vfx.push({
						type: 'vfx',
						effect: 'flash',
						position: impactPos,
						intensity: 2.0
					});
					vfx.push({
						type: 'vfx',
						effect: 'dust',
						position: [impactPos[0], RING_HEIGHT, 0],
						intensity: 2.0
					});
					vfx.push({
						type: 'vfx',
						effect: 'sparks',
						position: impactPos,
						intensity: 2.0
					});
					break;
				}

				case 'counter_finisher': {
					// Sparks + flash on successful counter
					const defenderPos = this.getAgentPosition(event.defenderId, state);
					vfx.push({
						type: 'vfx',
						effect: 'sparks',
						position: defenderPos,
						intensity: 2.0
					});
					vfx.push({
						type: 'vfx',
						effect: 'flash',
						position: defenderPos,
						intensity: 1.5
					});
					break;
				}
			}
		}

		return vfx;
	}

	private getAgentPosition(agentId: string, state: MatchState): [number, number, number] {
		const agent = state.agents.find((a) => a.id === agentId);
		if (!agent) return [0, RING_HEIGHT + 0.8, 0];
		return [agent.positionX, RING_HEIGHT + agent.height * 0.5, 0];
	}
}
