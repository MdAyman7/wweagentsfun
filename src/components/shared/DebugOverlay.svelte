<script lang="ts">
	let {
		fps = 0,
		frame = 0,
		entityCount = 0,
		systemTimings = {} as Record<string, number>
	}: {
		fps: number;
		frame: number;
		entityCount: number;
		systemTimings: Record<string, number>;
	} = $props();
</script>

<div class="debug">
	<div class="stat">FPS: {fps.toFixed(0)}</div>
	<div class="stat">Frame: {frame}</div>
	<div class="stat">Entities: {entityCount}</div>
	<hr />
	{#each Object.entries(systemTimings) as [name, ms]}
		<div class="timing">
			<span class="sys-name">{name}</span>
			<span class="sys-time">{ms.toFixed(2)}ms</span>
		</div>
	{/each}
</div>

<style>
	.debug {
		position: fixed;
		top: 4rem;
		right: 1rem;
		background: rgba(0, 0, 0, 0.85);
		border: 1px solid #333;
		border-radius: 6px;
		padding: 0.75rem;
		font-family: monospace;
		font-size: 0.75rem;
		color: #0f0;
		min-width: 180px;
		pointer-events: auto;
		z-index: 100;
	}

	.stat {
		margin-bottom: 0.2rem;
	}

	hr {
		border: none;
		border-top: 1px solid #333;
		margin: 0.4rem 0;
	}

	.timing {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.sys-name {
		color: #888;
	}

	.sys-time {
		color: #0f0;
	}
</style>
