import type { ActionResult } from '../Strategy';
import { ACTION_COUNT, idToAction } from './ActionSpace';

/**
 * Connection state for the training bridge.
 */
export enum BridgeState {
	DISCONNECTED = 'DISCONNECTED',
	CONNECTING = 'CONNECTING',
	CONNECTED = 'CONNECTED',
	ERROR = 'ERROR'
}

/**
 * Message types for the WebSocket protocol between the sim and the Python trainer.
 */
export interface TrainingMessage {
	type: 'observation' | 'action' | 'reward' | 'reset' | 'done' | 'config';
	payload: unknown;
}

/**
 * WebSocket bridge to an external Python RL trainer.
 *
 * Protocol:
 * 1. Sim sends observation vector on each AI tick.
 * 2. Trainer responds with action ID (integer).
 * 3. After action execution, sim sends reward.
 * 4. On match end, sim sends terminal signal.
 *
 * When no trainer is connected, the bridge falls back to
 * random action selection (for self-play / baseline).
 */
export class TrainingBridge {
	private ws: WebSocket | null = null;
	private state: BridgeState = BridgeState.DISCONNECTED;
	private url: string = '';
	private pendingResolve: ((action: ActionResult) => void) | null = null;
	private reconnectAttempts: number = 0;
	private readonly maxReconnectAttempts: number = 5;
	private readonly reconnectDelayMs: number = 2000;
	/** Whether to use random actions as fallback when disconnected. */
	private localFallback: boolean = true;
	/** Episode counter for training bookkeeping. */
	private episodeCount: number = 0;
	/** Step counter within current episode. */
	private stepCount: number = 0;

	/**
	 * Get current connection state.
	 */
	getState(): BridgeState {
		return this.state;
	}

	/**
	 * Get the current episode count.
	 */
	getEpisodeCount(): number {
		return this.episodeCount;
	}

	/**
	 * Enable or disable local random fallback mode.
	 */
	setLocalFallback(enabled: boolean): void {
		this.localFallback = enabled;
	}

	/**
	 * Connect to the external Python trainer via WebSocket.
	 *
	 * @param url - WebSocket URL (e.g., 'ws://localhost:8765').
	 * @returns Promise that resolves when connected, rejects on failure.
	 */
	connect(url: string): Promise<void> {
		this.url = url;
		this.state = BridgeState.CONNECTING;

		return new Promise<void>((resolve, reject) => {
			try {
				this.ws = new WebSocket(url);

				this.ws.onopen = () => {
					this.state = BridgeState.CONNECTED;
					this.reconnectAttempts = 0;
					resolve();
				};

				this.ws.onmessage = (event: MessageEvent) => {
					this.handleMessage(event.data as string);
				};

				this.ws.onerror = () => {
					this.state = BridgeState.ERROR;
					reject(new Error(`WebSocket connection error to ${url}`));
				};

				this.ws.onclose = () => {
					this.state = BridgeState.DISCONNECTED;
					this.attemptReconnect();
				};
			} catch (err) {
				this.state = BridgeState.ERROR;
				reject(err);
			}
		});
	}

	/**
	 * Send an observation vector to the trainer and wait for an action response.
	 *
	 * @param observation - Normalized float array from ObservationSpace.build().
	 * @returns Promise resolving to the trainer's chosen ActionResult.
	 */
	sendObservation(observation: number[]): Promise<ActionResult> {
		this.stepCount++;

		if (this.state !== BridgeState.CONNECTED || !this.ws) {
			// Fallback: return a random action
			if (this.localFallback) {
				return Promise.resolve(this.randomAction());
			}
			return Promise.reject(new Error('TrainingBridge not connected and fallback disabled'));
		}

		return new Promise<ActionResult>((resolve) => {
			this.pendingResolve = resolve;

			const message: TrainingMessage = {
				type: 'observation',
				payload: {
					vector: observation,
					episode: this.episodeCount,
					step: this.stepCount
				}
			};

			this.ws!.send(JSON.stringify(message));

			// Timeout: if trainer doesn't respond in 5 seconds, fall back
			setTimeout(() => {
				if (this.pendingResolve) {
					this.pendingResolve = null;
					resolve(this.randomAction());
				}
			}, 5000);
		});
	}

	/**
	 * Alias for sendObservation — waits for and returns the trainer's action.
	 */
	async receiveAction(observation: number[]): Promise<ActionResult> {
		return this.sendObservation(observation);
	}

	/**
	 * Send a reward signal to the trainer for the most recent action.
	 *
	 * @param reward - Scalar reward value.
	 * @param done - Whether the episode (match) has ended.
	 */
	sendReward(reward: number, done: boolean = false): void {
		if (this.state !== BridgeState.CONNECTED || !this.ws) return;

		const message: TrainingMessage = {
			type: 'reward',
			payload: {
				reward,
				done,
				episode: this.episodeCount,
				step: this.stepCount
			}
		};

		this.ws.send(JSON.stringify(message));

		if (done) {
			this.episodeCount++;
			this.stepCount = 0;
		}
	}

	/**
	 * Signal the start of a new episode (match) to the trainer.
	 */
	resetEpisode(): void {
		this.stepCount = 0;

		if (this.state !== BridgeState.CONNECTED || !this.ws) return;

		const message: TrainingMessage = {
			type: 'reset',
			payload: { episode: this.episodeCount }
		};

		this.ws.send(JSON.stringify(message));
	}

	/**
	 * Close the WebSocket connection cleanly.
	 */
	close(): void {
		if (this.ws) {
			// Send done signal before closing
			if (this.state === BridgeState.CONNECTED) {
				const message: TrainingMessage = {
					type: 'done',
					payload: { episode: this.episodeCount, totalSteps: this.stepCount }
				};
				this.ws.send(JSON.stringify(message));
			}

			this.ws.onclose = null; // prevent reconnect attempt
			this.ws.close();
			this.ws = null;
		}

		this.state = BridgeState.DISCONNECTED;
		this.pendingResolve = null;
	}

	// ── Private helpers ──

	/**
	 * Handle an incoming message from the trainer.
	 */
	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as TrainingMessage;

			switch (message.type) {
				case 'action': {
					const payload = message.payload as { actionId: number; confidence?: number };
					const actionName = idToAction(payload.actionId);
					const result: ActionResult = {
						action: actionName,
						target: null,
						confidence: payload.confidence ?? 0.5,
						reasoning: `rl_trainer:ep${this.episodeCount}:step${this.stepCount}`
					};

					if (this.pendingResolve) {
						this.pendingResolve(result);
						this.pendingResolve = null;
					}
					break;
				}
				case 'config': {
					// Trainer can send configuration updates (learning rate, etc.)
					// This is a hook for future extensibility
					break;
				}
				default:
					break;
			}
		} catch {
			// Malformed message — ignore
		}
	}

	/**
	 * Generate a random action for local fallback mode.
	 */
	private randomAction(): ActionResult {
		const actionId = Math.floor(Math.random() * ACTION_COUNT);
		return {
			action: idToAction(actionId),
			target: null,
			confidence: 0.1,
			reasoning: 'random_fallback'
		};
	}

	/**
	 * Attempt to reconnect to the trainer after a disconnect.
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
		if (!this.url) return;

		this.reconnectAttempts++;
		setTimeout(() => {
			if (this.state === BridgeState.DISCONNECTED) {
				this.connect(this.url).catch(() => {
					// Reconnect failed — will try again on next disconnect
				});
			}
		}, this.reconnectDelayMs * this.reconnectAttempts);
	}
}
