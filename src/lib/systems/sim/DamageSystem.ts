import { System } from '../../ecs/System';
import type { World } from '../../ecs/World';
import type { EventBus } from '../../engine/EventBus';
import type { Phase, EntityId, BodyRegion } from '../../utils/types';
import type { Health } from '../../components/combat/Health';
import type { Stamina } from '../../components/combat/Stamina';
import type { DamageRegion } from '../../components/combat/DamageRegion';
import type { MatchStats } from '../../components/match/MatchStats';
import { clamp } from '../../utils/math';

/**
 * Move data from the registry (subset needed for damage calculation).
 */
interface MoveData {
	id: string;
	baseDamage: number;
	region: BodyRegion;
	category: string;
}

interface MoveHitEvent {
	attacker: EntityId;
	defender: EntityId;
	moveId: string;
	damage: number;
	region: BodyRegion;
}

/**
 * DamageSystem
 *
 * Listens to 'combat:move_hit' events and applies damage to the defender.
 * Damage is calculated using a formula that accounts for:
 *  - Base damage from the move registry
 *  - Attacker stamina (exhausted wrestlers deal less damage)
 *  - Regional damage accumulation (weakened body parts take more damage)
 *
 * Damage formula:
 *   finalDamage = baseDamage * staminaMultiplier * regionVulnerability
 *
 * Where:
 *   staminaMultiplier = 0.5 + 0.5 * (attackerStamina / attackerMaxStamina)
 *   regionVulnerability = 1.0 + 0.3 * (regionDamage / 100)
 */
export class DamageSystem extends System {
	readonly name = 'DamageSystem';
	readonly phase: Phase = 'sim';
	readonly priority = 15;

	private pendingHits: MoveHitEvent[] = [];

	init(_world: World, eventBus: EventBus): void {
		eventBus.on('combat:move_hit', (ev: MoveHitEvent) => {
			this.pendingHits.push(ev);
		});
	}

	execute(world: World, _dt: number, _eventBus: EventBus): void {
		const moveRegistry = world.getResource<Map<string, MoveData>>('moveRegistry');

		for (const hit of this.pendingHits) {
			const moveData = moveRegistry?.get(hit.moveId);
			const baseDamage = moveData?.baseDamage ?? hit.damage;
			const region = moveData?.region ?? hit.region;

			// Calculate stamina multiplier for attacker
			const attackerStamina = world.getComponent<Stamina>(hit.attacker, 'Stamina');
			const staminaMultiplier = attackerStamina
				? 0.5 + 0.5 * (attackerStamina.current / attackerStamina.max)
				: 1.0;

			// Calculate region vulnerability for defender
			const defenderRegion = world.getComponent<DamageRegion>(hit.defender, 'DamageRegion');
			let regionVulnerability = 1.0;
			if (defenderRegion) {
				const regionDamage = defenderRegion[region] ?? 0;
				regionVulnerability = 1.0 + 0.3 * (regionDamage / 100);
			}

			const finalDamage = Math.round(baseDamage * staminaMultiplier * regionVulnerability);

			// Apply damage to Health
			const defenderHealth = world.getComponent<Health>(hit.defender, 'Health');
			if (defenderHealth) {
				world.commandBuffer.updateComponent(hit.defender, 'Health', (h: any) => ({
					...h,
					current: clamp(h.current - finalDamage, 0, h.max),
					damageLog: [
						...h.damageLog.slice(-19), // keep last 20 entries
						{ amount: finalDamage, frame: 0, moveId: hit.moveId }
					]
				}));
			}

			// Apply damage to DamageRegion
			if (defenderRegion) {
				world.commandBuffer.updateComponent(hit.defender, 'DamageRegion', (dr: any) => ({
					...dr,
					[region]: clamp(dr[region] + finalDamage * 0.5, 0, 200)
				}));
			}

			// Update attacker stats
			const attackerStats = world.getComponent<MatchStats>(hit.attacker, 'MatchStats');
			if (attackerStats) {
				world.commandBuffer.updateComponent(hit.attacker, 'MatchStats', (s: any) => ({
					...s,
					movesHit: s.movesHit + 1,
					damageDealt: s.damageDealt + finalDamage
				}));
			}

			// Update defender stats
			const defenderStats = world.getComponent<MatchStats>(hit.defender, 'MatchStats');
			if (defenderStats) {
				world.commandBuffer.updateComponent(hit.defender, 'MatchStats', (s: any) => ({
					...s,
					damageTaken: s.damageTaken + finalDamage
				}));
			}
		}

		this.pendingHits.length = 0;
	}

	destroy(_world: World): void {
		this.pendingHits.length = 0;
	}
}
