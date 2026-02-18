import { writable } from 'svelte/store';

export type UIScreen = 'menu' | 'setup' | 'match' | 'replay' | 'tournament' | 'league' | 'training';

export interface MatchConfig {
	wrestler1Id: string | null;
	wrestler2Id: string | null;
	matchType: string;
	seed: number;
}

export interface UIState {
	screen: UIScreen;
	showDebugOverlay: boolean;
	showCommentary: boolean;
	showHUD: boolean;
	notification: string | null;
	loading: boolean;
	loadingMessage: string;
	/** Match configuration set by the fighter select screen. */
	matchConfig: MatchConfig;
}

export const uiState = writable<UIState>({
	screen: 'menu',
	showDebugOverlay: false,
	showCommentary: true,
	showHUD: true,
	notification: null,
	loading: false,
	loadingMessage: '',
	matchConfig: {
		wrestler1Id: null,
		wrestler2Id: null,
		matchType: 'singles',
		seed: 42
	}
});

export function showNotification(message: string, durationMs = 3000): void {
	uiState.update((s) => ({ ...s, notification: message }));
	setTimeout(() => {
		uiState.update((s) => ({ ...s, notification: null }));
	}, durationMs);
}

export function setScreen(screen: UIScreen): void {
	uiState.update((s) => ({ ...s, screen }));
}

export function setMatchConfig(config: Partial<MatchConfig>): void {
	uiState.update((s) => ({
		...s,
		matchConfig: { ...s.matchConfig, ...config }
	}));
}

export function setLoading(loading: boolean, message = ''): void {
	uiState.update((s) => ({ ...s, loading, loadingMessage: message }));
}
