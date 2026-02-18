import type { WorldSnapshot } from '../ecs/Serializer';

/**
 * Compresses/decompresses replay data for storage and sharing.
 * Uses JSON with optional binary compression in the future.
 */

export interface ReplayFile {
	version: 1;
	seed: number;
	tickRate: number;
	matchType: string;
	participants: string[];
	frameCount: number;
	frames: WorldSnapshot[];
	events: Array<{ frame: number; type: string; payload: unknown }>;
	metadata: {
		createdAt: string;
		duration: number;
		winner: string;
		matchRating: number;
	};
}

export class ReplaySerializer {
	/** Encode a replay to a JSON string. */
	static encode(replay: ReplayFile): string {
		return JSON.stringify(replay);
	}

	/** Decode a replay from a JSON string. */
	static decode(json: string): ReplayFile {
		const parsed = JSON.parse(json);
		if (parsed.version !== 1) {
			throw new Error(`Unsupported replay version: ${parsed.version}`);
		}
		return parsed as ReplayFile;
	}

	/** Encode to a Blob for download. */
	static toBlob(replay: ReplayFile): Blob {
		const json = ReplaySerializer.encode(replay);
		return new Blob([json], { type: 'application/json' });
	}

	/** Create a download URL for a replay file. */
	static toDownloadURL(replay: ReplayFile): string {
		const blob = ReplaySerializer.toBlob(replay);
		return URL.createObjectURL(blob);
	}

	/** Read a replay from a File (e.g., from file input). */
	static async fromFile(file: File): Promise<ReplayFile> {
		const text = await file.text();
		return ReplaySerializer.decode(text);
	}
}
