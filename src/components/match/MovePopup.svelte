<script lang="ts">
	let { moveName = '', visible = false }: { moveName: string; visible: boolean } = $props();
</script>

{#if visible}
	<div class="popup">
		<span class="move-name">{moveName}</span>
	</div>
{/if}

<style>
	.popup {
		position: fixed;
		top: 40%;
		left: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
		animation: popup-in 0.3s ease-out forwards, popup-out 0.3s ease-in 1.5s forwards;
	}

	.move-name {
		font-size: 2.5rem;
		font-weight: 900;
		color: white;
		text-shadow:
			0 0 20px #e94560,
			0 0 40px #e94560,
			2px 2px 0 #000;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	@keyframes popup-in {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.5);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	@keyframes popup-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
</style>
