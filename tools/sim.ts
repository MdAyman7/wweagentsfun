/**
 * Headless match runner. Prints a full play-by-play fight to the console.
 *
 *   npm run sim -- --seed 42 --w1 roman_reigns --w2 rey_mysterio
 *
 * Runs the pure simulation with no browser/THREE — the primary verification
 * that the fight logic, pin/near-falls, stamina and story arc all work.
 */
import { MatchSim } from '../src/lib/game/sim/MatchSim.ts';
import { getWrestler, ROSTER } from '../src/lib/game/data/roster.ts';

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const seed = parseInt(arg('seed', '42'), 10);
const id1 = arg('w1', 'roman_reigns');
const id2 = arg('w2', 'rey_mysterio');

const w1 = getWrestler(id1);
const w2 = getWrestler(id2);
if (!w1 || !w2) {
	console.error(`Unknown wrestler. Available: ${ROSTER.map((w) => w.id).join(', ')}`);
	process.exit(1);
}

function fmt(tick: number): string {
	const s = Math.floor(tick / 60);
	return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const sim = new MatchSim(w1, w2, { seed });

console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  ${w1.name}  (${w1.archetype}, STR ${w1.stats.strength})`);
console.log(`      vs`);
console.log(`  ${w2.name}  (${w2.archetype}, STR ${w2.stats.strength})`);
console.log(`  seed ${seed}`);
console.log('══════════════════════════════════════════════════════════════\n');

sim.run();

// Play-by-play
for (const e of sim.events) {
	if (e.type === 'phase') { console.log(`\n${e.text}`); continue; }
	console.log(`  [${fmt(e.tick)}] ${e.text}`);
}

// Summary
const r = sim.result!;
const [a, b] = sim.fighters;
console.log('\n──────────────────────────── RESULT ─────────────────────────');
console.log(`  Winner : ${sim.fighters[r.winner!].def.name}  —  by ${r.method}`);
console.log(`  Rating : ${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5 - Math.round(r.rating))}  (${r.rating})`);
console.log(`  Time   : ${fmt(r.durationTicks)}`);
console.log('──────────────────────────────────────────────────────────────');
for (const f of [a, b]) {
	const hp = Math.round((f.health / f.maxHealth) * 100);
	const st = Math.round((f.stamina / f.maxStamina) * 100);
	console.log(
		`  ${f.def.name.padEnd(18)} HP ${String(hp).padStart(3)}%  STA ${String(st).padStart(3)}%  ` +
		`landed ${f.tally.movesLanded}  rev ${f.tally.reversals}  sig ${f.tally.signatures}  ` +
		`fin ${f.tally.finishers}  near-falls ${f.tally.nearFalls}  kickouts ${f.kickouts}  maxCombo ${f.tally.longestCombo}`
	);
}
console.log('──────────────────────────────────────────────────────────────\n');
