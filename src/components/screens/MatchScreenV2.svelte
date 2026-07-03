<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { uiState, setScreen } from '$lib/state/uiStore';
	import { Stage } from '$lib/game/render/Stage';
	import { Arena, RING } from '$lib/game/render/Arena';
	import { Fighter3D, type Build } from '$lib/game/render/Fighter3D';
	import { Animator } from '$lib/game/render/Animator';
	import { CameraRig, type CamView } from '$lib/game/render/CameraRig';
	import { MatchSim } from '$lib/game/sim/MatchSim';
	import { getWrestler, ROSTER } from '$lib/game/data/roster';
	import type { MatchEvent } from '$lib/game/sim/types';
	import * as THREE from 'three';

	const cfg = get(uiState).matchConfig;
	const w1 = getWrestler(cfg.wrestler1Id ?? '') ?? ROSTER[0];
	const w2 = getWrestler(cfg.wrestler2Id ?? '') ?? ROSTER[1];

	interface Line { id: number; text: string; big: boolean; }
	let view = $state({
		phase: 'opening', clock: '0:00', done: false,
		f: [
			{ name: w1.name, hp: 100, st: 100, mo: 0 },
			{ name: w2.name, hp: 100, st: 100, mo: 0 }
		] as { name: string; hp: number; st: number; mo: number }[],
		pinCount: 0,
		lines: [] as Line[],
		winner: '', method: '', rating: 0,
		camView: 'auto' as CamView
	});

	let canvasEl: HTMLCanvasElement;
	let raf = 0;
	let stage: Stage, arena: Arena, cam: CameraRig, sim: MatchSim;
	let f3d: [Fighter3D, Fighter3D];
	let anim: [Animator, Animator];
	let lastEvent = 0, lineId = 0, last = 0, acc = 0, simTime = 0;
	const STEP = 1000 / 60;
	const focus = new THREE.Vector3();

	const mapBuild = (b: string): Build => (b === 'light' ? 'light' : b === 'medium' ? 'medium' : 'heavy');

	function makeFighter3D(w: typeof w1): Fighter3D {
		return new Fighter3D({
			skin: w.appearance.skinTone, trunks: w.appearance.primaryColor, accent: w.appearance.secondaryColor,
			build: mapBuild(w.build), strength: w.stats.strength, name: w.name
		});
	}

	onMount(() => {
		stage = new Stage(canvasEl);
		arena = new Arena(stage.scene);
		cam = new CameraRig();
		cam.initControls(canvasEl);
		sim = new MatchSim(w1, w2, { seed: cfg.seed });
		f3d = [makeFighter3D(w1), makeFighter3D(w2)];
		anim = [new Animator(), new Animator()];
		for (const f of f3d) stage.scene.add(f.root);
		resize();
		window.addEventListener('resize', resize);
		last = performance.now();
		raf = requestAnimationFrame(frame);
	});

	function resize() {
		const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
		stage.resize(w, h); cam.setAspect(w / Math.max(1, h));
	}

	function frame(now: number) {
		const dt = Math.min(now - last, 100); last = now;
		simTime += dt / 1000;

		// Fixed-timestep sim.
		acc += dt;
		let steps = 0;
		while (acc >= STEP && steps < 5 && sim.running) { sim.step(); acc -= STEP; steps++; }

		const snap = sim.snapshot();

		// Drive the 3D fighters from the sim. The sim keeps fighters ~1.5+ units
		// apart, which reads as a distant fight — compress the visual gap and add
		// an attack lunge so they trade up close and limbs actually connect.
		const DIST = 0.46;
		const wx: [number, number] = [0, 0];
		for (let i = 0; i < 2; i++) {
			const f = snap.fighters[i];
			const opp = snap.fighters[1 - i];
			const dir = opp.posX >= f.posX ? 1 : -1;
			let x = f.posX * DIST;
			if (f.actionPhase === 'active') x += dir * 0.3;
			else if (f.actionPhase === 'windup') x += dir * 0.12;
			x = Math.max(-(RING.half - 0.3), Math.min(RING.half - 0.3, x));
			wx[i] = x;
			f3d[i].root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
			f3d[i].applyPose(anim[i].update(f, dt / 1000, simTime, 0));
		}
		// Don't let them clip through each other.
		const gap = wx[1] - wx[0];
		if (Math.abs(gap) < 0.44) {
			const mid = (wx[0] + wx[1]) / 2, s = Math.sign(gap) || 1;
			wx[0] = mid - s * 0.22; wx[1] = mid + s * 0.22;
		}
		f3d[0].root.position.set(wx[0], RING.mat, 0);
		f3d[1].root.position.set(wx[1], RING.mat, 0);

		// Camera frames the action; tightens with crowd energy.
		focus.set((wx[0] + wx[1]) / 2, 1, 0);
		cam.update(dt / 1000, focus, Math.abs(wx[0] - wx[1]), snap.crowd);

		arena.setEnergy(snap.crowd); arena.update(simTime);
		stage.setExposure(1.02 + snap.crowd * 0.22);
		stage.render(cam.camera);

		processEvents();
		syncHud(snap);

		if (snap.result && !view.done) endMatch();
		raf = requestAnimationFrame(frame);
	}

	function processEvents() {
		for (; lastEvent < sim.events.length; lastEvent++) {
			const e = sim.events[lastEvent];
			if (e.type === 'move_hit' || e.type === 'signature') cam.shake(0.05);
			if (e.type === 'finisher' || e.type === 'near_fall' || e.type === 'knockdown') cam.shake(0.1);
			if (e.type === 'phase' || e.type === 'bell') continue;
			const big = e.type === 'finisher' || e.type === 'near_fall' || e.type === 'win' || e.type === 'count';
			view.lines = [...view.lines, { id: lineId++, text: e.text, big }].slice(-5);
		}
	}

	function syncHud(snap: ReturnType<MatchSim['snapshot']>) {
		for (let i = 0; i < 2; i++) {
			const f = snap.fighters[i];
			view.f[i].hp = Math.round((f.health / f.maxHealth) * 100);
			view.f[i].st = Math.round((f.stamina / f.maxStamina) * 100);
			view.f[i].mo = Math.round(f.momentum);
		}
		view.phase = snap.phase;
		view.pinCount = snap.pinCount;
		const s = Math.floor(snap.elapsed);
		view.clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
		view.camView = cam.getView();
	}

	function endMatch() {
		const r = sim.result!;
		view.done = true;
		view.winner = sim.fighters[r.winner!].def.name;
		view.method = r.method;
		view.rating = r.rating;
	}

	function setCam(v: CamView) { cam.setView(v); view.camView = v; }

	function exit() { setScreen('menu'); }
	function rematch() { setScreen('setup'); }

	onDestroy(() => {
		cancelAnimationFrame(raf);
		window.removeEventListener('resize', resize);
		f3d?.forEach((f) => f.dispose());
		arena?.dispose(); cam?.dispose(); stage?.dispose();
	});
</script>

<div class="match">
	<canvas bind:this={canvasEl}></canvas>

	<!-- HUD -->
	<div class="hud">
		<div class="side left">
			<div class="nm">{view.f[0].name}</div>
			<div class="bar"><span class="hp" style="width:{view.f[0].hp}%"></span></div>
			<div class="bar sm"><span class="st" style="width:{view.f[0].st}%"></span></div>
			<div class="bar sm"><span class="mo" style="width:{view.f[0].mo}%"></span></div>
		</div>
		<div class="center">
			<div class="clock">{view.clock}</div>
			<div class="phase">{view.phase.toUpperCase()}</div>
		</div>
		<div class="side right">
			<div class="nm">{view.f[1].name}</div>
			<div class="bar"><span class="hp" style="width:{view.f[1].hp}%"></span></div>
			<div class="bar sm"><span class="st" style="width:{view.f[1].st}%"></span></div>
			<div class="bar sm"><span class="mo" style="width:{view.f[1].mo}%"></span></div>
		</div>
	</div>

	<!-- Pin count -->
	{#if view.pinCount > 0 && !view.done}
		<div class="pin">{['', 'ONE', 'TWO', 'THREE'][view.pinCount]}</div>
	{/if}

	<!-- Commentary -->
	<div class="commentary">
		{#each view.lines as l (l.id)}
			<div class="line" class:big={l.big}>{l.text}</div>
		{/each}
	</div>

	<!-- Camera switcher -->
	<div class="cams">
		{#each ['auto', 'hard', 'drone', 'free'] as v}
			<button class:active={view.camView === v} onclick={() => setCam(v as CamView)}>{v.toUpperCase()}</button>
		{/each}
		<button class="exit" onclick={exit}>EXIT</button>
	</div>

	<!-- Result -->
	{#if view.done}
		<div class="result">
			<div class="card">
				<div class="ov">MATCH OVER</div>
				<div class="win">{view.winner}</div>
				<div class="mth">WINS BY {view.method.toUpperCase()}</div>
				<div class="stars">{'★'.repeat(Math.round(view.rating))}{'☆'.repeat(5 - Math.round(view.rating))}</div>
				<div class="actions">
					<button onclick={rematch}>NEW MATCH</button>
					<button onclick={exit}>MENU</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.match { position: relative; width: 100vw; height: 100vh; background: #05060c; overflow: hidden; }
	canvas { width: 100%; height: 100%; display: block; }

	.hud { position: absolute; top: 1rem; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; padding: 0 1.2rem; gap: 1rem; pointer-events: none; }
	.side { flex: 1; max-width: 380px; }
	.side.right { text-align: right; }
	.nm { font-family: var(--font-display, sans-serif); font-size: 1.2rem; letter-spacing: 0.04em; text-shadow: 0 2px 6px #000; margin-bottom: 4px; }
	.bar { height: 12px; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; margin-bottom: 3px; }
	.bar.sm { height: 5px; }
	.side.right .bar span { margin-left: auto; }
	.bar span { display: block; height: 100%; border-radius: 6px; transition: width 0.2s; }
	.hp { background: linear-gradient(90deg,#ef4444,#f87171); }
	.st { background: linear-gradient(90deg,#3b82f6,#60a5fa); }
	.mo { background: linear-gradient(90deg,#e94560,#f472b6); }
	.center { text-align: center; }
	.clock { font-family: var(--font-mono, monospace); font-size: 1.4rem; font-weight: 700; text-shadow: 0 2px 6px #000; }
	.phase { font-family: var(--font-mono, monospace); font-size: 0.65rem; letter-spacing: 0.2em; color: #ff8098; }

	.pin { position: absolute; top: 34%; left: 50%; transform: translate(-50%,-50%); font-family: var(--font-display, sans-serif); font-size: 9rem; color: #fff; text-shadow: 0 0 40px #ff2244, 0 6px 20px #000; animation: pop 0.3s ease-out; }
	@keyframes pop { from { transform: translate(-50%,-50%) scale(2); opacity: 0; } }

	.commentary { position: absolute; bottom: 4.5rem; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; pointer-events: none; }
	.line { font-size: 0.9rem; color: #cdd; text-shadow: 0 1px 4px #000; opacity: 0.85; }
	.line.big { font-size: 1.1rem; font-weight: 700; color: #fff; }

	.cams { position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; background: rgba(10,12,20,0.6); padding: 4px; border-radius: 10px; backdrop-filter: blur(8px); }
	.cams button { padding: 0.4rem 0.7rem; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; background: transparent; border: 1px solid transparent; border-radius: 6px; color: #aab; cursor: pointer; }
	.cams button.active { background: rgba(255,60,90,0.18); border-color: rgba(255,60,90,0.5); color: #fff; }
	.cams .exit { color: #f88; }

	.result { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); }
	.card { text-align: center; padding: 2.5rem 4rem; background: rgba(12,14,26,0.9); border: 1px solid rgba(255,60,90,0.3); border-radius: 16px; }
	.ov { color: #8898b8; letter-spacing: 0.2em; }
	.win { font-family: var(--font-display, sans-serif); font-size: 3rem; color: #ff4466; text-shadow: 0 0 30px rgba(255,68,102,0.5); }
	.mth { color: #cdd; letter-spacing: 0.1em; margin: 0.3rem 0; }
	.stars { color: #ffd700; font-size: 1.6rem; margin: 0.5rem 0 1.2rem; }
	.actions { display: flex; gap: 0.75rem; justify-content: center; }
	.actions button { font-family: var(--font-display, sans-serif); font-size: 1rem; letter-spacing: 0.06em; padding: 0.7rem 1.8rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); color: #fff; cursor: pointer; }
</style>
