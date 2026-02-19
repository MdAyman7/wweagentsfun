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
	import type { AnimationCommand } from '$lib/rendering/AnimationCommand';
	import rosterData from '$lib/data/wrestlers/roster.json';
	import type { WrestlerDef } from '$lib/data/wrestlers/schema';
	import { get } from 'svelte/store';

	const roster = rosterData as WrestlerDef[];

	// Read config from uiStore (no query params)
	const config = get(uiState).matchConfig;
	const wrestler1Id = config.wrestler1Id ?? 'iron_mike';
	const wrestler2Id = config.wrestler2Id ?? 'phoenix_blade';
	const seed = config.seed;
	const matchNumber = (seed % 9999) + 1;

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
	/** Post-match cinematic sequence timer (ms). When match ends, counts up to POST_MATCH_DELAY before showing popup. */
	let postMatchTimer = 0;
	let postMatchActive = false;
	const POST_MATCH_DELAY = 4000; // 4 seconds of post-match cinematics before popup
	/** Previous X positions per agent for velocity calculation. */
	let prevPositionX: [number, number] = [0, 0];
	/** Pending knockback per agent (set by hit events, consumed by AnimationCommand). */
	let pendingKnockback: [{ direction: number; intensity: number } | null, { direction: number; intensity: number } | null] = [null, null];

	/**
	 * Visual ring circling angle. When fighters are idle/moving,
	 * they slowly orbit around the ring center, creating natural 2D movement.
	 * This is purely visual — simulation remains 1D on X-axis.
	 */
	let circleAngle = 0;
	let circleAngleTarget = 0;
	/** Fighters sway on Z-axis for more natural positioning */
	let circleSway = 0;

	// Atmosphere lerp targets for smooth transitions
	let atmosphereTarget = { exposure: 1.0, spotlightIntensity: 1.0, titantronIntensity: 0.4, fogDensity: 0.025 };
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
			timeLimit: 9999,
			tickRate: 60,
			wrestler1: w1Input,
			wrestler2: w2Input
		});

		// 6. Effects renderer
		effectsRenderer = new EffectsRenderer(sceneManager.scene);

		// 7. Match Director
		director = new MatchDirector({ seed });

		// 8. Create wrestler bot meshes
		const defs = [w1Def, w2Def];
		for (let i = 0; i < defs.length; i++) {
			const def = defs[i];
			wrestlerRenderer!.createWrestler(i, {
				color: def.appearance.primaryColor,
				secondaryColor: def.appearance.secondaryColor,
				height: def.appearance.height,
				build: mapBuild(def.appearance.build),
				name: def.name,
			});
		}

		const ringHeight = 0.3;
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

		// Process hit impact events for VFX + knockback tilt
		if (matchLoop) {
			const hitEvents = matchLoop.drainHitEvents();
			const ms = matchLoop.state;
			for (const hit of hitEvents) {
				if (effectsRenderer) {
					const impactPos: Vec3 = [hit.positionX, 0.65, 0];
					if (hit.critical) {
						effectsRenderer.spawnEffect('impact', impactPos, 1.2);
						effectsRenderer.spawnEffect('sparks', impactPos, 1.0);
						effectsRenderer.spawnEffect('flash', impactPos, 0.8);
						effectsRenderer.spawnEffect('dust', impactPos, 0.6);
					} else if (hit.reversed) {
						effectsRenderer.spawnEffect('sparks', impactPos, 0.8);
						effectsRenderer.spawnEffect('impact', impactPos, 0.5);
					} else if (hit.blocked) {
						effectsRenderer.spawnEffect('sparks', impactPos, 0.3);
					} else {
						effectsRenderer.spawnEffect('impact', impactPos, hit.intensity);
						effectsRenderer.spawnEffect('dust', impactPos, hit.intensity * 0.4);
					}
					// Blood effect when fighter health is below 30%
					const defenderAgent = ms.agents.find((a) => a.id === hit.defenderId);
					if (defenderAgent && !hit.blocked && defenderAgent.health / defenderAgent.maxHealth < 0.3) {
						effectsRenderer.spawnEffect('blood', impactPos, hit.intensity);
					}
				}
				// Camera shake on big hits — stronger
				if (cameraRig && !hit.blocked) {
					const shakeIntensity = hit.critical ? 0.14 : hit.intensity * 0.07;
					cameraRig.shake(shakeIntensity);
				}
				// Visual knockback tilt on defender
				if (wrestlerRenderer && !hit.blocked) {
					const defenderIdx = ms.agents.findIndex((a) => a.id === hit.defenderId);
					const attackerIdx = ms.agents.findIndex((a) => a.id === hit.attackerId);
					if (defenderIdx >= 0 && attackerIdx >= 0) {
						const knockDir = ms.agents[defenderIdx].positionX > ms.agents[attackerIdx].positionX ? 1 : -1;
						wrestlerRenderer.applyKnockback(defenderIdx, knockDir, hit.intensity);
						// Store knockback for AnimationCommand
						pendingKnockback[defenderIdx as 0 | 1] = { direction: knockDir, intensity: hit.intensity };
					}
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
		} else if (!postMatchActive) {
			// Match just ended — start post-match cinematic sequence
			postMatchActive = true;
			postMatchTimer = 0;

			// Trigger referee winner announcement
			if (refereeRenderer && matchLoop.state.result) {
				const winnerId = matchLoop.state.result.winnerId;
				const winnerAgent = matchLoop.state.agents.find(a => a.id === winnerId);
				const winnerDef = winnerAgent ? lookupWrestler(winnerAgent.id) : null;
				if (winnerAgent && winnerDef) {
					const winnerIdx = matchLoop.state.agents.indexOf(winnerAgent);
					// Use the current visual position of the winner
					const ringHeight = 0.3;
					const pos: Vec3 = [winnerAgent.positionX, ringHeight, 0];
					refereeRenderer.showWinner(winnerDef.name, pos);
					refereeRenderer.setPose('signaling');
				}
			}

			if (director) {
				const cues = director.update(matchLoop.state);
				applyCues(cues);
			}

			// Continue rendering for post-match cinematics
			rafId = requestAnimationFrame(frame);
		} else {
			// In post-match cinematic sequence
			postMatchTimer += rawDelta;
			if (postMatchTimer >= POST_MATCH_DELAY) {
				// Delay is over — show the result popup
				syncMatchToUI();
			} else {
				// Keep rendering the post-match scene (loser on ground, referee announcing)
				rafId = requestAnimationFrame(frame);
			}
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
					// Slow-motion handled via director.timeDilation — add cinematic rumble
					if (cameraRig && cue.factor < 0.3) {
						cameraRig.shake(0.02);
					}
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

		// Lerp all atmosphere values
		atmosphereCurrent.exposure = lerp(atmosphereCurrent.exposure, atmosphereTarget.exposure, speed);
		atmosphereCurrent.spotlightIntensity = lerp(atmosphereCurrent.spotlightIntensity, atmosphereTarget.spotlightIntensity, speed);
		atmosphereCurrent.titantronIntensity = lerp(atmosphereCurrent.titantronIntensity, atmosphereTarget.titantronIntensity, speed);
		atmosphereCurrent.fogDensity = lerp(atmosphereCurrent.fogDensity, atmosphereTarget.fogDensity, speed);

		// Apply to renderer
		sceneManager.renderer.toneMappingExposure = atmosphereCurrent.exposure;

		// Apply to arena lighting
		if (arenaRenderer) {
			arenaRenderer.setSpotlightIntensity(atmosphereCurrent.spotlightIntensity);
			arenaRenderer.setTitantronIntensity(atmosphereCurrent.titantronIntensity);
		}

		// Apply fog density — map density value to linear fog far distance
		// Lower density → farther fog (more visibility); higher density → closer fog
		const fog = sceneManager.scene.fog;
		if (fog && 'far' in fog) {
			(fog as { far: number }).far = 60 / Math.max(atmosphereCurrent.fogDensity * 40, 0.01);
		}
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

		// During post-match cinematic (loser on ground, referee announcing), keep phase as 'live'
		// so the result popup doesn't show yet. Only switch to 'post' after the cinematic delay.
		const phase = ms.running ? 'live' : (postMatchActive && postMatchTimer < POST_MATCH_DELAY ? 'live' : 'post');

		state = {
			phase,
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

		const ringHeight = 0.3;
		const ms = matchLoop.state;
		const wrestlerPositions: Vec3[] = [];

		// ── Visual ring circling ──
		// When both fighters are in neutral (idle/moving), they slowly circle.
		// This maps the 1D simulation distance onto a 2D ring surface.
		const [a0, a1] = ms.agents;
		const bothNeutral =
			(a0.phase === 'idle' || a0.phase === 'moving') &&
			(a1.phase === 'idle' || a1.phase === 'moving');
		if (bothNeutral) {
			// Slowly rotate the circling angle
			circleAngleTarget += 0.008; // ~0.5 rad/sec at 60fps → slow orbit
		}
		// Smooth lerp toward target angle
		circleAngle = lerp(circleAngle, circleAngleTarget, 0.03);
		// Natural Z-axis sway
		circleSway = Math.sin(circleAngle * 1.7) * 0.3;

		// Compute the midpoint and half-distance from simulation
		const midX = (a0.positionX + a1.positionX) * 0.5;
		const halfDist = Math.abs(a0.positionX - a1.positionX) * 0.5;

		for (let i = 0; i < ms.agents.length; i++) {
			const agent = ms.agents[i];
			const otherAgent = ms.agents[1 - i];
			const y = (agent.phase === 'knockdown' || agent.phase === 'getting_up')
				? ringHeight + 0.1
				: ringHeight;

			// Project 1D position onto 2D ring surface using circling angle.
			// Fighter 0 is at angle, fighter 1 is at angle + PI (opposite side).
			const angleOffset = i === 0 ? 0 : Math.PI;
			const theta = circleAngle + angleOffset;
			const ringX = midX + Math.cos(theta) * halfDist;
			const ringZ = Math.sin(theta) * halfDist * 0.6 + circleSway * (i === 0 ? 1 : -1);

			// Compute facing: each wrestler faces the other
			const otherTheta = circleAngle + (i === 0 ? Math.PI : 0);
			const otherX = midX + Math.cos(otherTheta) * halfDist;
			const otherZ = Math.sin(otherTheta) * halfDist * 0.6 + circleSway * (i === 0 ? -1 : 1);
			const facingAngle = Math.atan2(otherX - ringX, otherZ - ringZ);

			// Convert facing angle to quaternion (rotation around Y axis)
			const halfAngle = facingAngle * 0.5;
			const qy = Math.sin(halfAngle);
			const qw = Math.cos(halfAngle);

			const pos: Vec3 = [ringX, y, ringZ];
			wrestlerPositions.push(pos);
			wrestlerRenderer.updateTransform(i, pos, [0, qy, 0, qw]);

			// Compute velocity for walk cycle animation
			const dx = agent.positionX - prevPositionX[i as 0 | 1];
			const velocity = Math.abs(dx) * 60;
			// Add circling velocity component when both neutral
			const circleVelocity = bothNeutral ? 0.3 : 0;
			const normalizedVelocity = Math.min((velocity + circleVelocity) / 3.0, 1.0);
			prevPositionX[i as 0 | 1] = agent.positionX;

			// ── Derive finisher role from agent phase ──
			let finisherRole: 'attacker' | 'defender' | 'none' = 'none';
			if (agent.phase === 'finisher_setup' || agent.phase === 'finisher_impact') {
				finisherRole = 'attacker';
			} else if (agent.phase === 'finisher_locked') {
				finisherRole = 'defender';
			}

			// ── Build AnimationCommand from MatchState ──
			const cmd: AnimationCommand = {
				phase: agent.phase,
				phaseFrames: agent.phaseFrames,
				phaseTotalFrames: agent.phaseTotalFrames,
				moveId: agent.activeMove,
				moveCategory: agent.moveCategory,
				targetRegion: agent.targetRegion,
				comboStep: agent.comboStep ?? -1,
				comboTotalSteps: agent.comboTotalSteps ?? -1,
				velocity: normalizedVelocity,
				comebackActive: agent.comebackActive,
				emotion: agent.psych.emotion,
				knockback: pendingKnockback[i as 0 | 1],
				opponentRelativeX: otherAgent.positionX - agent.positionX,
				finisherRole,
			};

			// Send rich animation command to the renderer
			wrestlerRenderer.setAnimationCommand(i, cmd);

			// Clear consumed knockback
			pendingKnockback[i as 0 | 1] = null;
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
		<HUD wrestlers={state.wrestlers} matchTime={state.elapsed} {matchNumber}
			wrestler1Name={lookupWrestler(wrestler1Id).name}
			wrestler2Name={lookupWrestler(wrestler2Id).name} />
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
