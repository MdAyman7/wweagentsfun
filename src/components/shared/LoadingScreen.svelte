<script lang="ts">
	let { message = 'Loading...' }: { message: string } = $props();
</script>

<div class="loading">
	<div class="spinner"></div>
	<p>{message}</p>
</div>

<style>
	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 1rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: #e94560;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	p {
		color: #888;
		font-size: 0.9rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
