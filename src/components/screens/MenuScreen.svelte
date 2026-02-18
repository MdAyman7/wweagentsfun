<script lang="ts">
	import { setScreen } from '$lib/state/uiStore';
	import type { UIScreen } from '$lib/state/uiStore';

	const menuItems: { label: string; screen: UIScreen; primary?: boolean }[] = [
		{ label: 'FIGHT', screen: 'setup', primary: true },
		{ label: 'TOURNAMENT', screen: 'tournament' },
		{ label: 'LEAGUE', screen: 'league' },
		{ label: 'REPLAY', screen: 'replay' },
		{ label: 'TRAINING', screen: 'training' }
	];
</script>

<div class="menu screen-enter">
	<!-- Ember particles -->
	<div class="embers" aria-hidden="true">
		{#each Array(6) as _, i}
			<div class="ember" style="--delay: {i * 1.7}s; --x: {15 + i * 14}%; --duration: {7 + i * 1.5}s"></div>
		{/each}
	</div>

	<!-- Logo -->
	<div class="logo-block">
		<h1 class="logo">
			<span class="logo-wwe">WWE</span>
			<span class="logo-agents">AGENTS</span>
		</h1>
		<p class="tagline">AI-Powered Wrestling Simulation</p>
	</div>

	<!-- Menu Buttons -->
	<nav class="menu-nav">
		{#each menuItems as item, i}
			<button
				class="glass-btn menu-item"
				class:glass-btn-primary={item.primary}
				style="animation-delay: {0.15 + i * 0.06}s"
				onclick={() => setScreen(item.screen)}
			>
				{item.label}
			</button>
		{/each}
	</nav>

	<!-- Footer -->
	<footer class="footer">
		<span>Powered by THREE.js + Rapier Physics + ECS</span>
	</footer>
</div>

<style>
	.menu {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 3rem;
		position: relative;
		overflow: hidden;
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
		opacity: 0;
		animation: ember-rise var(--duration) ease-in infinite;
		animation-delay: var(--delay);
	}

	/* ─── Logo ───────────────────────────────────── */
	.logo-block {
		text-align: center;
		animation: slide-up 0.6s var(--ease-out-expo) forwards;
		z-index: 1;
	}

	.logo {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		line-height: 1;
	}

	.logo-wwe {
		font-family: var(--font-display);
		font-size: 5rem;
		color: var(--text-primary);
		letter-spacing: 0.12em;
	}

	.logo-agents {
		font-family: var(--font-display);
		font-size: 7rem;
		color: var(--accent);
		letter-spacing: 0.08em;
		text-shadow:
			0 0 40px var(--accent-glow),
			0 0 80px rgba(233, 69, 96, 0.15);
		margin-top: -0.8rem;
	}

	.tagline {
		font-size: 0.95rem;
		color: var(--text-secondary);
		margin: 0.75rem 0 0;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 500;
	}

	/* ─── Nav ────────────────────────────────────── */
	.menu-nav {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: 320px;
		z-index: 1;
	}

	.menu-item {
		animation: slide-up 0.5s var(--ease-out-expo) backwards;
		font-family: var(--font-display);
		font-size: 1.3rem;
		letter-spacing: 0.1em;
		padding: 1rem 2rem;
	}

	/* ─── Footer ─────────────────────────────────── */
	.footer {
		position: absolute;
		bottom: 1.5rem;
		color: var(--text-muted);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		z-index: 1;
	}
</style>
