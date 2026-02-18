import type { World } from '../ecs/World';
import { Query } from '../ecs/Query';
import { matchState, type WrestlerUIState } from './matchStore';
import type { Health } from '../components/combat/Health';
import type { Stamina } from '../components/combat/Stamina';
import type { Momentum } from '../components/combat/Momentum';
import type { CombatState } from '../components/combat/CombatState';
import type { ActiveMove } from '../components/combat/ActiveMove';
import type { MatchRole } from '../components/match/MatchRole';
import type { MatchConfig } from '../match/MatchFactory';

const wrestlerQuery = new Query(['Health', 'Stamina', 'Momentum', 'CombatState', 'MatchRole']);

/**
 * One-way sync: ECS World → Svelte stores.
 * Called once per tick by the GameLoop after all systems have run.
 * This is the ONLY bridge between the simulation and the UI.
 */
export function syncStores(world: World, frame: number): void {
	const results = wrestlerQuery.execute(world);
	const config = world.getResource<MatchConfig>('matchConfig');
	const matchPhase = world.getResource<string>('matchPhase') ?? 'pre';
	const matchTime = world.getResource<number>('matchTime') ?? 0;

	const wrestlers: WrestlerUIState[] = results.map((r) => {
		const health = r.components.get('Health') as Health;
		const stamina = r.components.get('Stamina') as Stamina;
		const momentum = r.components.get('Momentum') as Momentum;
		const combat = r.components.get('CombatState') as CombatState;
		const role = r.components.get('MatchRole') as MatchRole;
		const activeMove = world.getComponent<ActiveMove>(r.entity, 'ActiveMove');

		return {
			entityId: r.entity,
			name: role.name,
			health: health.current,
			healthMax: health.max,
			stamina: stamina.current,
			staminaMax: stamina.max,
			momentum: momentum.value,
			currentMove: activeMove?.moveId ?? null,
			combatPhase: combat.phase,
			alignment: role.alignment,
			eliminated: role.eliminated
		};
	});

	matchState.set({
		phase: matchPhase as 'pre' | 'live' | 'post',
		matchType: config?.matchType ?? 'singles',
		elapsed: matchTime,
		wrestlers,
		recentEvents: [], // TODO: populated by event log listener
		winner: null, // TODO: populated by match end event
		winMethod: null,
		matchRating: 0
	});
}
