import type { ComponentData } from '../../ecs/Component';

/**
 * Agent brain configuration.
 * Points to which strategy and personality profile to use for decisions.
 */
export interface AgentBrain extends ComponentData {
	readonly _type: 'AgentBrain';
	strategyId: string;
	personalityId: string;
	/** Frames between decisions (prevents spamming). */
	decisionCooldown: number;
	/** Frames until next decision is allowed. */
	cooldownRemaining: number;
}

export function createAgentBrain(overrides: Partial<Omit<AgentBrain, '_type'>> = {}): AgentBrain {
	return {
		_type: 'AgentBrain',
		strategyId: 'behavior_tree',
		personalityId: 'balanced',
		decisionCooldown: 6,
		cooldownRemaining: 0,
		...overrides
	};
}
