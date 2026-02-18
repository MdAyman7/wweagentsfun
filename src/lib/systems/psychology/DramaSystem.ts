import { System } from '../../ecs/System';
import { Query } from '../../ecs/Query';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId } from '../../utils/types';
import type { DramaState } from '../../components/psychology/DramaState';
import type { Health } from '../../components/combat/Health';
import type { CrowdHeat } from '../../components/psychology/CrowdHeat';
import type { Momentum } from '../../components/combat/Momentum';
import { clamp } from '../../utils/math';

/** Health ratio below which a wrestler is considered "losing badly." */
const LOSING_THRESHOLD = 0.35;

/** Minimum crowd pop to trigger comeback eligibility. */
const COMEBACK_CROWD_THRESHOLD = 60;

/** Tension value that triggers drama_peak event. */
const DRAMA_PEAK_THRESHOLD = 0.85;

/** Minimum seconds between drama peaks. */
const DRAMA_PEAK_COOLDOWN = 15;

/**
 * DramaSystem
 *
 * The invisible director of the match. This system calculates the
 * dramatic tension of the match and triggers pacing mechanisms:
 *
 * Tension calculation:
 *   - Health differential: wider gap = more tension (crowd senses a winner)
 *   - Near-fall count: more near-falls = escalating drama
 *   - Match duration: tension builds over time (early match is low stakes)
 *   - Crowd pop: high crowd engagement amplifies tension
 *
 * Comeback mechanic:
 *   - When a wrestler is losing badly (health < 35% of opponent)
 *   - AND has crowd support (pop > 60)
 *   - They become comeback-eligible, which AI strategies can read
 *   - This models the dramatic comeback that is central to pro wrestling
 *
 * Drama peaks:
 *   - When tension > 0.85, emit 'psych:drama_peak'
 *   - This triggers camera angles, commentary emphasis, etc.
 *   - Cooldown prevents spamming
 */
export class DramaSystem extends System {
	readonly name = 'DramaSystem';
	readonly phase: Phase = 'psychology';
	readonly priority = 10;

	private dramaQuery = new Query(['DramaState', 'Health', 'Momentum']);
	private matchElapsedTime = 0;
	private lastDramaPeakTime = -DRAMA_PEAK_COOLDOWN;

	execute(world: World, dt: number, eventBus: EventBus): void {
		this.matchElapsedTime += dt;

		const results = this.dramaQuery.execute(world);
		if (results.length < 2) return;

		// Gather health data for all participants
		const healthData: Array<{ entity: EntityId; ratio: number }> = [];
		for (const { entity, components } of results) {
			const health = components.get('Health') as Health;
			healthData.push({
				entity,
				ratio: health.current / health.max
			});
		}

		// Calculate pairwise tension for each wrestler
		for (const { entity, components } of results) {
			const dramaState = components.get('DramaState') as DramaState;
			const health = components.get('Health') as Health;
			const selfRatio = health.current / health.max;

			// Find the opponent(s) health ratio
			const opponents = healthData.filter(h => h.entity !== entity);
			const avgOpponentRatio = opponents.length > 0
				? opponents.reduce((sum, h) => sum + h.ratio, 0) / opponents.length
				: 1.0;

			// Tension components
			const healthDifferential = Math.abs(selfRatio - avgOpponentRatio);
			const nearFallFactor = Math.min(dramaState.nearFallCount * 0.15, 0.4);
			const timeFactor = Math.min(this.matchElapsedTime / 600, 0.3); // Peaks at 10 min
			const falseFinishFactor = Math.min(dramaState.falseFinishes * 0.1, 0.2);

			// Crowd contribution
			const crowdHeat = world.getComponent<CrowdHeat>(entity, 'CrowdHeat');
			const crowdFactor = crowdHeat ? (crowdHeat.pop / 100) * 0.2 : 0;

			const tension = clamp(
				healthDifferential * 0.4 + nearFallFactor + timeFactor + falseFinishFactor + crowdFactor,
				0,
				1
			);

			// Comeback eligibility check
			let comebackEligible = dramaState.comebackEligible;

			if (!comebackEligible && selfRatio < LOSING_THRESHOLD && avgOpponentRatio > selfRatio + 0.3) {
				// Check crowd support
				if (crowdHeat && crowdHeat.pop >= COMEBACK_CROWD_THRESHOLD) {
					comebackEligible = true;
					eventBus.emit('psych:comeback', {
						entity,
						triggerEvent: 'health_deficit'
					});
				}
			}

			// Reset comeback eligibility if health recovers
			if (comebackEligible && selfRatio > 0.6) {
				comebackEligible = false;
			}

			world.addComponent(entity, 'DramaState', {
				...dramaState,
				tension,
				comebackEligible
			});

			// Check for drama peak
			if (tension >= DRAMA_PEAK_THRESHOLD &&
				this.matchElapsedTime - this.lastDramaPeakTime >= DRAMA_PEAK_COOLDOWN) {
				this.lastDramaPeakTime = this.matchElapsedTime;
				eventBus.emit('psych:drama_peak', {
					tension,
					frame: 0
				});
			}
		}
	}

	destroy(_world: World): void {
		this.matchElapsedTime = 0;
		this.lastDramaPeakTime = -DRAMA_PEAK_COOLDOWN;
	}
}
