<script lang="ts">
	import type { CommentaryLine, CommentaryTone } from '$lib/match/commentary/Commentator';

	let { lines = [] }: { lines?: CommentaryLine[] } = $props();

	const recent = $derived(lines.slice(-4));

	function toneColor(tone: CommentaryTone): string {
		switch (tone) {
			case 'finish':
				return '#ef4444';
			case 'big':
				return '#f59e0b';
			case 'hype':
				return '#8b5cf6';
			case 'color':
				return 'var(--text-secondary)';
			default:
				return 'var(--text-primary, #fff)';
		}
	}
</script>

<div class="commentary glass">
	{#each recent as line, i (line.id)}
		<div
			class="commentary-line"
			class:lead={i === recent.length - 1}
			class:big={line.tone === 'big' || line.tone === 'finish'}
			style="opacity: {0.45 + i * 0.18}; color: {toneColor(line.tone)}"
		>
			<span class="mic" style="background: {toneColor(line.tone)}"></span>
			<span class="text">{line.text}</span>
		</div>
	{/each}
</div>

<style>
	.commentary {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.7rem 1rem;
		border-radius: var(--radius-md);
		max-width: 720px;
		margin: 0 auto;
		max-height: 140px;
		overflow: hidden;
	}

	.commentary-line {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.9rem;
		line-height: 1.25;
		animation: fade-in 0.25s ease;
	}

	.commentary-line.lead {
		font-weight: 600;
	}

	.commentary-line.big.lead .text {
		font-family: var(--font-display, inherit);
		letter-spacing: 0.02em;
		text-shadow: 0 0 16px currentColor;
	}

	.mic {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		box-shadow: 0 0 8px currentColor;
	}

	.text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
