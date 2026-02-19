<script lang="ts">
	import type { WrestlerUIState } from '$lib/state/matchStore';

	let { wrestlers = [], matchTime = 0, matchNumber = 1, wrestler1Name = '', wrestler2Name = '' }: {
		wrestlers: WrestlerUIState[];
		matchTime: number;
		matchNumber?: number;
		wrestler1Name?: string;
		wrestler2Name?: string;
	} = $props();

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function healthPercent(w: WrestlerUIState): number {
		return Math.max(0, (w.health / w.healthMax) * 100);
	}

	function staminaPercent(w: WrestlerUIState): number {
		return Math.max(0, (w.stamina / w.staminaMax) * 100);
	}

	function momentumPercent(w: WrestlerUIState): number {
		return Math.max(0, Math.min(100, w.momentum));
	}

	function healthVariant(pct: number): string {
		if (pct > 60) return 'high';
		if (pct > 30) return 'mid';
		return 'low';
	}

	function emotionColor(emotion: string | undefined): string {
		switch (emotion) {
			case 'confident': return '#22c55e';
			case 'frustrated': return '#ef4444';
			case 'desperate': return '#f59e0b';
			case 'fired_up': return '#3b82f6';
			case 'focused': return '#8b5cf6';
			default: return '#888';
		}
	}
</script>

<div class="hud">
	{#if wrestlers.length >= 2}
		<!-- Player 1 Panel -->
		<div class="wrestler-panel glass left">
			<div class="panel-header">
				<span class="wrestler-name font-display">{wrestlers[0].name}</span>
				<div class="emotion-dot" style="background: {emotionColor(wrestlers[0].emotion)}" title={wrestlers[0].emotion ?? 'neutral'}></div>
			</div>

			<div class="bars">
				<div class="game-bar" title="Health">
					<div class="game-bar-fill health-{healthVariant(healthPercent(wrestlers[0]))}" style="width: {healthPercent(wrestlers[0])}%"></div>
				</div>
				<div class="game-bar small" title="Stamina">
					<div class="game-bar-fill stamina" style="width: {staminaPercent(wrestlers[0])}%"></div>
				</div>
				<div class="game-bar small" title="Momentum">
					<div class="game-bar-fill momentum" class:pulse={momentumPercent(wrestlers[0]) > 80} style="width: {momentumPercent(wrestlers[0])}%"></div>
				</div>
			</div>
		</div>

		<!-- Match Info Board -->
		<div class="match-info glass">
			<div class="match-title font-display">WWE AGENTS</div>
			<div class="match-number font-mono">MATCH #{matchNumber}</div>
			<div class="match-versus font-display">
				<span class="vs-name">{wrestler1Name || wrestlers[0].name}</span>
				<span class="vs-divider">VS</span>
				<span class="vs-name">{wrestler2Name || wrestlers[1].name}</span>
			</div>
			<div class="timer-value font-mono">{formatTime(matchTime)}</div>
		</div>

		<!-- Player 2 Panel -->
		<div class="wrestler-panel glass right">
			<div class="panel-header">
				<div class="emotion-dot" style="background: {emotionColor(wrestlers[1].emotion)}" title={wrestlers[1].emotion ?? 'neutral'}></div>
				<span class="wrestler-name font-display">{wrestlers[1].name}</span>
			</div>

			<div class="bars">
				<div class="game-bar" title="Health">
					<div class="game-bar-fill health-{healthVariant(healthPercent(wrestlers[1]))}" style="width: {healthPercent(wrestlers[1])}%"></div>
				</div>
				<div class="game-bar small" title="Stamina">
					<div class="game-bar-fill stamina" style="width: {staminaPercent(wrestlers[1])}%"></div>
				</div>
				<div class="game-bar small" title="Momentum">
					<div class="game-bar-fill momentum" class:pulse={momentumPercent(wrestlers[1]) > 80} style="width: {momentumPercent(wrestlers[1])}%"></div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.hud {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}

	/* ─── Panel ──────────────────────────────────── */
	.wrestler-panel {
		flex: 1;
		max-width: 320px;
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.right .panel-header {
		justify-content: flex-end;
	}

	.wrestler-name {
		font-size: 1.1rem;
		letter-spacing: 0.04em;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
	}

	.emotion-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		box-shadow: 0 0 6px currentColor;
	}

	/* ─── Bars ───────────────────────────────────── */
	.bars {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.game-bar {
		height: 10px;
		background: var(--bar-track);
		border-radius: var(--radius-pill);
		overflow: hidden;
		position: relative;
	}

	.game-bar.small {
		height: 5px;
	}

	.game-bar-fill {
		height: 100%;
		border-radius: var(--radius-pill);
		transition: width 0.2s ease;
		position: relative;
	}

	/* Health variants */
	.health-high {
		background: linear-gradient(90deg, #22c55e, #4ade80);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 8px rgba(34, 197, 94, 0.4);
	}

	.health-mid {
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 8px rgba(245, 158, 11, 0.4);
	}

	.health-low {
		background: linear-gradient(90deg, #ef4444, #f87171);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 8px rgba(239, 68, 68, 0.5);
		animation: bar-pulse 0.8s ease-in-out infinite;
	}

	.stamina {
		background: linear-gradient(90deg, #3b82f6, #60a5fa);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 6px rgba(59, 130, 246, 0.3);
	}

	.momentum {
		background: linear-gradient(90deg, var(--accent), #f472b6);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 6px var(--accent-glow);
	}

	.momentum.pulse {
		animation: bar-pulse 0.6s ease-in-out infinite;
	}

	.right .game-bar-fill {
		margin-left: auto;
	}

	/* ─── Match Info Board ───────────────────────── */
	.match-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem 1.2rem;
		border-radius: var(--radius-md);
		flex-shrink: 0;
		min-width: 180px;
		border: 1px solid rgba(255, 50, 80, 0.2);
		background: rgba(10, 5, 15, 0.7);
		backdrop-filter: blur(10px);
	}

	.match-title {
		font-size: 0.75rem;
		letter-spacing: 0.2em;
		color: #ff4466;
		text-shadow: 0 0 10px rgba(255, 68, 102, 0.5);
		font-weight: 700;
	}

	.match-number {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.5);
		letter-spacing: 0.1em;
		margin-bottom: 0.15rem;
	}

	.match-versus {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		margin-bottom: 0.2rem;
	}

	.vs-name {
		color: rgba(255, 255, 255, 0.8);
		letter-spacing: 0.03em;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vs-divider {
		color: #ff4466;
		font-weight: 700;
		font-size: 0.6rem;
		text-shadow: 0 0 8px rgba(255, 68, 102, 0.6);
	}

	.timer-value {
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
		letter-spacing: 0.05em;
	}
</style>
