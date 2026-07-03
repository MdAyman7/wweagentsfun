import type { Fighter, ActionKind, MoveCategory, Archetype, MoveDef } from './types.ts';
import type { Rng } from './rng.ts';
import { getMove } from '../data/moves.ts';
import { clamp01, statFrac } from './util.ts';

export type MatchPhase = 'opening' | 'build' | 'signature' | 'finish' | 'climax';

export interface DecisionCtx {
	distance: number;
	phase: MatchPhase;
}

export interface Intent {
	kind: ActionKind;
	moveId?: string;
}

const ENGAGE_RANGE = 1.45;

/** Moves usable as a rope-run charge payoff. */
const RUN_MOVES = ['clothesline', 'big_boot', 'dropkick', 'crossbody', 'high_knee'];
/** Moves usable as a top-rope dive. */
const DIVE_MOVES = ['moonsault', 'frog_splash', 'senton', 'crossbody', 'dropkick'];

/** How eager each archetype is to run the ropes / fly off the top. */
function ringUsageAppetite(arch: Archetype): { run: number; dive: number } {
	switch (arch) {
		case 'highflyer': return { run: 1.2, dive: 3.2 };
		case 'showman': return { run: 1.1, dive: 1.6 };
		case 'brawler': return { run: 1.4, dive: 0.3 };
		case 'powerhouse': return { run: 1.3, dive: 0.15 };
		case 'technician': return { run: 0.8, dive: 0.5 };
		default: return { run: 1.0, dive: 0.8 };
	}
}

/** Per-archetype appetite for each move category (multiplier). */
function categoryWeight(arch: Archetype, cat: MoveCategory): number {
	const table: Record<Archetype, Partial<Record<MoveCategory, number>>> = {
		powerhouse: { strike: 0.9, grapple: 1.6, aerial: 0.2, submission: 0.4 },
		brawler: { strike: 1.6, grapple: 1.0, aerial: 0.3, submission: 0.3 },
		technician: { strike: 0.9, grapple: 1.2, aerial: 0.4, submission: 1.6 },
		highflyer: { strike: 1.0, grapple: 0.6, aerial: 1.8, submission: 0.3 },
		showman: { strike: 1.1, grapple: 1.0, aerial: 1.1, submission: 0.6 },
		allrounder: { strike: 1.1, grapple: 1.1, aerial: 0.9, submission: 0.8 }
	};
	return table[arch]?.[cat] ?? 1;
}

/** Later phases favour bigger, match-ending offense. */
function phaseWeight(phase: MatchPhase, move: MoveDef): number {
	const big = move.damage >= 12 || move.knockdown;
	switch (phase) {
		case 'opening': return big ? 0.5 : 1.4;
		case 'build': return big ? 1.0 : 1.0;
		case 'signature': return big ? 1.4 : 0.7;
		case 'finish':
		case 'climax': return big ? 1.7 : 0.5;
	}
}

const stamPct = (f: Fighter): number => clamp01(f.stamina / f.maxStamina);
const hpPct = (f: Fighter): number => clamp01(f.health / f.maxHealth);

function coverProbability(opp: Fighter, phase: MatchPhase): number {
	// Opportunistic covers are rare early (and get kicked out — near-falls);
	// real pins cluster late and after finishers.
	const base: Record<MatchPhase, number> = { opening: 0.02, build: 0.06, signature: 0.16, finish: 0.38, climax: 0.55 };
	const weakBonus = (1 - hpPct(opp)) * 0.3;
	return clamp01(base[phase] + weakBonus);
}

/** Block/dodge reaction to a telegraphed windup. Returns null to press on. */
function defensiveReaction(self: Fighter, rng: Rng): Intent | null {
	if (stamPct(self) < 0.1) return null;
	const skill = statFrac(self.def.stats.technique);
	const foot = statFrac(self.def.stats.speed);
	// Dodge favoured by speed, block by technique; hurt fighters cover up more.
	let dodge = 0.08 + foot * 0.35 + (1 - hpPct(self)) * 0.1;
	if (self.def.archetype === 'highflyer') dodge += 0.1;
	if (self.def.archetype === 'powerhouse') dodge -= 0.08;
	if (rng.chance(clamp01(dodge))) return { kind: 'dodge' };
	let block = 0.12 + skill * 0.22 + (1 - hpPct(self)) * 0.12;
	if (self.def.archetype === 'brawler') block -= 0.06;
	if (rng.chance(clamp01(block))) return { kind: 'block' };
	return null;
}

function categoryToKind(cat: MoveCategory): ActionKind {
	if (cat === 'grapple') return 'grapple';
	if (cat === 'aerial') return 'aerial';
	if (cat === 'signature') return 'signature';
	if (cat === 'finisher') return 'finisher';
	if (cat === 'submission') return 'submit';
	return 'strike';
}

/** Weighted pick of the best offensive move for the situation. */
function selectOffense(self: Fighter, opp: Fighter, ctx: DecisionCtx, rng: Rng): Intent {
	const oppDown = opp.stance === 'down' || opp.stance === 'getting_up';
	const candidates: MoveDef[] = [];
	const weights: number[] = [];

	const pool = [...self.def.moveIds];
	if (self.momentum >= 50) pool.push(self.def.signatureId);
	if (self.finisherReady) pool.push(self.def.finisherId);

	for (const id of pool) {
		const move = getMove(id);
		if (!move) continue;
		// Range gate (grounded opponent lets everything in).
		if (!oppDown && ctx.distance > move.range + 0.35) continue;
		// Can't afford it.
		if (move.staminaCost > self.stamina + 2) continue;
		// Submissions only make sense on a worn/grounded opponent.
		if (move.submission && !(oppDown || hpPct(opp) < 0.4)) continue;
		// Aerials need a standing (or downed) target and cost composure when tired.
		let w = categoryWeight(self.def.archetype, move.category) * phaseWeight(ctx.phase, move);
		if (move.category === 'finisher') w *= 6 + (1 - hpPct(opp)) * 6;
		if (move.category === 'signature') w *= 3;
		if (stamPct(self) < 0.35) w *= move.staminaCost > 8 ? 0.4 : 1;
		if (oppDown && move.knockdown) w *= 1.4;
		candidates.push(move);
		weights.push(Math.max(0.01, w));
	}

	if (candidates.length === 0) return { kind: 'approach' };
	const idx = rng.weightedIndex(weights);
	const move = candidates[idx];
	return { kind: categoryToKind(move.category), moveId: move.id };
}

/**
 * Decide the fighter's next intent. Called by MatchSim only when the fighter is
 * neutral (standing, no action in flight). Grounded/pinned handling lives in the sim.
 */
export function chooseAction(self: Fighter, opp: Fighter, ctx: DecisionCtx, rng: Rng): Intent {
	const oppDown = opp.stance === 'down' || opp.stance === 'getting_up';

	// Opponent grounded → finish, cover, fly, or (usually) back off and let them
	// up so the match stays a back-and-forth rather than a ground-and-pound.
	if (oppDown) {
		const close = ctx.distance < 1.5;
		if (self.finisherReady && hpPct(opp) < 0.55 && stamPct(self) > 0.15) {
			return close ? { kind: 'finisher', moveId: self.def.finisherId } : { kind: 'approach' };
		}
		if (close && rng.chance(coverProbability(opp, ctx.phase))) return { kind: 'cover' };
		// Go up top — the high-risk, high-reward ring spot.
		const appetite = ringUsageAppetite(self.def.archetype);
		const diveMoves = self.def.moveIds.filter((id) => DIVE_MOVES.includes(id));
		if (diveMoves.length && stamPct(self) > 0.3 && opp.stance === 'down') {
			const lateBonus = ctx.phase === 'signature' || ctx.phase === 'finish' || ctx.phase === 'climax' ? 1.6 : 1;
			if (rng.chance(clamp01(0.05 * appetite.dive * lateBonus))) {
				return { kind: 'climb', moveId: diveMoves[rng.int(0, diveMoves.length - 1)] };
			}
		}
		// In the finish/climax, press the advantage; otherwise let them rise.
		if ((ctx.phase === 'finish' || ctx.phase === 'climax') && ctx.distance > 1.4) return { kind: 'approach' };
		if (close && rng.chance(0.22)) return selectOffense(self, opp, ctx, rng);
		return rng.chance(0.5) ? { kind: 'retreat' } : { kind: 'idle' };
	}

	// React to a telegraphed attack.
	if (opp.actionPhase === 'windup' && ctx.distance < 2.2 && self.stance === 'standing') {
		const react = defensiveReaction(self, rng);
		if (react) return react;
	}

	// Showboat occasionally when dominant.
	if (self.momentum > 70 && stamPct(self) > 0.5 && ctx.distance > 2 && rng.chance(0.05)) {
		return { kind: 'taunt' };
	}

	// Run the ropes for a full-speed charge — classic spacing play.
	if (opp.stance === 'standing' && !opp.special && ctx.distance > 1.1 && stamPct(self) > 0.35) {
		const appetite = ringUsageAppetite(self.def.archetype);
		const runMoves = self.def.moveIds.filter((id) => RUN_MOVES.includes(id));
		if (runMoves.length && rng.chance(clamp01(0.035 * appetite.run))) {
			return { kind: 'rope_run', moveId: runMoves[rng.int(0, runMoves.length - 1)] };
		}
	}

	if (ctx.distance > ENGAGE_RANGE) {
		// Mix straight approaches with circling — square up like a real worker.
		return rng.chance(0.18) ? { kind: 'circle' } : { kind: 'approach' };
	}
	// In range: occasionally strafe for an angle instead of swinging.
	if (rng.chance(0.1)) return { kind: 'circle' };
	return selectOffense(self, opp, ctx, rng);
}
