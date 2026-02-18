<script lang="ts">
	import { setScreen } from '$lib/state/uiStore';

	let { label = 'Feature' }: { label?: string } = $props();
</script>

<div class="coming-soon screen-enter">
	<div class="content glass-card">
		<h1 class="title font-display">{label.toUpperCase()}</h1>
		<p class="subtitle">Coming Soon</p>
		<p class="desc">This feature is under development.</p>
		<button class="glass-btn" onclick={() => setScreen('menu')}>
			&larr; BACK TO MENU
		</button>
	</div>
</div>

<style>
	.coming-soon {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
	}

	.content {
		text-align: center;
		padding: 3rem 4rem;
		max-width: 500px;
	}

	.title {
		font-size: 3rem;
		margin: 0;
		color: var(--accent);
		text-shadow: 0 0 30px var(--accent-glow);
	}

	.subtitle {
		font-family: var(--font-display);
		font-size: 1.5rem;
		color: var(--text-secondary);
		margin: 0.5rem 0 1rem;
		letter-spacing: 0.1em;
	}

	.desc {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 0 0 2rem;
	}
</style>
