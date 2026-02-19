import type { MoveDef } from './MoveRegistry';
import type { MoveCategory, BodyRegion } from '../utils/types';

/**
 * A wrestler's signature or finisher move definition.
 * Extends the base MoveDef with additional wrestler-specific metadata.
 */
export interface SpecialMoveDef extends MoveDef {
	/** The moveset ID this special move belongs to. */
	movesetId: string;
	/** Whether this is a signature or finisher. */
	specialType: 'signature' | 'finisher';
	/** Setup description for commentary/animation. */
	setupDescription: string;
}

/**
 * A wrestler's moveset entry: links a moveset ID to their special moves.
 */
export interface MovesetEntry {
	/** Unique moveset identifier (matches wrestler data). */
	movesetId: string;
	/** Wrestler name for display. */
	wrestlerName: string;
	/** The signature move(s). */
	signatures: SpecialMoveDef[];
	/** The finisher move(s). */
	finishers: SpecialMoveDef[];
}

/**
 * Helper to create a SpecialMoveDef with common defaults.
 */
function makeSpecial(
	movesetId: string,
	specialType: 'signature' | 'finisher',
	id: string,
	name: string,
	category: MoveCategory,
	baseDamage: number,
	region: BodyRegion,
	setupDescription: string,
	overrides: Partial<MoveDef> = {}
): SpecialMoveDef {
	return {
		id,
		name,
		category,
		windupFrames: specialType === 'finisher' ? 42 : 30,
		activeFrames: specialType === 'finisher' ? 30 : 24,
		recoveryFrames: specialType === 'finisher' ? 42 : 30,
		baseDamage,
		staminaCost: specialType === 'finisher' ? 18 : 12,
		region,
		momentumGain: specialType === 'finisher' ? 20 : 15,
		hitbox: { range: 2.0, angle: 60 },
		canBeReversed: true,
		reversalWindow: specialType === 'finisher' ? 3 : 4,
		movesetId,
		specialType,
		setupDescription,
		...overrides
	};
}

/**
 * Default moveset definitions.
 * Each entry represents a wrestler archetype with their special moves.
 */
const DEFAULT_MOVESETS: MovesetEntry[] = [
	{
		movesetId: 'powerhouse_a',
		wrestlerName: 'The Titan',
		signatures: [
			makeSpecial('powerhouse_a', 'signature', 'titan_press', 'Titan Press', 'signature', 20, 'body',
				'Lifts opponent overhead', {
					windupFrames: 42,
					staminaCost: 14,
					hitbox: { range: 1.5, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('powerhouse_a', 'finisher', 'titan_bomb', 'Titan Bomb', 'finisher', 30, 'body',
				'Lifts opponent for devastating powerbomb', {
					windupFrames: 48,
					activeFrames: 36,
					staminaCost: 20,
					hitbox: { range: 1.5, angle: 360 }
				})
		]
	},
	{
		movesetId: 'technician_a',
		wrestlerName: 'The Architect',
		signatures: [
			makeSpecial('technician_a', 'signature', 'architect_lock', 'Architect Lock', 'signature', 4, 'legs',
				'Locks in a complex leg submission', {
					category: 'submission',
					windupFrames: 30,
					activeFrames: 120,
					recoveryFrames: 24,
					staminaCost: 10,
					hitbox: { range: 1.0, angle: 360 }
				})
		],
		finishers: [
			makeSpecial('technician_a', 'finisher', 'blueprint_driver', 'Blueprint Driver', 'finisher', 28, 'head',
				'Hooks the arm and drives opponent into the mat', {
					windupFrames: 36,
					staminaCost: 18
				})
		]
	},
	{
		movesetId: 'highflyer_a',
		wrestlerName: 'Phoenix',
		signatures: [
			makeSpecial('highflyer_a', 'signature', 'phoenix_kick', 'Phoenix Kick', 'signature', 18, 'head',
				'Springboard spinning heel kick', {
					category: 'aerial' as MoveCategory,
					windupFrames: 36,
					staminaCost: 14,
					hitbox: { range: 3.5, angle: 45 }
				})
		],
		finishers: [
			makeSpecial('highflyer_a', 'finisher', 'phoenix_splash', 'Phoenix Splash', 'finisher', 32, 'body',
				'Corkscrew shooting star press from the top rope', {
					category: 'aerial' as MoveCategory,
					windupFrames: 54,
					activeFrames: 15,
					recoveryFrames: 60,
					staminaCost: 22,
					hitbox: { range: 4.0, angle: 90 },
					reversalWindow: 5
				})
		]
	},
	{
		movesetId: 'brawler_a',
		wrestlerName: 'Bonebreaker',
		signatures: [
			makeSpecial('brawler_a', 'signature', 'bone_lariat', 'Bone Lariat', 'signature', 22, 'head',
				'Running lariat with devastating impact', {
					windupFrames: 24,
					staminaCost: 10,
					hitbox: { range: 2.5, angle: 90 }
				})
		],
		finishers: [
			makeSpecial('brawler_a', 'finisher', 'skull_crusher', 'Skull Crusher', 'finisher', 28, 'head',
				'Short-arm clothesline into a sit-out piledriver', {
					windupFrames: 36,
					staminaCost: 16
				})
		]
	},
	{
		movesetId: 'psychologist_a',
		wrestlerName: 'The Mastermind',
		signatures: [
			makeSpecial('psychologist_a', 'signature', 'mind_game', 'Mind Game', 'signature', 16, 'head',
				'Calculated strike combination targeting a weakened area', {
					windupFrames: 24,
					activeFrames: 30,
					staminaCost: 10
				})
		],
		finishers: [
			makeSpecial('psychologist_a', 'finisher', 'checkmate', 'Checkmate', 'finisher', 26, 'head',
				'Methodical setup into a devastating finishing blow', {
					windupFrames: 42,
					activeFrames: 24,
					staminaCost: 16
				})
		]
	},
	{
		movesetId: 'allrounder_a',
		wrestlerName: 'The Prodigy',
		signatures: [
			makeSpecial('allrounder_a', 'signature', 'prodigy_cutter', 'Prodigy Cutter', 'signature', 20, 'head',
				'Leaping cutter out of nowhere', {
					windupFrames: 18,
					staminaCost: 12,
					hitbox: { range: 2.5, angle: 60 },
					reversalWindow: 5
				})
		],
		finishers: [
			makeSpecial('allrounder_a', 'finisher', 'prodigy_slam', 'Prodigy Slam', 'finisher', 28, 'body',
				'Spinning uranage slam', {
					windupFrames: 30,
					staminaCost: 16,
					hitbox: { range: 1.5, angle: 360 }
				})
		]
	}
];

/**
 * Central table mapping moveset IDs to their signature and finisher moves.
 *
 * Usage:
 * - Look up a wrestler's special moves by their moveset ID.
 * - Check if a wrestler has enough momentum to attempt their finisher.
 * - Get the full move definition for animation and damage calculation.
 */
export class FinisherTable {
	private movesets: Map<string, MovesetEntry> = new Map();

	constructor(initialMovesets?: MovesetEntry[]) {
		const data = initialMovesets ?? DEFAULT_MOVESETS;
		for (const entry of data) {
			this.movesets.set(entry.movesetId, entry);
		}
	}

	/**
	 * Register a new moveset entry.
	 */
	register(entry: MovesetEntry): void {
		this.movesets.set(entry.movesetId, entry);
	}

	/**
	 * Get the signature move(s) for a moveset.
	 * Returns the first signature if multiple exist.
	 */
	getSignature(movesetId: string): SpecialMoveDef | undefined {
		const entry = this.movesets.get(movesetId);
		return entry?.signatures[0];
	}

	/**
	 * Get all signature moves for a moveset.
	 */
	getAllSignatures(movesetId: string): SpecialMoveDef[] {
		return this.movesets.get(movesetId)?.signatures ?? [];
	}

	/**
	 * Get the finisher move(s) for a moveset.
	 * Returns the first finisher if multiple exist.
	 */
	getFinisher(movesetId: string): SpecialMoveDef | undefined {
		const entry = this.movesets.get(movesetId);
		return entry?.finishers[0];
	}

	/**
	 * Get all finisher moves for a moveset.
	 */
	getAllFinishers(movesetId: string): SpecialMoveDef[] {
		return this.movesets.get(movesetId)?.finishers ?? [];
	}

	/**
	 * Check if a wrestler can attempt their finisher based on current momentum.
	 *
	 * @param momentum - Current momentum value (0-100).
	 * @param threshold - Minimum momentum required. Default 80 (matching Momentum component).
	 * @returns True if momentum meets or exceeds the threshold.
	 */
	canAttemptFinisher(momentum: number, threshold: number = 80): boolean {
		return momentum >= threshold;
	}

	/**
	 * Get the full moveset entry (signatures + finishers).
	 */
	getMoveset(movesetId: string): MovesetEntry | undefined {
		return this.movesets.get(movesetId);
	}

	/**
	 * Check if a moveset ID is registered.
	 */
	has(movesetId: string): boolean {
		return this.movesets.has(movesetId);
	}

	/**
	 * Get all registered moveset IDs.
	 */
	getAllMovesetIds(): string[] {
		return Array.from(this.movesets.keys());
	}

	/**
	 * Get the total number of registered movesets.
	 */
	get size(): number {
		return this.movesets.size;
	}

	/**
	 * Load movesets from external JSON data.
	 */
	loadFromJSON(data: unknown[]): number {
		let loaded = 0;
		for (const entry of data) {
			if (this.isValidMovesetEntry(entry)) {
				this.register(entry as MovesetEntry);
				loaded++;
			}
		}
		return loaded;
	}

	/**
	 * Basic validation for moveset entries from external sources.
	 */
	private isValidMovesetEntry(data: unknown): boolean {
		if (typeof data !== 'object' || data === null) return false;
		const obj = data as Record<string, unknown>;
		return (
			typeof obj.movesetId === 'string' &&
			typeof obj.wrestlerName === 'string' &&
			Array.isArray(obj.signatures) &&
			Array.isArray(obj.finishers)
		);
	}
}
