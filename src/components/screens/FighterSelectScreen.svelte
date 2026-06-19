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
		balanced: 'All-Rounder'
	};

	function alignLabel(a: string): string {
		if (a === 'face') return 'FACE';
		if (a === 'heel') return 'HEEL';
		return 'WILDCARD';
	}

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

	function statVal(w: WrestlerDef, stat: 'strength' | 'speed' | 'technique'): number {
		return Math.round(w.stats[stat]);
	}

	const p1 = $derived(roster.find((w) => w.id === selectedIds[0]));
	const p2 = $derived(roster.find((w) => w.id === selectedIds[1]));
</script>

{#snippet portrait()}
	<svg class="fig" viewBox="0 0 64 64" aria-hidden="true">
		<circle class="fig-head" cx="32" cy="18.5" r="9.5" />
		<path class="fig-body" d="M12 60 Q13 39 24 33.5 Q28 31 32 31 Q36 31 40 33.5 Q51 39 52 60 Z" />
	</svg>
{/snippet}

<div class="select screen-enter">
	<div class="bg-grid" aria-hidden="true"></div>

	<!-- Header -->
	<header class="header glass">
		<button class="back-btn glass-btn" onclick={() => setScreen('menu')} aria-label="Back to menu">
			<span class="back-arrow">&larr;</span>
		</button>
		<div class="header-titles">
			<span class="header-kicker font-mono">SELECT YOUR FIGHTERS</span>
			<h1 class="header-title font-display">CHOOSE YOUR FIGHTERS</h1>
		</div>
		<div class="match-type-toggle">
			{#each matchTypes as mt}
				<button class="type-chip font-display" class:active={matchType === mt.id} onclick={() => (matchType = mt.id)}>
					{mt.label}
				</button>
			{/each}
		</div>
	</header>

	<!-- Roster grid -->
	<div class="grid-area">
		<div class="fighter-grid" class:has-two={selectedIds.length === 2}>
			{#each roster as wrestler, i}
				{@const selIdx = getSelectionIndex(wrestler.id)}
				<button
					class="fighter-card"
					class:selected={selIdx >= 0}
					class:slot1={selIdx === 0}
					class:slot2={selIdx === 1}
					style="
						--fighter-color: {wrestler.appearance.primaryColor};
						--fighter-color2: {wrestler.appearance.secondaryColor};
						--fighter-glow: {wrestler.appearance.primaryColor}66;
						animation-delay: {i * 0.04}s;
					"
					onclick={() => toggleWrestler(wrestler.id)}
				>
					<span class="card-accent" aria-hidden="true"></span>

					{#if selIdx >= 0}
						<span class="sel-flare">{selIdx === 0 ? 'P1' : 'P2'}</span>
					{/if}

					<div class="portrait">
						{@render portrait()}
						<span class="align-pip align-{wrestler.alignment}">{alignLabel(wrestler.alignment)}</span>
					</div>

					<div class="fc-name font-display">{wrestler.name}</div>
					<div class="fc-nick">"{wrestler.nickname}"</div>
					<div class="fc-style font-mono">{styleLabels[wrestler.personalityId] ?? wrestler.personalityId}</div>

					<div class="fc-stats">
						<div class="srow"><span class="slab font-mono">STR</span><span class="sbar"><span class="sfill str" style="width:{statVal(wrestler, 'strength')}%"></span></span></div>
						<div class="srow"><span class="slab font-mono">SPD</span><span class="sbar"><span class="sfill spd" style="width:{statVal(wrestler, 'speed')}%"></span></span></div>
						<div class="srow"><span class="slab font-mono">TEC</span><span class="sbar"><span class="sfill tec" style="width:{statVal(wrestler, 'technique')}%"></span></span></div>
					</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- VS bar -->
	<footer class="action-bar glass">
		<div class="vs-stage">
			<div class="vs-slot p1" class:filled={!!p1}>
				{#if p1}
					<div class="vs-port" style="--fighter-color:{p1.appearance.primaryColor};--fighter-color2:{p1.appearance.secondaryColor}">{@render portrait()}</div>
					<div class="vs-meta">
						<span class="vs-tag font-mono">P1</span>
						<span class="vs-name font-display">{p1.name}</span>
					</div>
				{:else}
					<span class="vs-empty font-display">P1</span>
				{/if}
			</div>

			<span class="vs-big font-display">VS</span>

			<div class="vs-slot p2" class:filled={!!p2}>
				{#if p2}
					<div class="vs-meta right">
						<span class="vs-tag font-mono">P2</span>
						<span class="vs-name font-display">{p2.name}</span>
					</div>
					<div class="vs-port" style="--fighter-color:{p2.appearance.primaryColor};--fighter-color2:{p2.appearance.secondaryColor}">{@render portrait()}</div>
				{:else}
					<span class="vs-empty font-display">P2</span>
				{/if}
			</div>
		</div>

		<button class="start-btn font-display" class:ready={selectedIds.length === 2} disabled={selectedIds.length !== 2} onclick={startMatch}>
			{selectedIds.length === 2 ? 'FIGHT!' : `SELECT ${2 - selectedIds.length} MORE`}
		</button>
	</footer>
</div>

<style>
	.select {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.bg-grid {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse 60% 50% at 50% -10%, rgba(233, 69, 96, 0.10), transparent 70%),
			linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
		background-size: 100% 100%, 44px 44px, 44px 44px;
		mask-image: linear-gradient(to bottom, #000 60%, transparent);
	}

	/* ─── Header ─────────────────────────────────── */
	.header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.7rem 1.25rem;
		border-radius: 0;
		border-top: none;
		border-left: none;
		border-right: none;
		flex-shrink: 0;
		z-index: 2;
	}

	.back-btn {
		padding: 0.45rem 0.7rem;
		font-size: 1.2rem;
		border-radius: var(--radius-sm);
	}

	.back-arrow { display: block; line-height: 1; }

	.header-titles { flex: 1; display: flex; flex-direction: column; }
	.header-kicker { font-size: 0.6rem; letter-spacing: 0.34em; color: var(--accent); opacity: 0.9; }
	.header-title { font-size: 1.7rem; margin: 0; letter-spacing: 0.05em; line-height: 1; }

	.match-type-toggle {
		display: flex;
		gap: 0.25rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: var(--radius-pill);
		padding: 3px;
		border: 1px solid var(--glass-border);
	}

	.type-chip {
		padding: 0.4rem 0.95rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-pill);
		color: var(--text-secondary);
		font-size: 0.95rem;
		letter-spacing: 0.08em;
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}
	.type-chip.active { background: var(--accent-soft); color: var(--accent); box-shadow: 0 0 12px var(--accent-glow); }
	.type-chip:hover:not(.active) { color: var(--text-primary); }

	/* ─── Grid ───────────────────────────────────── */
	.grid-area { flex: 1; overflow-y: auto; padding: 1.25rem; z-index: 1; }

	.fighter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 0.85rem;
		max-width: 1320px;
		margin: 0 auto;
	}

	/* dim unselected once both slots are full */
	.fighter-grid.has-two .fighter-card:not(.selected) { opacity: 0.45; filter: saturate(0.6); }

	/* ─── Card ───────────────────────────────────── */
	.fighter-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 1rem 0.85rem 0.85rem;
		cursor: pointer;
		text-align: center;
		color: var(--text-primary);
		background: linear-gradient(170deg, var(--bg-elevated), var(--bg-panel));
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		overflow: hidden;
		transition: transform var(--transition-fast) ease, border-color var(--transition-fast) ease,
			box-shadow var(--transition-fast) ease, opacity var(--transition-normal) ease;
		animation: slide-up 0.4s var(--ease-out-expo) backwards;
	}

	.card-accent {
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 4px;
		background: linear-gradient(90deg, transparent, var(--fighter-color), transparent);
	}

	.fighter-card::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse 80% 45% at 50% 0%, var(--fighter-glow), transparent 65%);
		opacity: 0;
		transition: opacity var(--transition-normal) ease;
		pointer-events: none;
	}

	.fighter-card:hover {
		transform: translateY(-4px);
		border-color: var(--fighter-color);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 22px var(--fighter-glow);
	}
	.fighter-card:hover::after { opacity: 0.6; }

	.fighter-card.selected {
		border-color: var(--fighter-color);
		box-shadow: 0 0 0 2px var(--fighter-color), 0 0 28px var(--fighter-glow);
	}
	.fighter-card.selected::after { opacity: 0.5; }
	.fighter-card.slot1 { box-shadow: 0 0 0 2px #3b82f6, 0 0 28px rgba(59, 130, 246, 0.5); border-color: #3b82f6; }
	.fighter-card.slot2 { box-shadow: 0 0 0 2px var(--accent), 0 0 28px var(--accent-glow); border-color: var(--accent); }

	.sel-flare {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 2;
		font-family: var(--font-display);
		font-size: 1rem;
		line-height: 1;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		letter-spacing: 0.06em;
	}
	.slot1 .sel-flare { background: #3b82f6; color: #fff; box-shadow: 0 0 14px rgba(59, 130, 246, 0.7); }
	.slot2 .sel-flare { background: var(--accent); color: #fff; box-shadow: 0 0 14px var(--accent-glow); }

	/* Portrait */
	.portrait {
		position: relative;
		width: 92px;
		height: 92px;
		border-radius: 50%;
		overflow: hidden;
		background:
			radial-gradient(circle at 50% 24%, color-mix(in srgb, var(--fighter-color) 82%, #fff 16%), transparent 55%),
			linear-gradient(160deg, var(--fighter-color), color-mix(in srgb, var(--fighter-color) 42%, #05060c));
		display: flex;
		align-items: flex-end;
		justify-content: center;
		border: 2px solid rgba(255, 255, 255, 0.12);
		margin-bottom: 0.2rem;
	}

	.fig { width: 100%; height: 100%; display: block; }
	.fig-head, .fig-body {
		fill: var(--fighter-color2, #fff);
		stroke: rgba(0, 0, 0, 0.35);
		stroke-width: 1.1;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
	}

	.align-pip {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		padding: 1px 6px;
		border-radius: 4px 4px 0 0;
		background: rgba(0, 0, 0, 0.6);
	}
	.align-face { color: #4ade80; }
	.align-heel { color: #f87171; }
	.align-tweener { color: #fbbf24; }

	.fc-name { font-size: 1.05rem; letter-spacing: 0.03em; line-height: 1; }
	.fc-nick { font-size: 0.68rem; color: var(--text-secondary); font-style: italic; min-height: 0.9rem; }
	.fc-style {
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--accent);
		text-transform: uppercase;
		margin-bottom: 0.15rem;
	}

	/* Stats */
	.fc-stats { width: 100%; display: flex; flex-direction: column; gap: 3px; margin-top: auto; }
	.srow { display: flex; align-items: center; gap: 0.45rem; }
	.slab { font-size: 0.55rem; color: var(--text-muted); width: 1.7rem; text-align: right; }
	.sbar { flex: 1; height: 5px; background: var(--bar-track); border-radius: var(--radius-pill); overflow: hidden; }
	.sfill { display: block; height: 100%; border-radius: var(--radius-pill); transition: width 0.4s var(--ease-out-expo); }
	.sfill.str { background: linear-gradient(90deg, #ef4444, #f87171); }
	.sfill.spd { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
	.sfill.tec { background: linear-gradient(90deg, #22c55e, #4ade80); }

	/* ─── VS / Action bar ────────────────────────── */
	.action-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 1.5rem;
		border-radius: 0;
		border-bottom: none;
		border-left: none;
		border-right: none;
		flex-shrink: 0;
		z-index: 2;
	}

	.vs-stage { display: flex; align-items: center; gap: 1.1rem; flex: 1; min-width: 0; }

	.vs-slot { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }
	.vs-slot.p2 { justify-content: flex-end; }

	.vs-port {
		width: 44px; height: 44px; flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		background: linear-gradient(160deg, var(--fighter-color), color-mix(in srgb, var(--fighter-color) 42%, #05060c));
		display: flex; align-items: flex-end; justify-content: center;
		border: 2px solid rgba(255, 255, 255, 0.15);
	}
	.p1 .vs-port { border-color: #3b82f6; }
	.p2 .vs-port { border-color: var(--accent); }

	.vs-meta { display: flex; flex-direction: column; min-width: 0; }
	.vs-meta.right { align-items: flex-end; }
	.vs-tag { font-size: 0.55rem; letter-spacing: 0.1em; }
	.p1 .vs-tag { color: #60a5fa; }
	.p2 .vs-tag { color: var(--accent); }
	.vs-name { font-size: 1.1rem; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 16ch; }

	.vs-empty { font-size: 1.1rem; color: var(--text-muted); opacity: 0.5; }

	.vs-big {
		font-size: 1.8rem;
		color: var(--accent);
		text-shadow: 0 0 18px var(--accent-glow);
		flex-shrink: 0;
	}

	.start-btn {
		flex-shrink: 0;
		font-size: 1.25rem;
		letter-spacing: 0.12em;
		padding: 0.7rem 2.4rem;
		border-radius: 10px;
		border: 1px solid var(--glass-border);
		background: var(--glass-bg);
		color: var(--text-muted);
		cursor: not-allowed;
		transition: all var(--transition-fast) ease;
	}
	.start-btn.ready {
		color: #fff;
		background: linear-gradient(100deg, var(--accent), var(--accent-dim));
		border-color: var(--accent);
		box-shadow: 0 0 24px var(--accent-glow);
		cursor: pointer;
		animation: glow-pulse 1.8s ease-in-out infinite;
	}
	.start-btn.ready:hover { transform: scale(1.04); }
</style>
