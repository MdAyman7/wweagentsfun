import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';

/**
 * Audio cue to be played by the audio engine.
 */
interface AudioCue {
	soundId: string;
	volume: number;
	pitch: number;
	pan: number; // -1 (left) to 1 (right)
	priority: number;
}

interface MoveHitEvent {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	damage: number;
}

interface FinisherHitEvent {
	attacker: EntityId;
	defender: EntityId;
	finisherId: string;
	damage: number;
}

interface PinCountEvent {
	count: 1 | 2 | 3;
	kickout: boolean;
}

interface CrowdPopEvent {
	intensity: number;
	trigger: string;
}

interface MoveStartedEvent {
	entity: EntityId;
	moveId: string;
	frame: number;
}

/**
 * AudioSystem
 *
 * Listens to simulation events and translates them into audio cues
 * that are written to a world resource for the audio engine to consume.
 *
 * The system does not play audio directly. Instead, it writes to the
 * 'audioQueue' resource, which is an array of AudioCue objects. The
 * rendering layer reads and drains this queue each frame.
 *
 * Sound mapping:
 *   - combat:move_hit -> Impact sound (varies by damage)
 *   - combat:move_started -> Whoosh/swing sound
 *   - combat:finisher_hit -> Big impact + crowd roar
 *   - match:pin_count -> Referee hand slap
 *   - psych:crowd_pop -> Crowd volume adjustment
 *   - combat:submission_lock -> Submission struggle sounds
 *
 * Volume scaling:
 *   - Impact sounds scale with damage dealt
 *   - Crowd sounds scale with pop intensity
 *   - Time dilation affects audio pitch (slow-mo = lower pitch)
 */
export class AudioSystem extends System {
	readonly name = 'AudioSystem';
	readonly phase: Phase = 'presentation';
	readonly priority = 10;

	private pendingCues: AudioCue[] = [];

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:move_hit', (ev: MoveHitEvent) => {
			// Scale volume and pitch with damage
			const damageScale = Math.min(ev.damage / 30, 1.0);
			const soundId = this.getImpactSound(ev.moveId, ev.damage);

			this.pendingCues.push({
				soundId,
				volume: 0.5 + damageScale * 0.5,
				pitch: 0.9 + Math.random() * 0.2, // Slight pitch variation
				pan: 0,
				priority: 5
			});
		});

		eventBus.on('combat:move_started', (ev: MoveStartedEvent) => {
			this.pendingCues.push({
				soundId: 'sfx_whoosh',
				volume: 0.3,
				pitch: 1.0,
				pan: 0,
				priority: 2
			});
		});

		eventBus.on('combat:finisher_hit', (ev: FinisherHitEvent) => {
			this.pendingCues.push({
				soundId: 'sfx_finisher_impact',
				volume: 1.0,
				pitch: 0.8, // Lower pitch for more impact
				pan: 0,
				priority: 10
			});

			this.pendingCues.push({
				soundId: 'crowd_roar',
				volume: 1.0,
				pitch: 1.0,
				pan: 0,
				priority: 8
			});
		});

		eventBus.on('match:pin_count', (ev: PinCountEvent) => {
			this.pendingCues.push({
				soundId: 'sfx_ref_slap',
				volume: 0.8,
				pitch: 1.0 + (ev.count - 1) * 0.05, // Slightly higher pitch for later counts
				pan: 0,
				priority: 7
			});

			// Add crowd anticipation at count 2
			if (ev.count === 2) {
				this.pendingCues.push({
					soundId: 'crowd_gasp',
					volume: 0.7,
					pitch: 1.0,
					pan: 0,
					priority: 6
				});
			}

			// Crowd explosion on kickout at 2+
			if (ev.kickout && ev.count >= 2) {
				this.pendingCues.push({
					soundId: 'crowd_pop',
					volume: 0.9,
					pitch: 1.0,
					pan: 0,
					priority: 8
				});
			}
		});

		eventBus.on('psych:crowd_pop', (ev: CrowdPopEvent) => {
			const volume = Math.min(ev.intensity / 25, 1.0);
			this.pendingCues.push({
				soundId: 'crowd_reaction',
				volume,
				pitch: 1.0,
				pan: 0,
				priority: 4
			});
		});

		eventBus.on('combat:submission_lock', (_ev: { attacker: EntityId; defender: EntityId; holdId: string }) => {
			this.pendingCues.push({
				soundId: 'sfx_struggle',
				volume: 0.5,
				pitch: 1.0,
				pan: 0,
				priority: 3
			});
		});
	}

	execute(world: World, _dt: number, _eventBus: EventBus): void {
		if (this.pendingCues.length === 0) return;

		// Apply time dilation to pitch
		const timeDilation = world.getResource<number>('timeDilation') ?? 1.0;
		if (timeDilation < 1.0) {
			for (const cue of this.pendingCues) {
				// Lower pitch during slow-motion for dramatic effect
				cue.pitch *= Math.max(0.5, timeDilation);
			}
		}

		// Sort by priority (highest first) and limit concurrent sounds
		this.pendingCues.sort((a, b) => b.priority - a.priority);
		const maxConcurrent = 6;
		const cuesToPlay = this.pendingCues.slice(0, maxConcurrent);

		// Write to audio queue resource
		const audioQueue = world.getResource<AudioCue[]>('audioQueue') ?? [];
		audioQueue.push(...cuesToPlay);
		world.setResource('audioQueue', audioQueue);

		this.pendingCues.length = 0;
	}

	/**
	 * Selects the appropriate impact sound based on move type and damage.
	 */
	private getImpactSound(moveId: string, damage: number): string {
		if (damage >= 25) return 'sfx_impact_heavy';
		if (damage >= 15) return 'sfx_impact_medium';
		if (damage >= 8) return 'sfx_impact_light';
		return 'sfx_impact_soft';
	}

	destroy(_world: World): void {
		this.pendingCues.length = 0;
	}
}
