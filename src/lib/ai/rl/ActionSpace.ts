/**
 * Discrete action space for the wrestling AI.
 * Maps human-readable action strings to integer IDs and back.
 * The integer encoding is used by RL policies (neural network output layer).
 */

/** All valid action strings in the simulation. */
export const ACTION_LIST = [
	'idle',
	'light_strike',
	'heavy_strike',
	'grapple_initiate',
	'front_grapple_move',
	'rear_grapple_move',
	'aerial_move',
	'pin_attempt',
	'submission',
	'block',
	'dodge',
	'taunt',
	'run_ropes',
	'irish_whip',
	'signature_move',
	'finisher'
] as const;

/** Union type of all valid action strings. */
export type ActionName = (typeof ACTION_LIST)[number];

/** Total number of discrete actions. */
export const ACTION_COUNT = ACTION_LIST.length;

/**
 * Map from action string to integer ID.
 */
export const ACTION_TO_ID: Record<ActionName, number> = Object.fromEntries(
	ACTION_LIST.map((name, index) => [name, index])
) as Record<ActionName, number>;

/**
 * Map from integer ID to action string.
 */
export const ID_TO_ACTION: Record<number, ActionName> = Object.fromEntries(
	ACTION_LIST.map((name, index) => [index, name])
) as Record<number, ActionName>;

/**
 * Category mapping for each action (used for personality bias).
 */
export const ACTION_CATEGORIES: Record<ActionName, string> = {
	idle: 'defensive',
	light_strike: 'strike',
	heavy_strike: 'strike',
	grapple_initiate: 'grapple',
	front_grapple_move: 'grapple',
	rear_grapple_move: 'grapple',
	aerial_move: 'aerial',
	pin_attempt: 'tactical',
	submission: 'submission',
	block: 'defensive',
	dodge: 'defensive',
	taunt: 'taunt',
	run_ropes: 'tactical',
	irish_whip: 'grapple',
	signature_move: 'signature',
	finisher: 'finisher'
};

/**
 * Convert an action string to its integer ID.
 * Returns -1 if the action is not recognized.
 */
export function actionToId(action: string): number {
	const id = ACTION_TO_ID[action as ActionName];
	return id !== undefined ? id : -1;
}

/**
 * Convert an integer ID to its action string.
 * Returns 'idle' if the ID is out of range.
 */
export function idToAction(id: number): ActionName {
	return ID_TO_ACTION[id] ?? 'idle';
}

/**
 * Check if a string is a valid action name.
 */
export function isValidAction(action: string): action is ActionName {
	return ACTION_TO_ID[action as ActionName] !== undefined;
}

/**
 * Get the category for a given action.
 */
export function getActionCategory(action: string): string {
	return ACTION_CATEGORIES[action as ActionName] ?? 'unknown';
}
