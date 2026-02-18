<script lang="ts">
	import { onDestroy } from 'svelte';
	import Canvas from '../shared/Canvas.svelte';
	import HUD from '../match/HUD.svelte';
	import Commentary from '../match/Commentary.svelte';
	import { matchState, type WrestlerUIState, type MatchUIState } from '$lib/state/matchStore';
	import { uiState, setScreen } from '$lib/state/uiStore';
	import { SceneManager } from '$lib/rendering/SceneManager';
	import { CameraRig } from '$lib/rendering/CameraRig';
	import { RingRenderer } from '$lib/rendering/RingRenderer';
	import { WrestlerRenderer, type WrestlerBuild } from '$lib/rendering/WrestlerRenderer';
	import { MatchLoop, type WrestlerInput, type AgentPersonality } from '$lib/match/engine';
	import { MatchDirector, type CinematicCue } from '$lib/match/director';
	import { EffectsRenderer } from '$lib/rendering/EffectsRenderer';
	import { ArenaRenderer } from '$lib/rendering/ArenaRenderer';
	import { RefereeRenderer } from '$lib/rendering/RefereeRenderer';
	import { lerp } from '$lib/utils/math';
	import type { Vec3 } from '$lib/utils/types';
	import rosterData from '$lib/data/wrestlers/roster.json';
	import type { WrestlerDef } from '$lib/data/wrestlers/schema';
	import { get } from 'svelte/store';

	const roster = rosterData as WrestlerDef[];

	// Read config from uiStore (no query params)
	const config = get(uiState).matchConfig;
	const wrestler1Id = config.wrestler1Id ?? 'iron_mike';
	const wrestler2Id = config.wrestler2Id ?? 'phoenix_blade';
	const seed = config.seed;

	let state = $state<MatchUIState>({
		phase: 'pre',
		matchType: 'singles',
		elapsed: 0,
		wrestlers: [],
		recentEvents: [],
		winner: null,
		winMethod: null,
		matchRating: 0
	});

	let sceneManager: SceneManager | null = null;
	let cameraRig: CameraRig | null = null;
	let ringRenderer: RingRenderer | null = null;
	let wrestlerRenderer: WrestlerRenderer | null = null;
	let effectsRenderer: EffectsRenderer | null = null;
	let arenaRenderer: ArenaRenderer | null = null;
	let refereeRenderer: RefereeRenderer | null = null;
	let matchLoop: MatchLoop | null = null;
	let director: MatchDirector | null = null;
	let rafId: number | null = null;
	let lastTimestamp = 0;
	let accumulator = 0;
	const TICK_MS = 1000 / 60;

	// Atmosphere lerp targets for smooth transitions
	let atmosphereTarget = { exposure: 1.2, spotlightIntensity: 1.0, titantronIntensity: 0.4, fogDensity: 0.015 };
	let atmosphereCurrent = { ...atmosphereTarget };
	let atmosphereTransitionSpeed = 0;

	// ─── Personality mapping from roster data ────────────────────────
	const PERSONALITY_MAP: Record<string, AgentPersonality> = {
		powerhouse:   { strikePreference: 0.3, aggression: 0.7, riskTolerance: 0.2, reversalSkill: 0.3 },
		highflyer:    { strikePreference: 0.6, aggression: 0.6, riskTolerance: 0.9, reversalSkill: 0.5 },
		technician:   { strikePreference: 0.4, aggression: 0.3, riskTolerance: 0.3, reversalSkill: 0.9 },
		brawler:      { strikePreference: 0.8, aggression: 0.9, riskTolerance: 0.5, reversalSkill: 0.2 },
		psychologist: { strikePreference: 0.5, aggression: 0.4, riskTolerance: 0.4, reversalSkill: 0.7 },
		balanced:     { strikePreference: 0.5, aggression: 0.5, riskTolerance: 0.6, reversalSkill: 0.5 }
	};

	function lookupWrestler(id: string): WrestlerDef {
		return roster.find((w) => w.id === id) ?? roster[0];
	}

	function mapBuild(build: string): WrestlerBuild {
		if (build === 'super_heavy') return 'heavy';
		if (build === 'light' || build === 'medium' || build === 'heavy') return build;
		return 'medium';
	}

	function cleanupMatch() {
		if (rafId !== null) cancelAnimationFrame(rafId);
		rafId = null;
		refereeRenderer?.dispose();
		effectsRenderer?.dispose();
		director?.dispose();
		wrestlerRenderer?.dispose();
		arenaRenderer?.dispose();
		ringRenderer?.dispose();
		sceneManager?.dispose();
		matchLoop = null;
	}

	function onCanvasReady(canvas: HTMLCanvasElement) {
		// 1. THREE.js Scene + Camera
		sceneManager = new SceneManager(canvas);
		cameraRig = new CameraRig();
		cameraRig.setPreset('hard_cam');

		// 2. Ring
		ringRenderer = new RingRenderer(sceneManager.scene);

		// 3. Arena
		arenaRenderer = new ArenaRenderer(sceneManager.scene);

		// 4. Wrestler meshes
		wrestlerRenderer = new WrestlerRenderer(sceneManager.scene);

		// 5. Create match engine
		const w1Def = lookupWrestler(wrestler1Id);
		const w2Def = lookupWrestler(wrestler2Id);

		const w1Input: WrestlerInput = {
			id: w1Def.id,
			name: w1Def.name,
			health: w1Def.stats.health,
			stamina: w1Def.stats.stamina,
			personality: PERSONALITY_MAP[w1Def.personalityId] ?? PERSONALITY_MAP.balanced,
			psychArchetype: w1Def.personalityId ?? 'balanced',
			color: w1Def.appearance.primaryColor,
			height: w1Def.appearance.height,
			build: mapBuild(w1Def.appearance.build)
		};

		const w2Input: WrestlerInput = {
			id: w2Def.id,
			name: w2Def.name,
			health: w2Def.stats.health,
			stamina: w2Def.stats.stamina,
			personality: PERSONALITY_MAP[w2Def.personalityId] ?? PERSONALITY_MAP.balanced,
			psychArchetype: w2Def.personalityId ?? 'balanced',
			color: w2Def.appearance.primaryColor,
			height: w2Def.appearance.height,
			build: mapBuild(w2Def.appearance.build)
		};

		matchLoop = new MatchLoop({
			seed,
			timeLimit: 60,
			tickRate: 60,
			wrestler1: w1Input,
			wrestler2: w2Input
		});

		// 6. Effects renderer
		effectsRenderer = new EffectsRenderer(sceneManager.scene);

		// 7. Match Director
		director = new MatchDirector({ seed });

		// 8. Create wrestler meshes
		wrestlerRenderer.createWrestler(0, {
			color: w1Def.appearance.primaryColor,
			height: w1Def.appearance.height,
			build: mapBuild(w1Def.appearance.build)
		});
		wrestlerRenderer.createWrestler(1, {
			color: w2Def.appearance.primaryColor,
			height: w2Def.appearance.height,
			build: mapBuild(w2Def.appearance.build)
		});

		const ringHeight = 1.2;
		wrestlerRenderer.updateTransform(0, [-2, ringHeight, 0], [0, 0, 0, 1]);
		wrestlerRenderer.updateTransform(1, [2, ringHeight, 0], [0, 1, 0, 0]);

		// 9. Referee
		refereeRenderer = new RefereeRenderer(sceneManager.scene);
		refereeRenderer.updatePosition([[-2, ringHeight, 0], [2, ringHeight, 0]]);

		// 10. Initial render
		sceneManager.render(cameraRig.camera);

		lastTimestamp = performance.now();
		rafId = requestAnimationFrame(frame);
	}

	function frame(timestamp: number) {
		if (!matchLoop || !sceneManager || !cameraRig || !wrestlerRenderer) return;

		const rawDelta = Math.min(timestamp - lastTimestamp, 200);
		lastTimestamp = timestamp;

		const dilation = director?.timeDilation ?? 1.0;
		accumulator += rawDelta * dilation;

		let ticksThisFrame = 0;
		while (accumulator >= TICK_MS && ticksThisFrame < 4) {
			matchLoop.step();
			if (director) {
				const cues = director.update(matchLoop.state);
				applyCues(cues);
			}
			accumulator -= TICK_MS;
			ticksThisFrame++;
		}

		// Process hit impact events for VFX
		if (matchLoop) {
			const hitEvents = matchLoop.drainHitEvents();
			for (const hit of hitEvents) {
				if (effectsRenderer) {
					const impactPos: Vec3 = [hit.positionX, 1.8, 0];
					if (hit.critical) {
						effectsRenderer.spawnEffect('impact', impactPos, 1.0);
						effectsRenderer.spawnEffect('sparks', impactPos, 0.8);
					} else if (hit.reversed) {
						effectsRenderer.spawnEffect('sparks', impactPos, 0.6);
					} else if (!hit.blocked) {
						effectsRenderer.spawnEffect('impact', impactPos, hit.intensity);
					}
				}
				// Camera shake on big hits
				if (cameraRig && !hit.blocked) {
					const shakeIntensity = hit.critical ? 0.08 : hit.intensity * 0.04;
					cameraRig.shake(shakeIntensity);
				}
			}
		}

		updateAtmosphere();
		if (effectsRenderer) effectsRenderer.update(rawDelta / 1000 * dilation);

		syncMatchToUI();
		syncMatchToScene();

		const dtSeconds = rawDelta / 1000;
		wrestlerRenderer.update(dtSeconds);
		if (refereeRenderer) refereeRenderer.update(dtSeconds);

		cameraRig.update(1 / 60);
		sceneManager.render(cameraRig.camera);

		if (matchLoop.state.running) {
			rafId = requestAnimationFrame(frame);
		} else {
			if (director) {
				const cues = director.update(matchLoop.state);
				applyCues(cues);
			}
			syncMatchToUI();
		}
	}

	function applyCues(cues: CinematicCue[]) {
		for (const cue of cues) {
			switch (cue.type) {
				case 'camera':
					if (cameraRig) {
						cameraRig.setPreset(cue.preset, cue.target);
						cameraRig.setTransitionSpeed(cue.transitionSpeed);
					}
					break;
				case 'atmosphere':
					if (cue.exposure !== undefined) atmosphereTarget.exposure = cue.exposure;
					if (cue.spotlightIntensity !== undefined) atmosphereTarget.spotlightIntensity = cue.spotlightIntensity;
					if (cue.titantronIntensity !== undefined) atmosphereTarget.titantronIntensity = cue.titantronIntensity;
					if (cue.fogDensity !== undefined) atmosphereTarget.fogDensity = cue.fogDensity;
					atmosphereTransitionSpeed = cue.transitionTicks > 0 ? 1 / cue.transitionTicks : 1;
					break;
				case 'vfx':
					if (effectsRenderer) effectsRenderer.spawnEffect(cue.effect, cue.position, cue.intensity);
					break;
				case 'slow_motion':
					break;
				case 'replay_start':
					if (director && cue.startTick !== undefined && cue.endTick !== undefined) {
						director.replayManager.startReplay(cue.startTick, cue.endTick, cue.replayPreset, cue.playbackSpeed);
					}
					break;
				case 'replay_end':
					break;
			}
		}
	}

	function updateAtmosphere() {
		if (!sceneManager) return;
		const speed = Math.max(0.01, atmosphereTransitionSpeed);
		atmosphereCurrent.exposure = lerp(atmosphereCurrent.exposure, atmosphereTarget.exposure, speed);
		sceneManager.renderer.toneMappingExposure = atmosphereCurrent.exposure;
	}

	function syncMatchToUI() {
		if (!matchLoop) return;
		const ms = matchLoop.state;
		const wrestlers: WrestlerUIState[] = ms.agents.map((a, i) => ({
			entityId: i,
			name: a.name,
			health: a.health,
			healthMax: a.maxHealth,
			stamina: a.stamina,
			staminaMax: a.maxStamina,
			momentum: a.momentum,
			currentMove: a.activeMove,
			combatPhase: a.phase,
			alignment: 'face',
			eliminated: a.health <= 0,
			emotion: a.psych.emotion,
			confidence: a.psych.confidence
		}));

		const recentEvents = ms.log.slice(-8).map((l) => ({
			frame: l.tick,
			type: l.type,
			detail: l.detail
		}));

		state = {
			phase: ms.running ? 'live' : 'post',
			matchType: 'singles',
			elapsed: ms.elapsed,
			wrestlers,
			recentEvents,
			winner: ms.result ? ms.agents.findIndex((a) => a.id === ms.result!.winnerId) : null,
			winMethod: ms.result?.method ?? null,
			matchRating: ms.result?.rating ?? 0
		};

		matchState.set(state);
	}

	function syncMatchToScene() {
		if (!matchLoop || !wrestlerRenderer) return;

		const ringHeight = 1.2;
		const ms = matchLoop.state;
		const wrestlerPositions: Vec3[] = [];

		for (let i = 0; i < ms.agents.length; i++) {
			const agent = ms.agents[i];
			const y = (agent.phase === 'knockdown' || agent.phase === 'getting_up')
				? ringHeight + 0.1
				: ringHeight;

			const facingSign = matchLoop.getFacingSign(agent.id);
			const qy = facingSign > 0 ? 0 : 1;
			const qw = facingSign > 0 ? 1 : 0;

			const pos: Vec3 = [agent.positionX, y, 0];
			wrestlerPositions.push(pos);
			wrestlerRenderer.updateTransform(i, pos, [0, qy, 0, qw]);

			let pose: string;
			switch (agent.phase) {
				case 'windup':
				case 'active':
					pose = 'attacking';
					break;
				case 'stun':
					pose = 'stunned';
					break;
				case 'knockdown':
				case 'getting_up':
					pose = 'grounded';
					break;
				case 'recovery':
					pose = 'recovery';
					break;
				case 'blocking':
					pose = 'blocking';
					break;
				case 'taunting':
					pose = 'stance';
					break;
				default:
					pose = 'stance';
			}
			wrestlerRenderer.setAnimation(i, pose);
		}

		if (refereeRenderer) {
			refereeRenderer.updatePosition(wrestlerPositions);
			const anyKnockdown = ms.agents.some((a) => a.phase === 'knockdown' || a.phase === 'getting_up');
			const matchEnded = !ms.running;
			if (matchEnded) {
				refereeRenderer.setPose('signaling');
			} else if (anyKnockdown) {
				refereeRenderer.setPose('counting');
			} else {
				refereeRenderer.setPose('standing');
			}
		}
	}

	function onCanvasResize(width: number, height: number) {
		if (sceneManager) sceneManager.resize(width, height);
		if (cameraRig && width > 0 && height > 0) cameraRig.setAspect(width / height);
	}

	function exitMatch() {
		cleanupMatch();
		setScreen('menu');
	}

	function rematch() {
		cleanupMatch();
		setScreen('setup');
	}

	onDestroy(() => {
		cleanupMatch();
	});
</script>

<div class="match-view screen-enter">
	<div class="canvas-container">
		<Canvas onReady={onCanvasReady} onResize={onCanvasResize} />
	</div>

	<div class="overlay">
		<HUD wrestlers={state.wrestlers} matchTime={state.elapsed} />
	</div>

	<div class="commentary-panel">
		<Commentary events={state.recentEvents} />
	</div>

	<div class="controls">
		<button class="exit-btn glass-btn" onclick={exitMatch}>EXIT</button>
	</div>

	{#if state.phase === 'post' && state.winMethod}
		<div class="match-result">
			<div class="result-card glass-strong">
				<h2 class="result-title font-display">MATCH OVER</h2>
				<p class="winner-name font-display">
					{state.wrestlers[state.winner ?? 0]?.name ?? 'Unknown'}
				</p>
				<p class="win-method font-display">WINS BY {state.winMethod?.toUpperCase()}</p>
				<p class="match-rating">
					{'★'.repeat(Math.floor(state.matchRating))}{'☆'.repeat(5 - Math.floor(state.matchRating))}
					<span class="rating-value font-mono">{state.matchRating.toFixed(1)}</span>
				</p>
				<p class="match-duration font-mono">
					Duration: {Math.floor(state.elapsed)}s
				</p>
				<div class="result-actions">
					<button class="glass-btn glass-btn-primary" onclick={rematch}>
						NEW MATCH
					</button>
					<button class="glass-btn" onclick={exitMatch}>
						MAIN MENU
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.match-view {
		position: relative;
		width: 100vw;
		height: 100vh;
		background: #000;
	}

	.canvas-container {
		width: 100%;
		height: 100%;
	}

	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		padding: 1rem;
	}

	.commentary-panel {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		padding: 1rem;
	}

	.controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 10;
	}

	.exit-btn {
		font-family: var(--font-display);
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		padding: 0.5rem 1rem;
	}

	/* ─── Match Result ───────────────────────────── */
	.match-result {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.75);
		z-index: 20;
		animation: fade-in 0.5s var(--ease-out-expo);
	}

	.result-card {
		text-align: center;
		padding: 2.5rem 4rem;
		border-radius: var(--radius-xl);
		animation: scale-in 0.5s var(--ease-out-back);
	}

	.result-title {
		font-size: 1.5rem;
		color: var(--text-secondary);
		margin: 0 0 0.5rem;
		letter-spacing: 0.15em;
	}

	.winner-name {
		font-size: 3rem;
		color: var(--accent);
		text-shadow: 0 0 30px var(--accent-glow);
		margin: 0;
		letter-spacing: 0.04em;
	}

	.win-method {
		font-size: 1.2rem;
		color: var(--text-secondary);
		margin: 0.25rem 0 1rem;
		letter-spacing: 0.1em;
	}

	.match-rating {
		font-size: 1.5rem;
		color: var(--gold);
		text-shadow: 0 0 15px var(--gold-glow);
		margin: 0.5rem 0;
	}

	.rating-value {
		font-size: 0.9rem;
		color: var(--text-secondary);
		margin-left: 0.5rem;
	}

	.match-duration {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0.25rem 0 1.5rem;
	}

	.result-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}

	.result-actions .glass-btn {
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.08em;
		padding: 0.75rem 2rem;
	}
</style>
