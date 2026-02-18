<script lang="ts">
	let { seconds = 0 }: { seconds: number } = $props();

	const formatted = $derived(() => {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	});
</script>

<div class="timer">{formatted()}</div>

<style>
	.timer {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		font-size: 1rem;
		color: #e0e0e0;
	}
</style>
