/**
 * Headless 1-Minute Demo Simulation
 *
 * Runs a complete match between Iron Mike Sterling (powerhouse) and
 * Phoenix Blade (highflyer) with full debug logging attached.
 *
 * Usage:
 *   npx tsx src/lib/match/engine/demo.ts
 *
 * Or import and call programmatically:
 *   import { runDemo } from './demo';
 *   const result = runDemo();
 */

import { MatchLoop, type WrestlerInput, type AgentPersonality } from './index';
import { ConsoleMatchDebugger } from './MatchDebugLogger';

// ─── Personality Presets ─────────────────────────────────────────────

const PERSONALITY_MAP: Record<string, AgentPersonality> = {
	powerhouse:   { strikePreference: 0.3, aggression: 0.7, riskTolerance: 0.2, reversalSkill: 0.3 },
	highflyer:    { strikePreference: 0.6, aggression: 0.6, riskTolerance: 0.9, reversalSkill: 0.5 },
	technician:   { strikePreference: 0.4, aggression: 0.3, riskTolerance: 0.3, reversalSkill: 0.9 },
	brawler:      { strikePreference: 0.8, aggression: 0.9, riskTolerance: 0.5, reversalSkill: 0.2 }
};

// ─── Wrestler Definitions ───────────────────────────────────────────

const wrestler1: WrestlerInput = {
	id: 'iron_mike',
	name: 'Iron Mike Sterling',
	health: 110,
	stamina: 90,
	personality: PERSONALITY_MAP.powerhouse,
	psychArchetype: 'powerhouse',
	color: '#1a1a2e',
	height: 1.95,
	build: 'heavy'
};

const wrestler2: WrestlerInput = {
	id: 'phoenix_blade',
	name: 'Phoenix Blade',
	health: 80,
	stamina: 110,
	personality: PERSONALITY_MAP.highflyer,
	psychArchetype: 'highflyer',
	color: '#ff6b35',
	height: 1.75,
	build: 'light'
};

// ─── Demo Runner ────────────────────────────────────────────────────

export function runDemo(options?: {
	seed?: number;
	timeLimit?: number;
	verbosity?: 'minimal' | 'normal' | 'verbose';
}) {
	const seed = options?.seed ?? 42;
	const timeLimit = options?.timeLimit ?? 60;
	const verbosity = options?.verbosity ?? 'normal';

	console.log('╔═══════════════════════════════════════════════════════╗');
	console.log('║       WWEAgents.FUN — Headless Match Simulation      ║');
	console.log('╚═══════════════════════════════════════════════════════╝');
	console.log(`  Seed:       ${seed}`);
	console.log(`  Time Limit: ${timeLimit}s`);
	console.log(`  Verbosity:  ${verbosity}`);
	console.log(`  Fighter 1:  ${wrestler1.name} (powerhouse, ${wrestler1.health}HP)`);
	console.log(`  Fighter 2:  ${wrestler2.name} (highflyer, ${wrestler2.health}HP)`);
	console.log('');

	// Create match loop
	const matchLoop = new MatchLoop({
		seed,
		timeLimit,
		tickRate: 60,
		wrestler1,
		wrestler2
	});

	// Attach debug logger
	const debugger_ = new ConsoleMatchDebugger({ verbosity });
	matchLoop.setDebugger(debugger_);

	// Run simulation
	const startTime = performance.now();
	let tickCount = 0;

	while (matchLoop.step()) {
		tickCount++;
		// Safety: prevent infinite loops
		if (tickCount > timeLimit * 60 + 600) {
			console.error('⚠️ Safety limit reached — aborting simulation.');
			break;
		}
	}

	const elapsedMs = performance.now() - startTime;

	// Print summary
	console.log(debugger_.getSummary());

	// Final state
	const state = matchLoop.state;
	const [a, b] = state.agents;

	console.log('\n┌─────────────── FINAL STATE ───────────────┐');
	console.log(`│ ${a.name.padEnd(20)} │ HP: ${a.health.toString().padStart(3)}/${a.maxHealth} │ STA: ${a.stamina.toFixed(0).padStart(3)}/${a.maxStamina} │ MOM: ${a.momentum.toFixed(0).padStart(3)} │`);
	console.log(`│ ${b.name.padEnd(20)} │ HP: ${b.health.toString().padStart(3)}/${b.maxHealth} │ STA: ${b.stamina.toFixed(0).padStart(3)}/${b.maxStamina} │ MOM: ${b.momentum.toFixed(0).padStart(3)} │`);
	console.log('└────────────────────────────────────────────┘');

	if (state.result) {
		console.log(`\n🏆 WINNER: ${state.result.winnerId} by ${state.result.method.toUpperCase()}`);
		console.log(`   Duration: ${state.result.duration.toFixed(1)}s | Rating: ${state.result.rating.toFixed(1)}/5.0`);
	}

	// Stats comparison
	console.log('\n┌─────────────── FIGHT STATS ───────────────┐');
	console.log(`│ ${''.padEnd(20)} │ ${a.name.substring(0, 10).padEnd(10)} │ ${b.name.substring(0, 10).padEnd(10)} │`);
	console.log(`│ ${'Moves Hit'.padEnd(20)} │ ${a.stats.movesHit.toString().padStart(10)} │ ${b.stats.movesHit.toString().padStart(10)} │`);
	console.log(`│ ${'Moves Missed'.padEnd(20)} │ ${a.stats.movesMissed.toString().padStart(10)} │ ${b.stats.movesMissed.toString().padStart(10)} │`);
	console.log(`│ ${'Damage Dealt'.padEnd(20)} │ ${a.stats.damageDealt.toString().padStart(10)} │ ${b.stats.damageDealt.toString().padStart(10)} │`);
	console.log(`│ ${'Damage Taken'.padEnd(20)} │ ${a.stats.damageTaken.toString().padStart(10)} │ ${b.stats.damageTaken.toString().padStart(10)} │`);
	console.log(`│ ${'Reversals'.padEnd(20)} │ ${a.stats.reversals.toString().padStart(10)} │ ${b.stats.reversals.toString().padStart(10)} │`);
	console.log(`│ ${'Knockdowns'.padEnd(20)} │ ${a.stats.knockdowns.toString().padStart(10)} │ ${b.stats.knockdowns.toString().padStart(10)} │`);
	console.log(`│ ${'Combos Started'.padEnd(20)} │ ${a.stats.combosStarted.toString().padStart(10)} │ ${b.stats.combosStarted.toString().padStart(10)} │`);
	console.log(`│ ${'Combos Completed'.padEnd(20)} │ ${a.stats.combosCompleted.toString().padStart(10)} │ ${b.stats.combosCompleted.toString().padStart(10)} │`);
	console.log(`│ ${'Combo Hits'.padEnd(20)} │ ${a.stats.comboHits.toString().padStart(10)} │ ${b.stats.comboHits.toString().padStart(10)} │`);
	console.log(`│ ${'Longest Combo'.padEnd(20)} │ ${a.stats.longestCombo.toString().padStart(10)} │ ${b.stats.longestCombo.toString().padStart(10)} │`);
	console.log('└────────────────────────────────────────────┘');

	// Match log highlights
	console.log('\n┌─────────────── MATCH LOG ─────────────────┐');
	const importantTypes = new Set(['move_hit', 'reversal', 'knockdown', 'comeback', 'emotion_change', 'match_start', 'match_end', 'taunt', 'combo_start', 'combo_hit', 'combo_complete', 'combo_break']);
	const highlights = state.log.filter(l => importantTypes.has(l.type));
	for (const entry of highlights) {
		const time = entry.elapsed.toFixed(1).padStart(5);
		const type = entry.type.toUpperCase().padEnd(16);
		console.log(`│ [${time}s] ${type} ${entry.detail.substring(0, 50)}`);
	}
	console.log('└────────────────────────────────────────────┘');

	console.log(`\n⏱️  Simulation completed in ${elapsedMs.toFixed(1)}ms (${tickCount} ticks, ${(tickCount / (elapsedMs / 1000)).toFixed(0)} ticks/sec)`);

	return {
		state,
		tickCount,
		elapsedMs,
		result: state.result
	};
}

// ─── CLI Entry Point ────────────────────────────────────────────────
// To run from CLI: npx tsx src/lib/match/engine/demo.ts [verbosity] [seed]
// This file can also be imported and called programmatically.
