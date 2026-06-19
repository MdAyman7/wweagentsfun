<script lang="ts">
	import { setScreen } from '$lib/state/uiStore';
	import type { UIScreen } from '$lib/state/uiStore';

	interface MenuItem {
		label: string;
		sub: string;
		screen: UIScreen;
		icon: 'fight' | 'tournament' | 'league' | 'replay' | 'training';
		primary?: boolean;
		ready?: boolean;
	}

	const menuItems: MenuItem[] = [
		{ label: 'FIGHT', sub: 'Singles · No DQ · Iron Man', screen: 'setup', icon: 'fight', primary: true, ready: true },
		{ label: 'TOURNAMENT', sub: 'Bracket to glory', screen: 'tournament', icon: 'tournament' },
		{ label: 'LEAGUE', sub: 'Season standings', screen: 'league', icon: 'league' },
		{ label: 'REPLAY', sub: 'Relive the action', screen: 'replay', icon: 'replay' },
		{ label: 'TRAINING', sub: 'Hone your craft', screen: 'training', icon: 'training' }
	];
</script>

<div class="menu screen-enter">
	<!-- Animated spotlight beams -->
	<div class="beams" aria-hidden="true">
		<div class="beam beam-1"></div>
		<div class="beam beam-2"></div>
	</div>

	<!-- Ember particles -->
	<div class="embers" aria-hidden="true">
		{#each Array(8) as _, i}
			<div class="ember" style="--delay: {i * 1.3}s; --x: {8 + i * 11}%; --duration: {7 + (i % 4) * 1.4}s"></div>
		{/each}
	</div>

	<!-- Hero / Logo -->
	<div class="logo-block">
		<div class="kicker font-mono">AI-DRIVEN · LIVE EVENT</div>
		<h1 class="logo">
			<span class="logo-wwe">WWE</span>
			<span class="logo-agents">AGENTS</span>
		</h1>
		<div class="belt" aria-hidden="true">
			<span class="belt-strap"></span>
			<span class="belt-plate">★</span>
			<span class="belt-strap"></span>
		</div>
		<p class="tagline">Pick your fighters. Watch the show.</p>
	</div>

	<!-- Menu -->
	<nav class="menu-nav">
		{#each menuItems as item, i}
			<button
				class="menu-item"
				class:primary={item.primary}
				style="animation-delay: {0.12 + i * 0.06}s"
				onclick={() => setScreen(item.screen)}
			>
				<span class="mi-icon" aria-hidden="true">
					{#if item.icon === 'fight'}
						<svg viewBox="0 0 24 24"><path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" /></svg>
					{:else if item.icon === 'tournament'}
						<svg viewBox="0 0 24 24"><path d="M8 2 h8 v3 a4 4 0 0 1-8 0 z M5 4 h3 v2 a3 3 0 0 1-3-3 z M16 4 h3 a3 3 0 0 1-3 3 z M11 10 h2 v5 h-2 z M8 19 h8 v3 H8 z" /></svg>
					{:else if item.icon === 'league'}
						<svg viewBox="0 0 24 24"><path d="M3 4 h18 v3 H3 z M3 10 h18 v3 H3 z M3 16 h18 v3 H3 z" /></svg>
					{:else if item.icon === 'replay'}
						<svg viewBox="0 0 24 24"><path d="M12 3 a9 9 0 1 0 9 9 h-2 a7 7 0 1 1-7-7 V3 z M10 9 l5 3 -5 3 z" /></svg>
					{:else}
						<svg viewBox="0 0 24 24"><path d="M12 2 a10 10 0 1 0 0 20 10 10 0 0 0 0-20 z m0 4 a6 6 0 1 1 0 12 6 6 0 0 1 0-12 z m0 4 a2 2 0 1 1 0 4 2 2 0 0 1 0-4 z" /></svg>
					{/if}
				</span>
				<span class="mi-text">
					<span class="mi-label font-display">{item.label}</span>
					<span class="mi-sub">{item.sub}</span>
				</span>
				{#if item.primary}
					<span class="mi-tag main-event">MAIN EVENT</span>
				{:else if !item.ready}
					<span class="mi-tag soon">SOON</span>
				{/if}
				<span class="mi-chevron" aria-hidden="true">›</span>
			</button>
		{/each}
	</nav>

	<footer class="footer">
		<span>THREE.js · Procedural Audio · Reactive Crowd</span>
	</footer>
</div>

<style>
	.menu {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 2.5rem;
		overflow: hidden;
		background:
			radial-gradient(ellipse 70% 50% at 50% 0%, rgba(233, 69, 96, 0.10), transparent 70%),
			var(--bg-deep);
	}

	/* ─── Spotlight beams ────────────────────────── */
	.beams {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.beam {
		position: absolute;
		top: -40%;
		left: 50%;
		width: 40vw;
		height: 130vh;
		transform-origin: top center;
		opacity: 0.12;
		filter: blur(8px);
		mix-blend-mode: screen;
	}

	.beam-1 {
		background: linear-gradient(to bottom, rgba(233, 69, 96, 0.55), transparent 65%);
		animation: sweep-l 9s ease-in-out infinite alternate;
	}

	.beam-2 {
		background: linear-gradient(to bottom, rgba(120, 140, 255, 0.45), transparent 65%);
		animation: sweep-r 11s ease-in-out infinite alternate;
	}

	@keyframes sweep-l {
		from { transform: translateX(-60%) rotate(-22deg); }
		to   { transform: translateX(-60%) rotate(-8deg); }
	}

	@keyframes sweep-r {
		from { transform: translateX(-40%) rotate(20deg); }
		to   { transform: translateX(-40%) rotate(6deg); }
	}

	/* ─── Embers ─────────────────────────────────── */
	.embers {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.ember {
		position: absolute;
		bottom: -10px;
		left: var(--x);
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 6px var(--accent-glow);
		opacity: 0;
		animation: ember-rise var(--duration) ease-in infinite;
		animation-delay: var(--delay);
	}

	@keyframes ember-rise {
		0% { transform: translateY(0) scale(1); opacity: 0; }
		15% { opacity: 0.8; }
		100% { transform: translateY(-90vh) scale(0.3); opacity: 0; }
	}

	/* ─── Logo ───────────────────────────────────── */
	.logo-block {
		text-align: center;
		z-index: 1;
		animation: slide-up 0.6s var(--ease-out-expo) forwards;
	}

	.kicker {
		font-size: 0.72rem;
		letter-spacing: 0.42em;
		color: var(--text-secondary);
		margin-bottom: 0.6rem;
		padding-left: 0.42em;
	}

	.logo {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.86;
	}

	.logo-wwe {
		font-family: var(--font-display);
		font-size: 3.4rem;
		color: var(--text-primary);
		letter-spacing: 0.34em;
		padding-left: 0.34em;
	}

	.logo-agents {
		font-family: var(--font-display);
		font-size: 7.5rem;
		color: var(--accent);
		letter-spacing: 0.06em;
		text-shadow: 0 0 50px var(--accent-glow), 0 0 100px rgba(233, 69, 96, 0.2);
	}

	/* championship belt accent under the logo */
	.belt {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 0.6rem 0 0.2rem;
	}

	.belt-strap {
		height: 3px;
		width: 90px;
		border-radius: 2px;
		background: linear-gradient(90deg, transparent, var(--gold), transparent);
		opacity: 0.85;
	}

	.belt-plate {
		font-size: 1rem;
		color: var(--gold);
		text-shadow: 0 0 12px var(--gold-glow);
	}

	.tagline {
		font-size: 0.95rem;
		color: var(--text-secondary);
		margin: 0.5rem 0 0;
		letter-spacing: 0.06em;
	}

	/* ─── Nav ────────────────────────────────────── */
	.menu-nav {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		width: 380px;
		max-width: 90vw;
		z-index: 1;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.85rem 1.1rem;
		border-radius: var(--radius-md, 12px);
		background: var(--glass-bg);
		border: 1px solid var(--glass-border);
		backdrop-filter: blur(var(--glass-blur));
		color: var(--text-primary);
		cursor: pointer;
		text-align: left;
		animation: slide-up 0.5s var(--ease-out-expo) backwards;
		transition: transform var(--transition-fast) ease, border-color var(--transition-fast) ease,
			background var(--transition-fast) ease, box-shadow var(--transition-fast) ease;
	}

	.menu-item:hover {
		transform: translateX(4px);
		background: var(--glass-bg-hover);
		border-color: var(--glass-border-hover);
	}

	.menu-item .mi-chevron {
		margin-left: auto;
		font-size: 1.6rem;
		color: var(--text-muted);
		transition: transform var(--transition-fast) ease, color var(--transition-fast) ease;
	}

	.menu-item:hover .mi-chevron {
		transform: translateX(3px);
		color: var(--accent);
	}

	.menu-item.primary {
		background: linear-gradient(100deg, var(--accent-soft), var(--glass-bg));
		border-color: var(--glass-border-accent);
		box-shadow: 0 0 24px var(--accent-glow);
	}

	.menu-item.primary:hover {
		box-shadow: 0 0 34px var(--accent-glow);
	}

	.mi-icon {
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		color: var(--text-secondary);
	}

	.menu-item.primary .mi-icon {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.mi-icon svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	.mi-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.mi-label {
		font-size: 1.25rem;
		letter-spacing: 0.08em;
		line-height: 1;
	}

	.mi-sub {
		font-size: 0.72rem;
		color: var(--text-muted);
		letter-spacing: 0.02em;
	}

	.mi-tag {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		padding: 0.2rem 0.45rem;
		border-radius: 5px;
	}

	.mi-tag.main-event {
		color: var(--gold);
		background: rgba(255, 215, 0, 0.12);
		border: 1px solid var(--gold-glow);
	}

	.mi-tag.soon {
		color: var(--text-muted);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--glass-border);
	}

	/* When a tag is present, the chevron sits after it */
	.menu-item .mi-tag + .mi-chevron {
		margin-left: 0.6rem;
	}

	/* ─── Footer ─────────────────────────────────── */
	.footer {
		position: absolute;
		bottom: 1.5rem;
		color: var(--text-muted);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		z-index: 1;
	}
</style>
