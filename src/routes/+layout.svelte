<script lang="ts">
	import '$lib/styles/game-theme.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>WWE AGENTS</title>
	<meta name="description" content="AI-powered wrestling simulation" />
</svelte:head>

<div class="app">
	{@render children()}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: var(--bg-deep);
		color: var(--text-primary);
		font-family: var(--font-body);
		overflow: hidden;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(button) {
		font-family: inherit;
	}

	.app {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		position: relative;
		background:
			radial-gradient(ellipse at 30% 20%, rgba(233, 69, 96, 0.04) 0%, transparent 50%),
			radial-gradient(ellipse at 70% 80%, rgba(59, 130, 246, 0.03) 0%, transparent 50%),
			var(--bg-deep);
	}
</style>
