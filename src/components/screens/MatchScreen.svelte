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
	import { CrowdRenderer } from '$lib/rendering/CrowdRenderer';
	import { SoundEngine } from '$lib/audio/SoundEngine';
	import { Commentator, type CommentaryLine } from '$lib/match/commentary/Commentator';
	import { lerp } from '$lib/utils/math';
	import type { Vec3 } from '$lib/utils/types';
	import type { AnimationCommand } from '$lib/rendering/AnimationCommand';
	import rosterData from '$lib/data/wrestlers/roster.json';
	import type { WrestlerDef } from '$lib/data/wrestlers/schema';
	import { get } from 'svelte/store';

	const roster = rosterData as WrestlerDef[];

	// Read config from uiStore (no query params)
	const config = get(uiState).matchConfig;
	const wrestler1Id = config.wrestler1Id ?? 'roman_reigns';
	const wrestler2Id = config.wrestler2Id ?? 'cody_rhodes';
	const seed = config.seed;
	const matchNumber = (seed % 9999) + 1;

	/**
	 * The single reactive view object. Mirrors the imperative ceremony loop
	 * state (ceremonyPhase/phaseTimer/etc) so the overlay markup actually
	 * re-renders — this component can only hold ONE $state rune (svelte-check
	 * bug with multiple), so everything the template needs lives here.
	 */
	interface ViewState extends MatchUIState {
		ceremonyPhase: CeremonyPhase;
		phaseTimer: number;
		introWrestlerIdx: number;
		countdownNumber: number;
		cameraView: CameraView;
		showGuide: boolean;
	}

	let state = $state<ViewState>({
		phase: 'pre',
		matchType: 'singles',
		elapsed: 0,
		wrestlers: [],
		recentEvents: [],
		commentaryLines: [],
		muted: false,
		winner: null,
		winMethod: null,
		matchRating: 0,
		ceremonyPhase: 'intro_p1',
		phaseTimer: 0,
		introWrestlerIdx: 0,
		countdownNumber: 3,
		cameraView: 'auto',
		showGuide: false
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
	let crowdRenderer: CrowdRenderer | null = null;
	let soundEngine: SoundEngine | null = null;
	let commentator: Commentator | null = null;
	let rafId: number | null = null;

	/**
	 * Commentary line buffer. Held as a plain array (not $state) — the codebase
	 * has a svelte-check bug with multiple $state runes, so it is surfaced to the
	 * UI via the single `state` object during syncMatchToUI.
	 */
	let commentaryBuffer: CommentaryLine[] = [];
	/** Cursor into matchLoop.state.log — entries before this have been narrated. */
	let lastLogLen = 0;
	/** Short-lived crowd excitement boost from recent dramatic beats (decays). */
	let energyBump = 0;
	/** Audio mute toggle (mirrored into `state.muted` for reactive UI). */
	let muted = false;
	let lastTimestamp = 0;
	let accumulator = 0;
	const TICK_MS = 1000 / 60;
	/** Previous X positions per agent for velocity calculation. */
	let prevPositionX: [number, number] = [0, 0];
	/** Pending knockback per agent (set by hit events, consumed by AnimationCommand). */
	let pendingKnockback: [{ direction: number; intensity: number } | null, { direction: number; intensity: number } | null] = [null, null];

	/**
	 * Active viewing angle. 'auto' = director cuts, 'hard' = broadcast side cam,
	 * 'drone' = overhead ref-drone follow, 'free' = user orbit. Mirrored into
	 * the reactive `state` each frame for the on-screen switcher.
	 */
	type CameraView = 'auto' | 'hard' | 'drone' | 'free';
	let cameraView: CameraView = 'auto';
	/** Derived helper: is the user freely orbiting? */
	function isFreeCam(): boolean { return cameraView === 'free'; }
	/** Whether the camera help tooltip is visible */
	let showGuide = false;

	/**
	 * Visual ring circling angle.
	 */
	let circleAngle = 0;
	let circleAngleTarget = 0;
	let circleSway = 0;

	// Atmosphere lerp targets for smooth transitions
	let atmosphereTarget = { exposure: 1.0, spotlightIntensity: 1.0, titantronIntensity: 0.4, fogDensity: 0.025 };
	let atmosphereCurrent = { ...atmosphereTarget };
	let atmosphereTransitionSpeed = 0;

	// ─── Ceremony Phase System ──────────────────────────────────────
	type CeremonyPhase = 'intro_p1' | 'intro_p2' | 'countdown' | 'fight' | 'post_celebration' | 'post_result';

	let ceremonyPhase: CeremonyPhase = 'intro_p1';
	let phaseTimer = 0;

	const INTRO_DURATION = 5000;     // per-wrestler intro
	const COUNTDOWN_DURATION = 4000; // 3-2-1-FIGHT
	const POST_CELEBRATION_DELAY = 8000; // 8 seconds of post-match celebration
	/** Camera focus height for intros — chest level, not the mat (ringHeight). */
	const INTRO_FOCUS_Y = 0.95;

	/** Countdown number to display (3, 2, 1, 0=FIGHT) */
	let countdownNumber = 3;
	/** Which wrestler intro is currently showing (0 or 1) */
	let introWrestlerIdx = 0;
	/** Winner celebration pose cycling timer */
	let celebrationPoseTimer = 0;
	let celebrationPoseIndex = 0;
	const CELEBRATION_POSES = ['taunting', 'stance', 'taunting', 'moving'] as const;

	// Wrestler data for intro cards
	const w1Def = lookupWrestler(wrestler1Id);
	const w2Def = lookupWrestler(wrestler2Id);
	const introDefs = [w1Def, w2Def];

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

	const CAMERA_VIEWS: CameraView[] = ['auto', 'hard', 'drone', 'free'];

	function setCameraView(view: CameraView) {
		cameraView = view;
		state.cameraView = view; // immediate UI feedback
		if (!cameraRig) return;
		cameraRig.setMode(view === 'free' ? 'free' : 'auto');
		// 'hard' is a fixed broadcast angle; lock it now. 'drone'/'auto' update per frame.
		if (view === 'hard') {
			cameraRig.setPreset('hard_cam');
			cameraRig.setTransitionSpeed(3.0);
		}
	}

	function cycleCameraView() {
		const i = CAMERA_VIEWS.indexOf(cameraView);
		setCameraView(CAMERA_VIEWS[(i + 1) % CAMERA_VIEWS.length]);
	}

	function toggleGuide() {
		showGuide = !showGuide;
	}

	function onKeyDown(event: KeyboardEvent) {
		soundEngine?.resume(); // unlock audio on first user gesture if still suspended
		if (event.key === 'c' || event.key === 'C') {
			cycleCameraView();
		}
		if (event.key === 'm' || event.key === 'M') {
			toggleMute();
		}
	}

	function cleanupMatch() {
		window.removeEventListener('keydown', onKeyDown);
		if (rafId !== null) cancelAnimationFrame(rafId);
		rafId = null;
		cameraRig?.dispose();
		refereeRenderer?.dispose();
		effectsRenderer?.dispose();
		director?.dispose();
		crowdRenderer?.dispose();
		soundEngine?.dispose();
		wrestlerRenderer?.dispose();
		arenaRenderer?.dispose();
		ringRenderer?.dispose();
		sceneManager?.dispose();
		matchLoop = null;
		crowdRenderer = null;
		soundEngine = null;
		commentator = null;
	}

	function onCanvasReady(canvas: HTMLCanvasElement) {
		// 1. THREE.js Scene + Camera
		sceneManager = new SceneManager(canvas);
		cameraRig = new CameraRig();
		cameraRig.initControls(canvas);
		// Start with auto camera for intro cinematics
		cameraRig.setMode('auto');
		cameraView = 'auto';

		// 2. Ring
		ringRenderer = new RingRenderer(sceneManager.scene);

		// 3. Arena
		arenaRenderer = new ArenaRenderer(sceneManager.scene);

		// 3b. Crowd (instanced spectator tiers)
		crowdRenderer = new CrowdRenderer(sceneManager.scene);

		// 4. Wrestler meshes
		wrestlerRenderer = new WrestlerRenderer(sceneManager.scene);

		// 5. Create match engine (but don't step it yet — wait for countdown to finish)
		const w1Input: WrestlerInput = {
			id: w1Def.id,
			name: w1Def.name,
			health: w1Def.stats.health,
			stamina: w1Def.stats.stamina,
			personality: PERSONALITY_MAP[w1Def.personalityId] ?? PERSONALITY_MAP.balanced,
			psychArchetype: w1Def.personalityId ?? 'balanced',
			movesetId: w1Def.movesetId,
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
			movesetId: w2Def.movesetId,
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

		// 7b. Audio + commentary
		soundEngine = new SoundEngine();
		soundEngine.setMuted(muted);
		soundEngine.resume();
		commentator = new Commentator(seed);
		commentaryBuffer = [];
		lastLogLen = 0;
		energyBump = 0;

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

		// Position wrestlers in their corners for intro
		const ringHeight = 0.3;
		wrestlerRenderer.updateTransform(0, [-2, ringHeight, 0], [0, 0, 0, 1]);
		wrestlerRenderer.updateTransform(1, [2, ringHeight, 0], [0, 1, 0, 0]);

		// 9. Referee
		refereeRenderer = new RefereeRenderer(sceneManager.scene);
		refereeRenderer.updatePosition([[-2, ringHeight, 0], [2, ringHeight, 0]]);

		// 10. Start intro phase — camera focuses on wrestler 1
		ceremonyPhase = 'intro_p1';
		introWrestlerIdx = 0;
		phaseTimer = 0;
		// Frame the wrestler's upper body, not the feet (ringHeight is the mat level).
		cameraRig.setPreset('closeup', [-2, INTRO_FOCUS_Y, 0]);
		cameraRig.setTransitionSpeed(2.0);

		// 11. Initial render
		sceneManager.render(cameraRig.camera);

		lastTimestamp = performance.now();
		rafId = requestAnimationFrame(frame);

		window.addEventListener('keydown', onKeyDown);
	}

	// ─── Main Frame Loop ────────────────────────────────────────────

	/** Copy imperative ceremony state into the reactive view so overlays update. */
	function mirrorCeremony() {
		state.ceremonyPhase = ceremonyPhase;
		state.phaseTimer = phaseTimer;
		state.introWrestlerIdx = introWrestlerIdx;
		state.countdownNumber = countdownNumber;
		state.cameraView = cameraView;
		state.showGuide = showGuide;
	}

	function frame(timestamp: number) {
		if (!sceneManager || !cameraRig || !wrestlerRenderer) return;

		const rawDelta = Math.min(timestamp - lastTimestamp, 200);
		lastTimestamp = timestamp;
		phaseTimer += rawDelta;

		const dtSeconds = rawDelta / 1000;

		switch (ceremonyPhase) {
			case 'intro_p1':
			case 'intro_p2':
				frameIntro(dtSeconds);
				break;
			case 'countdown':
				frameCountdown(dtSeconds);
				break;
			case 'fight':
				frameFight(rawDelta);
				break;
			case 'post_celebration':
				framePostCelebration(rawDelta, dtSeconds);
				break;
			case 'post_result':
				// Stop the animation loop — result popup is showing
				mirrorCeremony();
				syncMatchToUI();
				return;
		}

		// Common render path (all phases except post_result)
		mirrorCeremony();
		updateAmbience(dtSeconds);
		wrestlerRenderer!.update(dtSeconds);
		if (refereeRenderer) refereeRenderer.update(dtSeconds);
		cameraRig!.update(1 / 60);
		sceneManager!.render(cameraRig!.camera);
		rafId = requestAnimationFrame(frame);
	}

	// ─── Intro Phase Logic ──────────────────────────────────────────

	function frameIntro(dt: number) {
		if (!wrestlerRenderer || !cameraRig) return;
		const ringHeight = 0.3;
		const idx = ceremonyPhase === 'intro_p1' ? 0 : 1;
		introWrestlerIdx = idx;

		// Featured wrestler does a taunt, the other stands idle
		wrestlerRenderer.setAnimation(idx, 'taunting');
		wrestlerRenderer.setAnimation(1 - idx, 'stance');

		// Camera slowly orbits the featured wrestler
		const focusX = idx === 0 ? -2 : 2;
		const orbitAngle = (phaseTimer / INTRO_DURATION) * Math.PI * 0.4 - Math.PI * 0.2;
		const camDist = 2.0;
		const camX = focusX + Math.sin(orbitAngle) * camDist;
		const camZ = Math.cos(orbitAngle) * camDist;
		cameraRig.setPreset('closeup', [focusX, INTRO_FOCUS_Y, 0]);

		// Transition to next phase
		if (phaseTimer >= INTRO_DURATION) {
			phaseTimer = 0;
			if (ceremonyPhase === 'intro_p1') {
				ceremonyPhase = 'intro_p2';
				introWrestlerIdx = 1;
				cameraRig.setPreset('closeup', [2, INTRO_FOCUS_Y, 0]);
				cameraRig.setTransitionSpeed(3.0);
			} else {
				// Move to countdown
				ceremonyPhase = 'countdown';
				countdownNumber = 3;
				cameraRig.setPreset('hard_cam');
				cameraRig.setTransitionSpeed(4.0);
			}
		}
	}

	// ─── Countdown Phase Logic ──────────────────────────────────────

	function frameCountdown(dt: number) {
		if (!wrestlerRenderer) return;

		// Both wrestlers in ready stance
		wrestlerRenderer.setAnimation(0, 'stance');
		wrestlerRenderer.setAnimation(1, 'stance');

		// Update countdown number: 3...2...1...FIGHT!
		const elapsed = phaseTimer;
		if (elapsed < 1000) countdownNumber = 3;
		else if (elapsed < 2000) countdownNumber = 2;
		else if (elapsed < 3000) countdownNumber = 1;
		else countdownNumber = 0; // FIGHT!

		// Camera shake on each countdown beat
		if (cameraRig) {
			const beat1 = elapsed >= 1000 && elapsed < 1050;
			const beat2 = elapsed >= 2000 && elapsed < 2050;
			const beat3 = elapsed >= 3000 && elapsed < 3050;
			if (beat1 || beat2 || beat3) cameraRig.shake(0.03);
		}

		// Transition to fight
		if (phaseTimer >= COUNTDOWN_DURATION) {
			phaseTimer = 0;
			ceremonyPhase = 'fight';
			// Hand the fight to the director's dynamic cuts (WWE-style broadcast).
			setCameraView('auto');

			// Ring the bell — the crowd erupts.
			soundEngine?.resume();
			soundEngine?.bell(3);
			soundEngine?.crowdPop(1.2);
			crowdRenderer?.popReaction(1.2);
			energyBump = Math.min(1, energyBump + 0.7);

			// Set match state to live
			state = { ...state, phase: 'live' };
			matchState.set(state);
		}
	}

	// ─── Fight Phase Logic (existing match simulation) ──────────────

	function frameFight(rawDelta: number) {
		if (!matchLoop || !cameraRig || !wrestlerRenderer) return;

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
		processHitEvents();

		// Narrate new log events (commentary + crowd/audio reactions)
		narrateNewEvents();

		updateAtmosphere();
		if (effectsRenderer) effectsRenderer.update(rawDelta / 1000 * dilation);

		syncMatchToUI();
		syncMatchToScene();

		// Check if match ended → transition to post celebration
		if (!matchLoop.state.running) {
			ceremonyPhase = 'post_celebration';
			phaseTimer = 0;
			celebrationPoseTimer = 0;
			celebrationPoseIndex = 0;

			// Final bell + crowd eruption.
			soundEngine?.bell(3);
			soundEngine?.crowdPop(1.4);
			crowdRenderer?.popReaction(1.5);
			energyBump = 1;

			// Trigger referee winner announcement
			if (refereeRenderer && matchLoop.state.result) {
				const winnerId = matchLoop.state.result.winnerId;
				const winnerAgent = matchLoop.state.agents.find(a => a.id === winnerId);
				const winnerDef = winnerAgent ? lookupWrestler(winnerAgent.id) : null;
				if (winnerAgent && winnerDef) {
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

			// Camera shake for dramatic finish
			if (cameraRig) cameraRig.shake(0.1);
		}
	}

	// ─── Post Celebration Phase Logic ───────────────────────────────

	function framePostCelebration(rawDelta: number, dt: number) {
		if (!matchLoop || !wrestlerRenderer) return;

		const ms = matchLoop.state;
		if (!ms.result) return;

		const winnerIdx = ms.agents.findIndex(a => a.id === ms.result!.winnerId);
		const loserIdx = ms.agents.findIndex(a => a.id === ms.result!.loserId);

		// Loser stays grounded
		if (loserIdx >= 0) {
			wrestlerRenderer.setAnimation(loserIdx, 'grounded');
		}

		// Winner cycles through celebration poses
		celebrationPoseTimer += rawDelta;
		if (celebrationPoseTimer >= 1500) { // Change pose every 1.5 seconds
			celebrationPoseTimer = 0;
			celebrationPoseIndex = (celebrationPoseIndex + 1) % CELEBRATION_POSES.length;
		}
		if (winnerIdx >= 0) {
			wrestlerRenderer.setAnimation(winnerIdx, CELEBRATION_POSES[celebrationPoseIndex]);
		}

		// Keep syncing scene for visual updates
		syncMatchToScene();
		updateAtmosphere();
		if (effectsRenderer) effectsRenderer.update(dt);

		// Keep phase as 'live' during celebration so popup doesn't show
		const wrestlers = buildWrestlerUIState();
		state = {
			...state,
			phase: 'live',
			elapsed: ms.elapsed,
			wrestlers,
			winner: winnerIdx >= 0 ? winnerIdx : null,
			winMethod: ms.result?.method ?? null,
			matchRating: ms.result?.rating ?? 0
		};
		matchState.set(state);

		// Transition to result popup after celebration delay
		if (phaseTimer >= POST_CELEBRATION_DELAY) {
			ceremonyPhase = 'post_result';
			state = { ...state, phase: 'post' };
			matchState.set(state);
		}
	}

	// ─── Hit Event Processing ───────────────────────────────────────

	function processHitEvents() {
		if (!matchLoop || !cameraRig || !wrestlerRenderer) return;

		const hitEvents = matchLoop.drainHitEvents();
		const ms = matchLoop.state;
		for (const hit of hitEvents) {
			// Impact audio + crowd energy from the physical blow.
			if (soundEngine) {
				soundEngine.impact(hit.intensity, {
					critical: hit.critical,
					blocked: hit.blocked,
					reversed: hit.reversed
				});
			}
			if (!hit.blocked) {
				const pop = hit.critical ? 0.9 : Math.min(0.6, hit.intensity * 0.7);
				energyBump = Math.min(1, energyBump + pop * 0.4);
				if (hit.critical || hit.intensity > 0.5) {
					crowdRenderer?.popReaction(pop);
					soundEngine?.crowdPop(pop * 0.8);
				}
			}
			if (effectsRenderer) {
				const impactPos: Vec3 = [hit.positionX, 0.65, 0];
				// Fewer spawns per hit — each spawn allocates a buffer, so keeping
				// this lean avoids the per-impact GC stutter.
				if (hit.critical) {
					effectsRenderer.spawnEffect('impact', impactPos, 1.0);
					effectsRenderer.spawnEffect('flash', impactPos, 0.8);
				} else if (hit.reversed) {
					effectsRenderer.spawnEffect('sparks', impactPos, 0.7);
				} else if (hit.blocked) {
					effectsRenderer.spawnEffect('sparks', impactPos, 0.3);
				} else {
					effectsRenderer.spawnEffect('impact', impactPos, hit.intensity);
				}
			}
			if (cameraRig && !hit.blocked) {
				// Gentler shake so impacts read as punch, not a camera glitch.
				const shakeIntensity = hit.critical ? 0.08 : hit.intensity * 0.045;
				cameraRig.shake(shakeIntensity);
			}
			if (wrestlerRenderer && !hit.blocked) {
				const defenderIdx = ms.agents.findIndex((a) => a.id === hit.defenderId);
				const attackerIdx = ms.agents.findIndex((a) => a.id === hit.attackerId);
				if (defenderIdx >= 0 && attackerIdx >= 0) {
					const knockDir = ms.agents[defenderIdx].positionX > ms.agents[attackerIdx].positionX ? 1 : -1;
					wrestlerRenderer.applyKnockback(defenderIdx, knockDir, hit.intensity);
					pendingKnockback[defenderIdx as 0 | 1] = { direction: knockDir, intensity: hit.intensity };
				}
			}
		}
	}

	/** Generate commentary + crowd/audio reactions for newly logged events. */
	function narrateNewEvents() {
		if (!matchLoop || !commentator) return;
		const log = matchLoop.state.log;

		for (let i = lastLogLen; i < log.length; i++) {
			const entry = log[i];
			const line = commentator.consume(matchLoop.state, entry);
			if (line) pushLine(line);
			reactToEvent(entry.type);
		}
		lastLogLen = log.length;

		// Sparse atmospheric color commentary keyed off live match state.
		const color = commentator.colorCommentary(matchLoop.state);
		if (color) pushLine(color);
	}

	/** Crowd/audio swell for dramatic narrative beats (impacts handled separately). */
	function reactToEvent(type: string) {
		let pop = 0;
		let bump = 0;
		switch (type) {
			case 'finisher_impact':
			case 'finisher_counter':
				pop = 1.4; bump = 0.9; break;
			case 'finisher_start':
				pop = 0.5; bump = 0.45; break;
			case 'knockdown':
				pop = 1.0; bump = 0.6; break;
			case 'comeback':
				pop = 1.1; bump = 0.7; break;
			case 'reversal':
				pop = 0.7; bump = 0.4; break;
			case 'combo_complete':
				pop = 0.6; bump = 0.35; break;
			case 'taunt':
				pop = 0.3; bump = 0.15; break;
			default:
				return;
		}
		crowdRenderer?.popReaction(pop);
		soundEngine?.crowdPop(pop * 0.85);
		energyBump = Math.min(1, energyBump + bump);
	}

	function pushLine(line: CommentaryLine) {
		commentaryBuffer = [...commentaryBuffer, line].slice(-12);
	}

	/** Drive crowd visuals + audio bed from match excitement each frame. */
	function updateAmbience(dt: number) {
		if (!crowdRenderer && !soundEngine) return;

		let baseline = 0.3;
		if (ceremonyPhase === 'intro_p1' || ceremonyPhase === 'intro_p2') {
			baseline = 0.32;
		} else if (ceremonyPhase === 'countdown') {
			baseline = 0.5 + Math.min(phaseTimer / COUNTDOWN_DURATION, 1) * 0.25;
		} else if ((ceremonyPhase === 'fight' || ceremonyPhase === 'post_celebration') && matchLoop) {
			let maxHeat = 0;
			let maxMomentum = 0;
			for (const a of matchLoop.state.agents) {
				maxHeat = Math.max(maxHeat, Math.abs(a.psych.crowdHeat));
				maxMomentum = Math.max(maxMomentum, a.momentum);
			}
			baseline = 0.28 + maxHeat * 0.4 + (maxMomentum / 100) * 0.15;
			if (ceremonyPhase === 'post_celebration') baseline = Math.max(baseline, 0.6);
		}

		energyBump *= Math.max(0, 1 - dt * 0.9);
		const target = Math.max(0, Math.min(1, baseline + energyBump));

		crowdRenderer?.setExcitement(target);
		crowdRenderer?.update(dt);
		soundEngine?.setCrowdEnergy(target);
		soundEngine?.update(dt);
	}

	function toggleMute() {
		muted = !muted;
		state = { ...state, muted };
		soundEngine?.resume();
		soundEngine?.setMuted(muted);
	}

	function applyCues(cues: CinematicCue[]) {
		for (const cue of cues) {
			switch (cue.type) {
				case 'camera':
					// Director cuts only apply in 'auto'; locked views ignore them.
					if (cameraRig && cameraView === 'auto') {
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

		atmosphereCurrent.exposure = lerp(atmosphereCurrent.exposure, atmosphereTarget.exposure, speed);
		atmosphereCurrent.spotlightIntensity = lerp(atmosphereCurrent.spotlightIntensity, atmosphereTarget.spotlightIntensity, speed);
		atmosphereCurrent.titantronIntensity = lerp(atmosphereCurrent.titantronIntensity, atmosphereTarget.titantronIntensity, speed);
		atmosphereCurrent.fogDensity = lerp(atmosphereCurrent.fogDensity, atmosphereTarget.fogDensity, speed);

		sceneManager.renderer.toneMappingExposure = atmosphereCurrent.exposure;

		if (arenaRenderer) {
			arenaRenderer.setSpotlightIntensity(atmosphereCurrent.spotlightIntensity);
			arenaRenderer.setTitantronIntensity(atmosphereCurrent.titantronIntensity);
		}

		const fog = sceneManager.scene.fog;
		if (fog && 'far' in fog) {
			(fog as { far: number }).far = 60 / Math.max(atmosphereCurrent.fogDensity * 40, 0.01);
		}
	}

	function buildWrestlerUIState(): WrestlerUIState[] {
		if (!matchLoop) return [];
		return matchLoop.state.agents.map((a, i) => ({
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
	}

	function syncMatchToUI() {
		if (!matchLoop) return;
		const ms = matchLoop.state;
		const wrestlers = buildWrestlerUIState();

		const recentEvents = ms.log.slice(-8).map((l) => ({
			frame: l.tick,
			type: l.type,
			detail: l.detail
		}));

		const phase = ms.running ? 'live' : 'post';

		state = {
			...state,
			phase,
			matchType: 'singles',
			elapsed: ms.elapsed,
			wrestlers,
			recentEvents,
			commentaryLines: commentaryBuffer.slice(-12),
			muted,
			winner: ms.result ? ms.agents.findIndex((a) => a.id === ms.result!.winnerId) : null,
			winMethod: ms.result?.method ?? null,
			matchRating: ms.result?.rating ?? 0
		};

		matchState.set(state);
	}

	/** How far a wrestler lunges toward the opponent during an offensive move. */
	function attackLunge(agent: { phase: string; phaseFrames: number; phaseTotalFrames: number; moveCategory: string | null }): number {
		const cat = agent.moveCategory;
		const offensive =
			cat === 'strike' || cat === 'grapple' || cat === 'signature' ||
			cat === 'finisher' || cat === 'aerial' || cat === 'submission';
		if (!offensive) return 0;
		const LUNGE = 0.5;
		const prog = 1 - agent.phaseFrames / Math.max(1, agent.phaseTotalFrames); // 0→1
		if (agent.phase === 'windup') return LUNGE * 0.45 * prog; // lean in
		if (agent.phase === 'active' || agent.phase === 'finisher_impact') return LUNGE; // full extension
		if (agent.phase === 'recovery') return LUNGE * (1 - prog) * 0.6; // settle back
		return 0;
	}

	function syncMatchToScene() {
		if (!matchLoop || !wrestlerRenderer) return;

		const ringHeight = 0.3;
		const ms = matchLoop.state;
		const wrestlerPositions: Vec3[] = [];

		const [a0, a1] = ms.agents;
		const rawGap = Math.abs(a0.positionX - a1.positionX);
		const bothNeutral =
			(a0.phase === 'idle' || a0.phase === 'moving') &&
			(a1.phase === 'idle' || a1.phase === 'moving');
		// Gentle "sizing each other up" circle only while at range and neutral;
		// once they close in they square up and trade instead of orbiting.
		if (bothNeutral && rawGap > 1.4) {
			circleAngleTarget += 0.004;
		}
		circleAngle = lerp(circleAngle, circleAngleTarget, 0.03);
		circleSway = Math.sin(circleAngle * 1.7) * 0.15;

		const midX = (a0.positionX + a1.positionX) * 0.5;
		// The sim parks fighters ~1.2 units apart to attack, but arm reach is
		// only ~0.34 — so strikes would visibly whiff. Compress the visual gap so
		// they fight at a realistic, contact-making distance (sim stays untouched).
		const visualGap = Math.max(0.5, Math.min(1.8, 0.5 + (rawGap - 0.6) * 0.55));
		const halfDist = visualGap * 0.5;

		for (let i = 0; i < ms.agents.length; i++) {
			const agent = ms.agents[i];
			const otherAgent = ms.agents[1 - i];
			const y = (agent.phase === 'knockdown' || agent.phase === 'getting_up')
				? ringHeight + 0.1
				: ringHeight;

			const angleOffset = i === 0 ? 0 : Math.PI;
			const theta = circleAngle + angleOffset;
			let ringX = midX + Math.cos(theta) * halfDist;
			let ringZ = Math.sin(theta) * halfDist * 0.6 + circleSway * (i === 0 ? 1 : -1);

			const otherTheta = circleAngle + (i === 0 ? Math.PI : 0);
			const otherX = midX + Math.cos(otherTheta) * halfDist;
			const otherZ = Math.sin(otherTheta) * halfDist * 0.6 + circleSway * (i === 0 ? -1 : 1);

			// Face the opponent (computed before lunge so the lunge drives straight in).
			const facingAngle = Math.atan2(otherX - ringX, otherZ - ringZ);
			const halfAngle = facingAngle * 0.5;
			const qy = Math.sin(halfAngle);
			const qw = Math.cos(halfAngle);

			// Attack lunge — drive toward the opponent during a strike/grapple so
			// the hand or leg actually makes contact, then settle back.
			const lunge = Math.min(attackLunge(agent), Math.max(0, visualGap - 0.28));
			if (lunge > 0) {
				const dx = otherX - ringX;
				const dz = otherZ - ringZ;
				const len = Math.hypot(dx, dz) || 1;
				ringX += (dx / len) * lunge;
				ringZ += (dz / len) * lunge;
			}

			const pos: Vec3 = [ringX, y, ringZ];
			wrestlerPositions.push(pos);
			wrestlerRenderer.updateTransform(i, pos, [0, qy, 0, qw]);

			const dx = agent.positionX - prevPositionX[i as 0 | 1];
			const velocity = Math.abs(dx) * 60;
			const circleVelocity = bothNeutral ? 0.3 : 0;
			const normalizedVelocity = Math.min((velocity + circleVelocity) / 3.0, 1.0);
			prevPositionX[i as 0 | 1] = agent.positionX;

			let finisherRole: 'attacker' | 'defender' | 'none' = 'none';
			if (agent.phase === 'finisher_setup' || agent.phase === 'finisher_impact') {
				finisherRole = 'attacker';
			} else if (agent.phase === 'finisher_locked') {
				finisherRole = 'defender';
			}

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
				stamina: agent.stamina / Math.max(1, agent.maxStamina),
				comebackActive: agent.comebackActive,
				emotion: agent.psych.emotion,
				knockback: pendingKnockback[i as 0 | 1],
				opponentRelativeX: otherAgent.positionX - agent.positionX,
				finisherRole,
			};

			wrestlerRenderer.setAnimationCommand(i, cmd);
			pendingKnockback[i as 0 | 1] = null;
		}

		// Drone view: overhead camera that follows the midpoint of the action.
		if (cameraView === 'drone' && cameraRig && wrestlerPositions.length >= 2) {
			const mx = (wrestlerPositions[0][0] + wrestlerPositions[1][0]) * 0.5;
			const mz = (wrestlerPositions[0][2] + wrestlerPositions[1][2]) * 0.5;
			cameraRig.setPreset('drone', [mx, 0.8, mz]);
			cameraRig.setTransitionSpeed(3.5);
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

	// ─── Helper: format stat bar width ──────────────────────────────
	function statBarWidth(value: number): string {
		return `${value}%`;
	}

	function alignmentLabel(alignment: string): string {
		if (alignment === 'face') return 'FAN FAVORITE';
		if (alignment === 'heel') return 'VILLAIN';
		return 'WILDCARD';
	}

	function buildLabel(build: string): string {
		if (build === 'super_heavy') return 'SUPER HEAVYWEIGHT';
		if (build === 'heavy') return 'HEAVYWEIGHT';
		if (build === 'medium') return 'MIDDLEWEIGHT';
		if (build === 'light') return 'LIGHTWEIGHT';
		return build.toUpperCase();
	}

	onDestroy(() => {
		cleanupMatch();
	});
</script>

<div class="match-view screen-enter">
	<div class="canvas-container">
		<Canvas onReady={onCanvasReady} onResize={onCanvasResize} />
	</div>

	<!-- HUD: only show during fight and post phases -->
	{#if state.ceremonyPhase === 'fight' || state.ceremonyPhase === 'post_celebration' || state.ceremonyPhase === 'post_result'}
		<div class="overlay">
			<HUD wrestlers={state.wrestlers} matchTime={state.elapsed} {matchNumber}
				wrestler1Name={w1Def.name}
				wrestler2Name={w2Def.name} />
		</div>

		<div class="commentary-panel">
			<Commentary lines={state.commentaryLines} />
		</div>
	{/if}

	<!-- ─── Intro Overlay ──────────────────────────────────────────── -->
	{#if state.ceremonyPhase === 'intro_p1' || state.ceremonyPhase === 'intro_p2'}
		{@const def = introDefs[state.introWrestlerIdx]}
		{@const progress = Math.min(state.phaseTimer / INTRO_DURATION, 1)}
		<div class="intro-overlay" class:intro-left={state.introWrestlerIdx === 0} class:intro-right={state.introWrestlerIdx === 1}>
			<div class="intro-card" class:card-enter={state.phaseTimer < 800}>
				<div class="intro-label font-display">INTRODUCING</div>
				<div class="intro-name font-display">{def.name}</div>
				<div class="intro-nickname font-display">"{def.nickname}"</div>

				<div class="intro-divider"></div>

				<div class="intro-stats">
					<div class="stat-row">
						<span class="stat-label font-mono">STR</span>
						<div class="stat-bar"><div class="stat-fill str" style="width: {statBarWidth(def.stats.strength)}"></div></div>
						<span class="stat-value font-mono">{def.stats.strength}</span>
					</div>
					<div class="stat-row">
						<span class="stat-label font-mono">SPD</span>
						<div class="stat-bar"><div class="stat-fill spd" style="width: {statBarWidth(def.stats.speed)}"></div></div>
						<span class="stat-value font-mono">{def.stats.speed}</span>
					</div>
					<div class="stat-row">
						<span class="stat-label font-mono">TEC</span>
						<div class="stat-bar"><div class="stat-fill tec" style="width: {statBarWidth(def.stats.technique)}"></div></div>
						<span class="stat-value font-mono">{def.stats.technique}</span>
					</div>
					<div class="stat-row">
						<span class="stat-label font-mono">CHA</span>
						<div class="stat-bar"><div class="stat-fill cha" style="width: {statBarWidth(def.stats.charisma)}"></div></div>
						<span class="stat-value font-mono">{def.stats.charisma}</span>
					</div>
				</div>

				<div class="intro-meta">
					<span class="meta-item font-mono">{(def.appearance.height * 100).toFixed(0)}cm</span>
					<span class="meta-sep">·</span>
					<span class="meta-item font-mono">{def.appearance.weight}kg</span>
					<span class="meta-sep">·</span>
					<span class="meta-item font-mono">{buildLabel(def.appearance.build)}</span>
				</div>
				<div class="intro-alignment font-display" class:face={def.alignment === 'face'} class:heel={def.alignment === 'heel'}>
					{alignmentLabel(def.alignment)}
				</div>
			</div>

			<!-- Progress bar at bottom of intro -->
			<div class="intro-progress">
				<div class="intro-progress-fill" style="width: {progress * 100}%"></div>
			</div>
		</div>
	{/if}

	<!-- ─── Countdown Overlay ──────────────────────────────────────── -->
	{#if state.ceremonyPhase === 'countdown'}
		<div class="countdown-overlay">
			{#if state.countdownNumber > 0}
				<div class="countdown-number font-display" class:countdown-pop={true}>
					{state.countdownNumber}
				</div>
			{:else}
				<div class="countdown-fight font-display">FIGHT!</div>
			{/if}
		</div>
	{/if}

	<!-- ─── Post-Match Winner Banner ─────────────────────────────── -->
	{#if state.ceremonyPhase === 'post_celebration' && state.winner !== null}
		<div class="winner-banner">
			<div class="winner-banner-label font-display">YOUR WINNER</div>
			<div class="winner-banner-name font-display">
				{state.wrestlers[state.winner]?.name ?? 'Unknown'}
			</div>
			<div class="winner-banner-method font-display">
				BY {state.winMethod?.toUpperCase() ?? 'DECISION'}
			</div>
		</div>
	{/if}

	<!-- Controls: show during fight and celebration -->
	{#if state.ceremonyPhase === 'fight' || state.ceremonyPhase === 'post_celebration'}
		<!-- Camera switcher — bottom-left, clear of the top HUD -->
		<div class="cam-dock">
			<div class="cam-switcher glass">
				<button class="cam-btn" class:active={state.cameraView === 'auto'} onclick={() => setCameraView('auto')} title="Director cuts">
					<span class="cam-icon">🎬</span><span class="cam-label">AUTO</span>
				</button>
				<button class="cam-btn" class:active={state.cameraView === 'hard'} onclick={() => setCameraView('hard')} title="Broadcast hard cam">
					<span class="cam-icon">📺</span><span class="cam-label">HARD</span>
				</button>
				<button class="cam-btn" class:active={state.cameraView === 'drone'} onclick={() => setCameraView('drone')} title="Overhead drone follow">
					<span class="cam-icon">🚁</span><span class="cam-label">DRONE</span>
				</button>
				<button class="cam-btn" class:active={state.cameraView === 'free'} onclick={() => setCameraView('free')} title="Free orbit (drag to look around)">
					<span class="cam-icon">🕹️</span><span class="cam-label">FREE</span>
				</button>
			</div>
		</div>

		<!-- Sound / Exit / Help — bottom-right -->
		<div class="controls">
			<div class="help-anchor">
				{#if state.showGuide}
					<div class="help-tooltip glass-strong">
						<div class="guide-items">
							<div class="guide-item"><span class="guide-key font-mono">Left Drag</span><span class="guide-desc">Orbit</span></div>
							<div class="guide-item"><span class="guide-key font-mono">Scroll</span><span class="guide-desc">Zoom</span></div>
							<div class="guide-item"><span class="guide-key font-mono">Right Drag</span><span class="guide-desc">Pan</span></div>
							<div class="guide-item"><span class="guide-key font-mono">C</span><span class="guide-desc">Cycle view</span></div>
							<div class="guide-item"><span class="guide-key font-mono">M</span><span class="guide-desc">Mute sound</span></div>
						</div>
					</div>
				{/if}
				<button class="help-btn glass-btn" onclick={toggleGuide} title="Controls help">?</button>
			</div>
			<button class="camera-toggle glass-btn" onclick={toggleMute} title="Toggle sound (M)">
				{state.muted ? 'SOUND OFF' : 'SOUND ON'}
			</button>
			<button class="exit-btn glass-btn" onclick={exitMatch}>EXIT</button>
		</div>
	{/if}

	<!-- Result popup -->
	{#if state.ceremonyPhase === 'post_result' && state.winMethod}
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
		bottom: 1rem;
		right: 1rem;
		z-index: 12;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Camera switcher dock — bottom-left, away from the top HUD */
	.cam-dock {
		position: absolute;
		bottom: 1rem;
		left: 1rem;
		z-index: 12;
	}

	/* ─── Camera View Switcher ─────────────────────── */
	.cam-switcher {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-md, 10px);
	}

	.cam-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 0.3rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		color: var(--text-secondary, #aab);
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}

	.cam-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
	}

	.cam-btn.active {
		background: rgba(255, 60, 90, 0.18);
		border-color: rgba(255, 60, 90, 0.55);
		color: #fff;
		box-shadow: 0 0 12px rgba(255, 60, 90, 0.25);
	}

	.cam-icon {
		font-size: 1.05rem;
		line-height: 1;
	}

	.cam-label {
		font-family: var(--font-mono, monospace);
		font-size: 0.5rem;
		letter-spacing: 0.08em;
		font-weight: 700;
	}

	.exit-btn {
		font-family: var(--font-display);
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		padding: 0.5rem 1rem;
	}

	.camera-toggle {
		font-family: var(--font-display);
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		padding: 0.5rem 1rem;
	}

	.help-anchor {
		position: relative;
		display: flex;
		align-items: center;
	}

	.help-btn {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		font-size: 1rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		color: var(--text-secondary, #aaa);
		cursor: pointer;
	}

	.help-tooltip {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		right: 0;
		padding: 0.6rem 0.8rem;
		border-radius: 8px;
		white-space: nowrap;
		animation: fade-in 0.2s ease-out;
	}

	.guide-items {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.guide-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.guide-key {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: var(--text-primary, #fff);
		min-width: 65px;
		text-align: center;
	}

	.guide-desc {
		font-size: 0.7rem;
		color: var(--text-secondary, #aaa);
		white-space: nowrap;
	}

	/* ─── Intro Overlay ────────────────────────────── */
	.intro-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		z-index: 15;
		pointer-events: none;
		background: linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, transparent 60%);
	}

	.intro-overlay.intro-left {
		justify-content: flex-start;
		padding-left: 3rem;
	}

	.intro-overlay.intro-right {
		justify-content: flex-end;
		padding-right: 3rem;
	}

	.intro-card {
		background: rgba(5, 5, 15, 0.85);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 50, 80, 0.3);
		border-radius: 12px;
		padding: 2rem 2.5rem;
		min-width: 280px;
		max-width: 340px;
		animation: intro-slide-in 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.intro-card.card-enter {
		animation: intro-slide-in 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes intro-slide-in {
		from {
			opacity: 0;
			transform: translateX(-40px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	.intro-right .intro-card {
		animation-name: intro-slide-in-right;
	}

	@keyframes intro-slide-in-right {
		from {
			opacity: 0;
			transform: translateX(40px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	.intro-label {
		font-size: 0.75rem;
		letter-spacing: 0.25em;
		color: rgba(255, 68, 102, 0.8);
		text-shadow: 0 0 10px rgba(255, 68, 102, 0.4);
		margin-bottom: 0.3rem;
	}

	.intro-name {
		font-size: 2rem;
		letter-spacing: 0.04em;
		color: #fff;
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
		line-height: 1.1;
	}

	.intro-nickname {
		font-size: 1rem;
		color: rgba(255, 200, 100, 0.8);
		font-style: italic;
		margin-top: 0.2rem;
		letter-spacing: 0.02em;
	}

	.intro-divider {
		height: 1px;
		background: linear-gradient(90deg, rgba(255, 50, 80, 0.6), rgba(255, 50, 80, 0), transparent);
		margin: 1rem 0;
	}

	.intro-stats {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.stat-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.6);
		width: 28px;
		letter-spacing: 0.05em;
	}

	.stat-bar {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		overflow: hidden;
	}

	.stat-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.8s ease-out;
	}

	.stat-fill.str { background: linear-gradient(90deg, #ef4444, #f87171); }
	.stat-fill.spd { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
	.stat-fill.tec { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
	.stat-fill.cha { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

	.stat-value {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.7);
		width: 24px;
		text-align: right;
	}

	.intro-meta {
		margin-top: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.meta-sep {
		color: rgba(255, 255, 255, 0.25);
	}

	.intro-alignment {
		margin-top: 0.5rem;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		color: rgba(255, 255, 255, 0.5);
	}

	.intro-alignment.face { color: rgba(34, 197, 94, 0.9); }
	.intro-alignment.heel { color: rgba(239, 68, 68, 0.9); }

	.intro-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgba(255, 255, 255, 0.05);
	}

	.intro-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #ff4466, #ff6b88);
		transition: width 0.1s linear;
	}

	/* ─── Countdown Overlay ────────────────────────── */
	.countdown-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 15;
		pointer-events: none;
	}

	.countdown-number {
		font-size: 12rem;
		color: #fff;
		text-shadow:
			0 0 40px rgba(255, 68, 102, 0.8),
			0 0 80px rgba(255, 68, 102, 0.4),
			0 4px 20px rgba(0, 0, 0, 0.8);
		animation: countdown-pulse 1s ease-out;
		letter-spacing: 0.05em;
	}

	@keyframes countdown-pulse {
		0% {
			transform: scale(2);
			opacity: 0;
		}
		30% {
			transform: scale(0.9);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.countdown-fight {
		font-size: 8rem;
		color: #ff4466;
		text-shadow:
			0 0 60px rgba(255, 68, 102, 0.9),
			0 0 120px rgba(255, 68, 102, 0.5),
			0 4px 20px rgba(0, 0, 0, 0.8);
		animation: fight-flash 0.8s ease-out;
		letter-spacing: 0.1em;
	}

	@keyframes fight-flash {
		0% {
			transform: scale(3);
			opacity: 0;
		}
		40% {
			transform: scale(0.85);
			opacity: 1;
		}
		60% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* ─── Winner Banner (post-celebration) ─────────── */
	.winner-banner {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		z-index: 15;
		pointer-events: none;
		animation: banner-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes banner-enter {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.8);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	.winner-banner-label {
		font-size: 1.2rem;
		letter-spacing: 0.3em;
		color: rgba(255, 200, 50, 0.9);
		text-shadow: 0 0 20px rgba(255, 200, 50, 0.5);
		margin-bottom: 0.3rem;
	}

	.winner-banner-name {
		font-size: 4rem;
		color: #fff;
		text-shadow:
			0 0 30px rgba(255, 68, 102, 0.6),
			0 4px 20px rgba(0, 0, 0, 0.8);
		letter-spacing: 0.04em;
		line-height: 1.1;
	}

	.winner-banner-method {
		font-size: 1.5rem;
		color: rgba(255, 68, 102, 0.9);
		letter-spacing: 0.15em;
		margin-top: 0.5rem;
		text-shadow: 0 0 15px rgba(255, 68, 102, 0.4);
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
