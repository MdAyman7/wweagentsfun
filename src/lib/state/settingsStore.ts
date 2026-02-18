import { writable } from 'svelte/store';

export interface Settings {
	simulationSpeed: number;
	debugOverlay: boolean;
	cameraMode: 'auto' | 'free' | 'locked';
	headlessMode: boolean;
	audioEnabled: boolean;
	audioVolume: number;
	showFPS: boolean;
	logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const settings = writable<Settings>({
	simulationSpeed: 1.0,
	debugOverlay: false,
	cameraMode: 'auto',
	headlessMode: false,
	audioEnabled: true,
	audioVolume: 0.7,
	showFPS: false,
	logLevel: 'info'
});
