import type { Frame } from '../utils/types';

/**
 * A single training sample: state → action → reward.
 * Used for RL training data export.
 */
export interface TrainingSample {
	frame: Frame;
	entityId: number;
	observation: number[];
	action: number; // discrete action ID from ActionSpace
	reward: number;
	done: boolean; // terminal state
	nextObservation: number[] | null;
}

/**
 * Exports (observation, action, reward) tuples for RL training.
 * Can write to JSONL format for consumption by Python trainers.
 */
export class TrainingExporter {
	private samples: TrainingSample[] = [];

	/** Record a training sample. */
	record(sample: TrainingSample): void {
		this.samples.push(sample);
	}

	/** Export all samples as JSONL (one JSON object per line). */
	toJSONL(): string {
		return this.samples.map((s) => JSON.stringify(s)).join('\n');
	}

	/** Export as a downloadable Blob. */
	toBlob(): Blob {
		return new Blob([this.toJSONL()], { type: 'application/jsonl' });
	}

	/** Get all samples as an array (for in-memory training). */
	getSamples(): readonly TrainingSample[] {
		return this.samples;
	}

	/** Get samples for a specific entity. */
	getEntitySamples(entityId: number): TrainingSample[] {
		return this.samples.filter((s) => s.entityId === entityId);
	}

	/** Summary statistics. */
	getSummary(): {
		totalSamples: number;
		avgReward: number;
		episodeLength: number;
		terminalCount: number;
	} {
		const totalReward = this.samples.reduce((sum, s) => sum + s.reward, 0);
		const terminalCount = this.samples.filter((s) => s.done).length;
		return {
			totalSamples: this.samples.length,
			avgReward: this.samples.length > 0 ? totalReward / this.samples.length : 0,
			episodeLength: this.samples.length,
			terminalCount
		};
	}

	get size(): number {
		return this.samples.length;
	}

	clear(): void {
		this.samples.length = 0;
	}
}
