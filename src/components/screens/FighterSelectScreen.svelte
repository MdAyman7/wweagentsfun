<script lang="ts">
	import { setScreen, setMatchConfig } from '$lib/state/uiStore';
	import rosterData from '$lib/data/wrestlers/roster.json';
	import type { WrestlerDef } from '$lib/data/wrestlers/schema';

	const roster = rosterData as WrestlerDef[];

	let selectedIds = $state<string[]>([]);
	let matchType = $state('singles');

	const matchTypes = [
		{ id: 'singles', label: 'SINGLES' },
		{ id: 'no_dq', label: 'NO DQ' },
		{ id: 'iron_man', label: 'IRON MAN' }
	];

	const styleLabels: Record<string, string> = {
		powerhouse: 'Powerhouse',
		highflyer: 'High Flyer',
		technician: 'Technician',
		brawler: 'Brawler',
		psychologist: 'Psychologist',
		balanced: 'Lucha Libre'
	};

	function toggleWrestler(id: string) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter((w) => w !== id);
		} else if (selectedIds.length < 2) {
			selectedIds = [...selectedIds, id];
		}
	}

	function getSelectionIndex(id: string): number {
		return selectedIds.indexOf(id);
	}

	function startMatch() {
		if (selectedIds.length !== 2) return;
		setMatchConfig({
			wrestler1Id: selectedIds[0],
			wrestler2Id: selectedIds[1],
			matchType,
			seed: Math.floor(Math.random() * 999999)
		});
		setScreen('match');
	}

	function getStatValue(w: WrestlerDef, stat: 'strength' | 'speed' | 'technique'): number {
		return Math.round((w.stats[stat] / 100) * 100);
	}

	$effect(() => {
		// Prevent scrolling on this screen
	});
</script>

<div class="select screen-enter">
	<!-- Header -->
	<header class="header glass">
		<button class="back-btn glass-btn" onclick={() => setScreen('menu')}>
			<span class="back-arrow">&larr;</span>
		</button>
		<h1 class="header-title font-display">CHOOSE YOUR FIGHTERS</h1>
		<div class="match-type-toggle">
			{#each matchTypes as mt}
				<button
					class="type-chip"
					class:active={matchType === mt.id}
					onclick={() => (matchType = mt.id)}
				>
					{mt.label}
				</button>
			{/each}
		</div>
	</header>

	<!-- Fighter Grid -->
	<div class="grid-area">
		<div class="fighter-grid">
			{#each roster as wrestler, i}
				{@const selIdx = getSelectionIndex(wrestler.id)}
				{@const isSelected = selIdx >= 0}
				<button
					class="fighter-card glass-card"
					class:selected={isSelected}
					style="
						--fighter-color: {wrestler.appearance.primaryColor};
						--fighter-color-glow: {wrestler.appearance.primaryColor}66;
						animation-delay: {i * 0.05}s;
					"
					onclick={() => toggleWrestler(wrestler.id)}
				>
					<!-- Selection badge -->
					{#if isSelected}
						<div class="sel-badge" class:p1={selIdx === 0} class:p2={selIdx === 1}>
							{selIdx === 0 ? 'P1' : 'P2'}
						</div>
					{/if}

					<!-- Avatar -->
					<div class="avatar-ring">
						<div class="avatar" style="background: {wrestler.appearance.primaryColor}">
							<span class="avatar-initial">{wrestler.name[0]}</span>
						</div>
					</div>

					<!-- Info -->
					<div class="fighter-info">
						<span class="fighter-name">{wrestler.name}</span>
						<span class="fighter-nickname">"{wrestler.nickname}"</span>
						<span class="fighter-style badge badge-accent">
							{styleLabels[wrestler.personalityId] ?? wrestler.personalityId}
						</span>
					</div>

					<!-- Mini stats -->
					<div class="mini-stats">
						<div class="stat-row">
							<span class="stat-label font-mono">STR</span>
							<div class="stat-bar"><div class="stat-fill str" style="width: {getStatValue(wrestler, 'strength')}%"></div></div>
						</div>
						<div class="stat-row">
							<span class="stat-label font-mono">SPD</span>
							<div class="stat-bar"><div class="stat-fill spd" style="width: {getStatValue(wrestler, 'speed')}%"></div></div>
						</div>
						<div class="stat-row">
							<span class="stat-label font-mono">TEC</span>
							<div class="stat-bar"><div class="stat-fill tec" style="width: {getStatValue(wrestler, 'technique')}%"></div></div>
						</div>
					</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- Bottom Action Bar -->
	<footer class="action-bar glass">
		{#if selectedIds.length === 2}
			{@const w1 = roster.find((w) => w.id === selectedIds[0])}
			{@const w2 = roster.find((w) => w.id === selectedIds[1])}
			<div class="vs-display">
				<span class="vs-name" style="color: {w1?.appearance.primaryColor}">{w1?.name}</span>
				<span class="vs-text font-display">VS</span>
				<span class="vs-name" style="color: {w2?.appearance.primaryColor}">{w2?.name}</span>
			</div>
		{:else}
			<div class="vs-display">
				<span class="select-hint">Select {2 - selectedIds.length} more fighter{selectedIds.length === 1 ? '' : 's'}</span>
			</div>
		{/if}

		<button
			class="start-btn glass-btn glass-btn-primary"
			disabled={selectedIds.length !== 2}
			onclick={startMatch}
		>
			BEGIN MATCH
		</button>
	</footer>
</div>

<style>
	.select {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	/* ─── Header ─────────────────────────────────── */
	.header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		border-radius: 0;
		border-top: none;
		border-left: none;
		border-right: none;
		flex-shrink: 0;
		z-index: 2;
	}

	.back-btn {
		padding: 0.5rem 0.75rem;
		font-size: 1.2rem;
		border-radius: var(--radius-sm);
	}

	.back-arrow {
		display: block;
		line-height: 1;
	}

	.header-title {
		font-size: 1.8rem;
		margin: 0;
		flex: 1;
		letter-spacing: 0.06em;
	}

	.match-type-toggle {
		display: flex;
		gap: 0.25rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: var(--radius-pill);
		padding: 3px;
		border: 1px solid var(--glass-border);
	}

	.type-chip {
		padding: 0.4rem 0.9rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-pill);
		color: var(--text-secondary);
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}

	.type-chip.active {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.type-chip:hover:not(.active) {
		color: var(--text-primary);
	}

	/* ─── Grid ───────────────────────────────────── */
	.grid-area {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.fighter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	/* ─── Fighter Card ───────────────────────────── */
	.fighter-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1.5rem 1rem;
		cursor: pointer;
		text-align: center;
		color: var(--text-primary);
		animation: slide-up 0.4s var(--ease-out-expo) backwards;
	}

	.fighter-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: radial-gradient(
			ellipse at 50% 0%,
			var(--fighter-color-glow) 0%,
			transparent 60%
		);
		opacity: 0;
		transition: opacity var(--transition-normal) ease;
		pointer-events: none;
	}

	.fighter-card:hover::before {
		opacity: 0.3;
	}

	.fighter-card.selected {
		border-color: var(--fighter-color);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.1),
			0 0 20px var(--fighter-color-glow),
			var(--shadow-md);
		animation: glow-pulse 2s ease-in-out infinite;
	}

	.fighter-card.selected::before {
		opacity: 0.4;
	}

	/* Selection badge */
	.sel-badge {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		font-family: var(--font-display);
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-sm);
		z-index: 1;
	}

	.sel-badge.p1 {
		background: rgba(59, 130, 246, 0.25);
		color: #60a5fa;
		border: 1px solid rgba(59, 130, 246, 0.4);
	}

	.sel-badge.p2 {
		background: rgba(233, 69, 96, 0.25);
		color: #f472b6;
		border: 1px solid rgba(233, 69, 96, 0.4);
	}

	/* Avatar */
	.avatar-ring {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		padding: 3px;
		background: linear-gradient(135deg, var(--fighter-color), transparent 60%);
		transition: box-shadow var(--transition-normal) ease;
	}

	.fighter-card:hover .avatar-ring {
		box-shadow: 0 0 16px var(--fighter-color-glow);
	}

	.avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-initial {
		font-family: var(--font-display);
		font-size: 2rem;
		color: white;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
	}

	/* Info */
	.fighter-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		z-index: 1;
	}

	.fighter-name {
		font-weight: 700;
		font-size: 1rem;
	}

	.fighter-nickname {
		font-size: 0.8rem;
		color: var(--text-secondary);
		font-style: italic;
	}

	.fighter-style {
		margin-top: 0.2rem;
		align-self: center;
	}

	/* Mini stats */
	.mini-stats {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.25rem;
		z-index: 1;
	}

	.stat-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-label {
		font-size: 0.65rem;
		color: var(--text-muted);
		width: 2rem;
		text-align: right;
	}

	.stat-bar {
		flex: 1;
		height: 4px;
		background: var(--bar-track);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.stat-fill {
		height: 100%;
		border-radius: var(--radius-pill);
		transition: width 0.3s var(--ease-out-expo);
	}

	.stat-fill.str { background: linear-gradient(90deg, #ef4444, #f87171); }
	.stat-fill.spd { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
	.stat-fill.tec { background: linear-gradient(90deg, #22c55e, #4ade80); }

	/* ─── Action Bar ─────────────────────────────── */
	.action-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
		border-radius: 0;
		border-bottom: none;
		border-left: none;
		border-right: none;
		flex-shrink: 0;
		z-index: 2;
	}

	.vs-display {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.vs-name {
		font-family: var(--font-display);
		font-size: 1.3rem;
		letter-spacing: 0.04em;
	}

	.vs-text {
		font-size: 2rem;
		color: var(--accent);
		text-shadow: 0 0 20px var(--accent-glow);
	}

	.select-hint {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.start-btn {
		font-family: var(--font-display);
		font-size: 1.2rem;
		letter-spacing: 0.1em;
		padding: 0.8rem 2.5rem;
	}
</style>
