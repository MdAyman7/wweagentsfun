<script lang="ts">
	let { events = [] }: { events: Array<{ frame: number; type: string; detail: string }> } =
		$props();

	const recentEvents = $derived(events.slice(-5));

	function typeColor(type: string): string {
		switch (type.toLowerCase()) {
			case 'move_hit':
			case 'attack':
				return 'var(--accent)';
			case 'knockdown':
			case 'ko':
				return '#ef4444';
			case 'reversal':
				return '#8b5cf6';
			case 'comeback_trigger':
			case 'comeback':
				return '#f59e0b';
			case 'emotion_change':
				return '#22c55e';
			case 'taunt':
				return '#3b82f6';
			default:
				return 'var(--text-secondary)';
		}
	}
</script>

<div class="commentary glass">
	{#each recentEvents as event, i}
		<div class="commentary-line" style="opacity: {1 - i * 0.15}">
			<span
				class="event-badge"
				style="
					background: {typeColor(event.type)}22;
					color: {typeColor(event.type)};
					border-color: {typeColor(event.type)}44;
				"
			>
				{event.type.replace(/_/g, ' ')}
			</span>
			<span class="event-detail">{event.detail}</span>
		</div>
	{/each}
</div>

<style>
	.commentary {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.35rem;
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
		max-height: 130px;
		overflow: hidden;
	}

	.commentary-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		animation: fade-in 0.3s ease;
	}

	.event-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.45rem;
		border-radius: var(--radius-sm);
		border: 1px solid;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.event-detail {
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
