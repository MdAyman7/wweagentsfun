<script lang="ts">
	import type { WrestlerUIState } from '$lib/state/matchStore';

	let { wrestlers = [], matchTime = 0 }: { wrestlers: WrestlerUIState[]; matchTime: number } =
		$props();

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

		<!-- Timer -->
		<div class="timer-pill glass">
			<span class="timer-value font-mono">{formatTime(matchTime)}</span>
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

	/* ─── Timer ──────────────────────────────────── */
	.timer-pill {
		padding: 0.35rem 1rem;
		border-radius: var(--radius-pill);
		flex-shrink: 0;
		margin-top: 0.15rem;
	}

	.timer-value {
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
		letter-spacing: 0.05em;
	}
</style>
