import type { MoveCategory, BodyRegion } from '../utils/types';

/**
 * Hitbox definition for spatial collision during move execution.
 */
export interface MoveHitbox {
	/** Effective range in world units. */
	range: number;
	/** Angle of the hitbox arc in degrees (360 = all-around). */
	angle: number;
}

/**
 * Complete definition of a wrestling move.
 * Immutable after registration — treat as read-only data.
 */
export interface MoveDef {
	/** Unique identifier (e.g., 'ddt', 'suplex', 'dropkick'). */
	id: string;
	/** Human-readable display name. */
	name: string;
	/** Move type classification. */
	category: MoveCategory;
	/** Frames of windup animation before the move becomes active. */
	windupFrames: number;
	/** Frames during which the hitbox is active and can connect. */
	activeFrames: number;
	/** Frames of recovery after the active phase. */
	recoveryFrames: number;
	/** Base damage before modifiers. */
	baseDamage: number;
	/** Stamina cost to the attacker. */
	staminaCost: number;
	/** Body region this move targets for damage accumulation. */
	region: BodyRegion;
	/** Momentum gained by the attacker on hit. */
	momentumGain: number;
	/** Spatial hitbox for collision detection. */
	hitbox: MoveHitbox;
	/** Whether this move can be reversed/countered by the defender. */
	canBeReversed: boolean;
	/** Frame window in which a reversal input is accepted (0 = not reversible). */
	reversalWindow: number;
}

/**
 * Default move database.
 * Each entry is a complete MoveDef with realistic frame data and damage values.
 */
const DEFAULT_MOVES: MoveDef[] = [
	// ── Strikes ──
	{
		id: 'jab',
		name: 'Jab',
		category: 'strike',
		windupFrames: 2,
		activeFrames: 3,
		recoveryFrames: 4,
		baseDamage: 3,
		staminaCost: 2,
		region: 'head',
		momentumGain: 2,
		hitbox: { range: 1.5, angle: 45 },
		canBeReversed: false,
		reversalWindow: 0
	},
	{
		id: 'chop',
		name: 'Knife Edge Chop',
		category: 'strike',
		windupFrames: 4,
		activeFrames: 3,
		recoveryFrames: 6,
		baseDamage: 6,
		staminaCost: 4,
		region: 'body',
		momentumGain: 4,
		hitbox: { range: 1.8, angle: 60 },
		canBeReversed: false,
		reversalWindow: 0
	},
	{
		id: 'forearm_smash',
		name: 'Forearm Smash',
		category: 'strike',
		windupFrames: 5,
		activeFrames: 4,
		recoveryFrames: 7,
		baseDamage: 8,
		staminaCost: 5,
		region: 'head',
		momentumGain: 5,
		hitbox: { range: 1.8, angle: 50 },
		canBeReversed: true,
		reversalWindow: 3
	},
	{
		id: 'kick',
		name: 'Body Kick',
		category: 'strike',
		windupFrames: 4,
		activeFrames: 4,
		recoveryFrames: 6,
		baseDamage: 7,
		staminaCost: 4,
		region: 'body',
		momentumGain: 4,
		hitbox: { range: 2.2, angle: 45 },
		canBeReversed: true,
		reversalWindow: 4
	},
	{
		id: 'superkick',
		name: 'Superkick',
		category: 'strike',
		windupFrames: 8,
		activeFrames: 3,
		recoveryFrames: 10,
		baseDamage: 15,
		staminaCost: 10,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 2.5, angle: 30 },
		canBeReversed: true,
		reversalWindow: 5
	},
	{
		id: 'clothesline',
		name: 'Clothesline',
		category: 'strike',
		windupFrames: 6,
		activeFrames: 4,
		recoveryFrames: 8,
		baseDamage: 10,
		staminaCost: 6,
		region: 'head',
		momentumGain: 7,
		hitbox: { range: 2.0, angle: 90 },
		canBeReversed: true,
		reversalWindow: 4
	},
	{
		id: 'dropkick',
		name: 'Dropkick',
		category: 'strike',
		windupFrames: 7,
		activeFrames: 4,
		recoveryFrames: 12,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 3.0, angle: 40 },
		canBeReversed: true,
		reversalWindow: 5
	},
	{
		id: 'enzuigiri',
		name: 'Enzuigiri',
		category: 'strike',
		windupFrames: 9,
		activeFrames: 3,
		recoveryFrames: 14,
		baseDamage: 14,
		staminaCost: 10,
		region: 'head',
		momentumGain: 9,
		hitbox: { range: 2.0, angle: 35 },
		canBeReversed: true,
		reversalWindow: 6
	},

	// ── Grapple Moves ──
	{
		id: 'headlock_takeover',
		name: 'Headlock Takeover',
		category: 'grapple',
		windupFrames: 6,
		activeFrames: 8,
		recoveryFrames: 10,
		baseDamage: 8,
		staminaCost: 6,
		region: 'head',
		momentumGain: 5,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 6
	},
	{
		id: 'snap_suplex',
		name: 'Snap Suplex',
		category: 'grapple',
		windupFrames: 8,
		activeFrames: 10,
		recoveryFrames: 12,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 6
	},
	{
		id: 'ddt',
		name: 'DDT',
		category: 'grapple',
		windupFrames: 7,
		activeFrames: 8,
		recoveryFrames: 10,
		baseDamage: 14,
		staminaCost: 8,
		region: 'head',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 5
	},
	{
		id: 'neckbreaker',
		name: 'Neckbreaker',
		category: 'grapple',
		windupFrames: 7,
		activeFrames: 8,
		recoveryFrames: 10,
		baseDamage: 11,
		staminaCost: 7,
		region: 'head',
		momentumGain: 6,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 5
	},
	{
		id: 'body_slam',
		name: 'Body Slam',
		category: 'grapple',
		windupFrames: 10,
		activeFrames: 10,
		recoveryFrames: 8,
		baseDamage: 10,
		staminaCost: 8,
		region: 'body',
		momentumGain: 6,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 7
	},
	{
		id: 'vertical_suplex',
		name: 'Vertical Suplex',
		category: 'grapple',
		windupFrames: 12,
		activeFrames: 12,
		recoveryFrames: 10,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 8,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'german_suplex',
		name: 'German Suplex',
		category: 'grapple',
		windupFrames: 10,
		activeFrames: 12,
		recoveryFrames: 10,
		baseDamage: 16,
		staminaCost: 12,
		region: 'head',
		momentumGain: 10,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 7
	},
	{
		id: 'powerbomb',
		name: 'Powerbomb',
		category: 'grapple',
		windupFrames: 14,
		activeFrames: 12,
		recoveryFrames: 10,
		baseDamage: 18,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'backbreaker',
		name: 'Backbreaker',
		category: 'grapple',
		windupFrames: 8,
		activeFrames: 8,
		recoveryFrames: 10,
		baseDamage: 12,
		staminaCost: 8,
		region: 'body',
		momentumGain: 7,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 6
	},
	{
		id: 'piledriver',
		name: 'Piledriver',
		category: 'grapple',
		windupFrames: 14,
		activeFrames: 10,
		recoveryFrames: 12,
		baseDamage: 20,
		staminaCost: 14,
		region: 'head',
		momentumGain: 12,
		hitbox: { range: 0.8, angle: 360 },
		canBeReversed: true,
		reversalWindow: 8
	},

	// ── Aerial Moves ──
	{
		id: 'diving_crossbody',
		name: 'Diving Crossbody',
		category: 'aerial',
		windupFrames: 12,
		activeFrames: 5,
		recoveryFrames: 16,
		baseDamage: 14,
		staminaCost: 12,
		region: 'body',
		momentumGain: 10,
		hitbox: { range: 4.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 4
	},
	{
		id: 'missile_dropkick',
		name: 'Missile Dropkick',
		category: 'aerial',
		windupFrames: 14,
		activeFrames: 4,
		recoveryFrames: 18,
		baseDamage: 16,
		staminaCost: 14,
		region: 'body',
		momentumGain: 12,
		hitbox: { range: 4.5, angle: 45 },
		canBeReversed: true,
		reversalWindow: 3
	},
	{
		id: 'moonsault',
		name: 'Moonsault',
		category: 'aerial',
		windupFrames: 16,
		activeFrames: 5,
		recoveryFrames: 20,
		baseDamage: 18,
		staminaCost: 16,
		region: 'body',
		momentumGain: 14,
		hitbox: { range: 3.5, angle: 90 },
		canBeReversed: true,
		reversalWindow: 3
	},
	{
		id: 'frog_splash',
		name: 'Frog Splash',
		category: 'aerial',
		windupFrames: 14,
		activeFrames: 4,
		recoveryFrames: 18,
		baseDamage: 17,
		staminaCost: 14,
		region: 'body',
		momentumGain: 13,
		hitbox: { range: 3.0, angle: 70 },
		canBeReversed: true,
		reversalWindow: 3
	},
	{
		id: 'elbow_drop_top',
		name: 'Top Rope Elbow Drop',
		category: 'aerial',
		windupFrames: 12,
		activeFrames: 4,
		recoveryFrames: 14,
		baseDamage: 14,
		staminaCost: 10,
		region: 'body',
		momentumGain: 10,
		hitbox: { range: 2.5, angle: 60 },
		canBeReversed: true,
		reversalWindow: 3
	},

	// ── Submissions ──
	{
		id: 'armbar',
		name: 'Armbar',
		category: 'submission',
		windupFrames: 8,
		activeFrames: 60,
		recoveryFrames: 8,
		baseDamage: 2,
		staminaCost: 6,
		region: 'body',
		momentumGain: 3,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 6
	},
	{
		id: 'sharpshooter',
		name: 'Sharpshooter',
		category: 'submission',
		windupFrames: 10,
		activeFrames: 60,
		recoveryFrames: 10,
		baseDamage: 3,
		staminaCost: 8,
		region: 'legs',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 7
	},
	{
		id: 'sleeper_hold',
		name: 'Sleeper Hold',
		category: 'submission',
		windupFrames: 6,
		activeFrames: 60,
		recoveryFrames: 6,
		baseDamage: 2,
		staminaCost: 4,
		region: 'head',
		momentumGain: 2,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'figure_four',
		name: 'Figure Four Leglock',
		category: 'submission',
		windupFrames: 12,
		activeFrames: 60,
		recoveryFrames: 10,
		baseDamage: 3,
		staminaCost: 10,
		region: 'legs',
		momentumGain: 5,
		hitbox: { range: 1.2, angle: 360 },
		canBeReversed: true,
		reversalWindow: 8
	},
	{
		id: 'crossface',
		name: 'Crossface',
		category: 'submission',
		windupFrames: 8,
		activeFrames: 60,
		recoveryFrames: 8,
		baseDamage: 3,
		staminaCost: 7,
		region: 'head',
		momentumGain: 4,
		hitbox: { range: 1.0, angle: 360 },
		canBeReversed: true,
		reversalWindow: 6
	},

	// ── Signature/Finisher placeholders ──
	// (Real signature/finisher moves are wrestler-specific and loaded via FinisherTable)
	{
		id: 'generic_signature',
		name: 'Signature Move',
		category: 'signature',
		windupFrames: 10,
		activeFrames: 8,
		recoveryFrames: 12,
		baseDamage: 18,
		staminaCost: 12,
		region: 'head',
		momentumGain: 15,
		hitbox: { range: 2.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 4
	},
	{
		id: 'generic_finisher',
		name: 'Finisher',
		category: 'finisher',
		windupFrames: 12,
		activeFrames: 10,
		recoveryFrames: 14,
		baseDamage: 25,
		staminaCost: 15,
		region: 'head',
		momentumGain: 20,
		hitbox: { range: 2.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: 3
	}
];

/**
 * Central registry of all move definitions.
 * Singleton-like: instantiate once and pass by reference.
 * Pre-loaded with the default move set. Additional moves can be
 * registered at runtime (e.g., from JSON data files).
 */
export class MoveRegistry {
	private moves: Map<string, MoveDef> = new Map();
	private byCategory: Map<MoveCategory, MoveDef[]> = new Map();

	constructor(initialMoves?: MoveDef[]) {
		const movesToLoad = initialMoves ?? DEFAULT_MOVES;
		for (const move of movesToLoad) {
			this.register(move);
		}
	}

	/**
	 * Register a new move definition.
	 * Overwrites any existing move with the same ID.
	 */
	register(move: MoveDef): void {
		this.moves.set(move.id, move);

		// Update category index
		const catList = this.byCategory.get(move.category) ?? [];
		// Remove old entry if re-registering
		const existingIdx = catList.findIndex((m) => m.id === move.id);
		if (existingIdx >= 0) {
			catList[existingIdx] = move;
		} else {
			catList.push(move);
		}
		this.byCategory.set(move.category, catList);
	}

	/**
	 * Get a move definition by ID.
	 * Returns undefined if the move is not registered.
	 */
	get(id: string): MoveDef | undefined {
		return this.moves.get(id);
	}

	/**
	 * Get all moves in a given category.
	 */
	getByCategory(category: MoveCategory): MoveDef[] {
		return this.byCategory.get(category) ?? [];
	}

	/**
	 * Get all registered move definitions.
	 */
	getAll(): MoveDef[] {
		return Array.from(this.moves.values());
	}

	/**
	 * Check if a move ID is registered.
	 */
	has(id: string): boolean {
		return this.moves.has(id);
	}

	/**
	 * Get the total number of registered moves.
	 */
	get size(): number {
		return this.moves.size;
	}

	/**
	 * Load moves from a JSON array (e.g., from a data file).
	 * Validates required fields before registration.
	 */
	loadFromJSON(data: unknown[]): number {
		let loaded = 0;
		for (const entry of data) {
			if (this.isValidMoveDef(entry)) {
				this.register(entry);
				loaded++;
			}
		}
		return loaded;
	}

	/**
	 * Type guard to validate a move definition from external data.
	 */
	private isValidMoveDef(data: unknown): data is MoveDef {
		if (typeof data !== 'object' || data === null) return false;
		const obj = data as Record<string, unknown>;
		return (
			typeof obj.id === 'string' &&
			typeof obj.name === 'string' &&
			typeof obj.category === 'string' &&
			typeof obj.windupFrames === 'number' &&
			typeof obj.activeFrames === 'number' &&
			typeof obj.recoveryFrames === 'number' &&
			typeof obj.baseDamage === 'number' &&
			typeof obj.staminaCost === 'number' &&
			typeof obj.region === 'string' &&
			typeof obj.momentumGain === 'number' &&
			typeof obj.hitbox === 'object' &&
			obj.hitbox !== null &&
			typeof (obj.hitbox as Record<string, unknown>).range === 'number' &&
			typeof (obj.hitbox as Record<string, unknown>).angle === 'number' &&
			typeof obj.canBeReversed === 'boolean' &&
			typeof obj.reversalWindow === 'number'
		);
	}
}
