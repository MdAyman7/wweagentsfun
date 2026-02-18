import { World } from '../ecs/World';
import { createTransform } from '../components/spatial/Transform';
import { createVelocity } from '../components/spatial/Velocity';
import { createCollider } from '../components/spatial/Collider';
import { createHealth } from '../components/combat/Health';
import { createStamina } from '../components/combat/Stamina';
import { createMomentum } from '../components/combat/Momentum';
import { createCombatState } from '../components/combat/CombatState';
import { createGrappleState } from '../components/combat/GrappleState';
import { createDamageRegion } from '../components/combat/DamageRegion';
import { createAgentBrain } from '../components/agent/AgentBrain';
import { createAgentDecision } from '../components/agent/AgentDecision';
import { createAgentMemory } from '../components/agent/AgentMemory';
import { createAgentObservation } from '../components/agent/AgentObservation';
import { createCrowdHeat } from '../components/psychology/CrowdHeat';
import { createDramaState } from '../components/psychology/DramaState';
import { createFatigue } from '../components/psychology/Fatigue';
import { createMatchRole } from '../components/match/MatchRole';
import { createMatchStats } from '../components/match/MatchStats';
import { createRenderable } from '../components/rendering/Renderable';
import { createAnimationState } from '../components/rendering/AnimationState';
import type { EntityId, Alignment, Seed } from '../utils/types';

export interface WrestlerConfig {
	name: string;
	alignment: Alignment;
	health: number;
	stamina: number;
	strategyId: string;
	personalityId: string;
	movesetId: string;
	color: string;
}

export interface MatchConfig {
	matchType: string;
	wrestlers: WrestlerConfig[];
	seed: Seed;
	timeLimit: number; // in seconds, 0 = no limit
	rules: {
		countOut: boolean;
		dq: boolean;
		ropeBreak: boolean;
	};
}

/**
 * Creates a fully configured World for a match.
 * Spawns wrestler entities with all required components.
 */
export class MatchFactory {
	static create(world: World, config: MatchConfig): EntityId[] {
		// Store match config as a resource
		world.setResource('matchConfig', config);
		world.setResource('matchPhase', 'pre');
		world.setResource('matchTime', 0);

		const entityIds: EntityId[] = [];

		// Spawn wrestlers
		const spacing = 3; // meters apart
		for (let i = 0; i < config.wrestlers.length; i++) {
			const w = config.wrestlers[i];
			const xOffset = (i - (config.wrestlers.length - 1) / 2) * spacing;
			const entityId = world.createEntity();

			// Spatial
			world.addComponent(entityId, 'Transform', createTransform({
				position: [xOffset, 0, 0]
			}));
			world.addComponent(entityId, 'Velocity', createVelocity());
			world.addComponent(entityId, 'Collider', createCollider({
				shape: 'capsule',
				dimensions: { width: 0.4, height: 1.8, depth: 0.4, radius: 0.4 }
			}));

			// Combat
			world.addComponent(entityId, 'Health', createHealth({ max: w.health, current: w.health }));
			world.addComponent(entityId, 'Stamina', createStamina({ max: w.stamina, current: w.stamina }));
			world.addComponent(entityId, 'Momentum', createMomentum());
			world.addComponent(entityId, 'CombatState', createCombatState());
			world.addComponent(entityId, 'GrappleState', createGrappleState());
			world.addComponent(entityId, 'DamageRegion', createDamageRegion());

			// Agent
			world.addComponent(entityId, 'AgentBrain', createAgentBrain({
				strategyId: w.strategyId,
				personalityId: w.personalityId
			}));
			world.addComponent(entityId, 'AgentDecision', createAgentDecision());
			world.addComponent(entityId, 'AgentMemory', createAgentMemory());
			world.addComponent(entityId, 'AgentObservation', createAgentObservation());

			// Psychology
			world.addComponent(entityId, 'CrowdHeat', createCrowdHeat({
				sentiment: w.alignment === 'face' ? 0.5 : -0.5
			}));
			world.addComponent(entityId, 'DramaState', createDramaState());
			world.addComponent(entityId, 'Fatigue', createFatigue());

			// Match
			world.addComponent(entityId, 'MatchRole', createMatchRole({
				name: w.name,
				alignment: w.alignment,
				entryOrder: i
			}));
			world.addComponent(entityId, 'MatchStats', createMatchStats());

			// Rendering
			world.addComponent(entityId, 'Renderable', createRenderable({
				meshId: `wrestler_${entityId}`,
				castShadow: true
			}));
			world.addComponent(entityId, 'AnimationState', createAnimationState());

			entityIds.push(entityId);
		}

		return entityIds;
	}
}
