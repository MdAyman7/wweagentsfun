<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		onReady?: (canvas: HTMLCanvasElement) => void;
		onResize?: (width: number, height: number) => void;
	}

	let { onReady, onResize }: Props = $props();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;

	onMount(() => {
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				canvas.width = width * devicePixelRatio;
				canvas.height = height * devicePixelRatio;
				canvas.style.width = `${width}px`;
				canvas.style.height = `${height}px`;
				onResize?.(width, height);
			}
		});
		resizeObserver.observe(container);

		onReady?.(canvas);

		return () => resizeObserver.disconnect();
	});
</script>

<div class="canvas-wrapper" bind:this={container}>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.canvas-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
