<script lang="ts">
	let { count = 0, visible = false }: { count: number; visible: boolean } = $props();
</script>

{#if visible && count > 0}
	<div class="pin-overlay">
		<span class="count">{count}</span>
	</div>
{/if}

<style>
	.pin-overlay {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.count {
		font-size: 8rem;
		font-weight: 900;
		color: white;
		text-shadow:
			0 0 30px rgba(233, 69, 96, 0.8),
			0 0 60px rgba(233, 69, 96, 0.4);
		animation: count-slam 0.3s ease-out;
	}

	@keyframes count-slam {
		from {
			transform: scale(2);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
