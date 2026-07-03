import type {
	WrestlerDef, Fighter, MatchEvent, MatchEventType, MatchResult, MatchSnapshot, WinMethod, BodyRegion
} from './types.ts';
import { Rng } from './rng.ts';
import { getMove } from '../data/moves.ts';
import { resolveAttack, computeDamage } from './CombatResolver.ts';
import { chooseAction, type MatchPhase, type Intent } from './ai.ts';
import { clamp, clamp01, statFrac } from './util.ts';

const HZ = 60;
/** Usable ring half-extent — matches the rendered ring so rope bounces and
 *  turnbuckle climbs line up visually. */
const RING_HALF = 2.7;
const MIN_SEP = 0.6;
const PIN_INTERVAL = 50; // ~0.83s per ref count

export interface MatchOptions {
	seed?: number;
	timeLimit?: number; // seconds
}

const hpPct = (f: Fighter): number => clamp01(f.health / f.maxHealth);
const stamPct = (f: Fighter): number => clamp01(f.stamina / f.maxStamina);
/** 2D ring distance between two fighters. */
const dist2 = (a: Fighter, b: Fighter): number => Math.hypot(a.posX - b.posX, a.posZ - b.posZ);

export class MatchSim {
	readonly fighters: [Fighter, Fighter];
	readonly events: MatchEvent[] = [];
	tick = 0;
	running = true;
	result: MatchResult | null = null;
	phase: MatchPhase = 'opening';
	crowd = 0.25;

	private rng: Rng;
	private timeLimit: number;
	private pin: { attacker: 0 | 1; defender: 0 | 1; count: number; timer: number } | null = null;
	private sub: { holder: 0 | 1; victim: 0 | 1 } | null = null;
	private pendingCover: (0 | 1) | null = null; // fighter should cover after a finisher

	constructor(w1: WrestlerDef, w2: WrestlerDef, opts: MatchOptions = {}) {
		this.rng = new Rng(opts.seed ?? 1);
		this.timeLimit = opts.timeLimit ?? 720;
		this.fighters = [this.makeFighter(w1, 0), this.makeFighter(w2, 1)];
		this.emit('bell', undefined, `The bell rings — ${w1.name} vs ${w2.name}!`);
	}

	private makeFighter(def: WrestlerDef, slot: 0 | 1): Fighter {
		return {
			def, slot,
			health: def.stats.health, maxHealth: def.stats.health,
			stamina: def.stats.stamina, maxStamina: def.stats.stamina,
			momentum: 0,
			limb: { head: 0, body: 0, legs: 0, arms: 0 },
			posX: slot === 0 ? -1.4 : 1.4,
			posZ: 0,
			facing: slot === 0 ? 1 : -1,
			special: null,
			circleDir: slot === 0 ? 1 : -1,
			stance: 'standing',
			phaseTimer: 0, decisionCd: this.rng?.int(20, 50) ?? 30,
			action: null, actionPhase: null, activeMoveId: null,
			comboCount: 0, finisherReady: false, submitPressure: 0, kickouts: 0, pinVulnerable: 0,
			emotion: 'calm',
			tally: { damageDealt: 0, movesLanded: 0, movesMissed: 0, reversals: 0, signatures: 0, finishers: 0, nearFalls: 0, longestCombo: 0 }
		};
	}

	// ─── Public API ────────────────────────────────────────────────────

	/** Advance one 60 Hz tick. */
	step(): void {
		if (!this.running) return;
		this.tick++;

		this.updatePhase();
		this.regen();

		if (this.sub) {
			this.updateSubmission();
		} else if (this.pin) {
			this.updatePin();
		} else {
			this.updateFighter(0);
			this.updateFighter(1);
		}

		this.updateMovement();
		this.crowd = clamp01(this.crowd - 0.004);
		this.checkWin();
	}

	/** Run to completion (headless). Returns the result. */
	run(maxTicks = HZ * 900): MatchResult {
		while (this.running && this.tick < maxTicks) this.step();
		if (!this.result) this.finish(this.leader(), 'timeout');
		return this.result!;
	}

	snapshot(): MatchSnapshot {
		return {
			tick: this.tick,
			elapsed: this.tick / HZ,
			phase: this.phase,
			fighters: this.fighters,
			pinCount: this.pin?.count ?? 0,
			pinAttacker: this.pin?.attacker ?? null,
			running: this.running,
			result: this.result,
			crowd: this.crowd
		};
	}

	// ─── Story-arc director ────────────────────────────────────────────

	private updatePhase(): void {
		const minHp = Math.min(hpPct(this.fighters[0]), hpPct(this.fighters[1]));
		const elapsed = this.tick / HZ;
		const anyKickout = this.fighters[0].kickouts + this.fighters[1].kickouts > 0;
		let next: MatchPhase;
		if (minHp < 0.2 || (anyKickout && minHp < 0.35)) next = 'climax';
		else if (minHp < 0.4) next = 'finish';
		else if (elapsed > 45 || minHp < 0.65) next = 'signature';
		else if (elapsed > 15 || minHp < 0.85) next = 'build';
		else next = 'opening';
		if (next !== this.phase) {
			this.phase = next;
			this.emit('phase', undefined, `— ${next.toUpperCase()} —`);
		}
	}

	private regen(): void {
		for (const f of this.fighters) {
			if (f.stance === 'pinned' || f.stance === 'submission') continue;
			const acting = f.action && f.action !== 'idle';
			const rate = acting ? 0.02 : f.stance === 'down' ? 0.08 : 0.06;
			f.stamina = clamp(f.stamina + f.maxStamina * rate / HZ * (acting ? 1 : 4), 0, f.maxStamina);
			f.momentum = clamp(f.momentum - 0.045, 0, 100);
			if (f.pinVulnerable > 0) f.pinVulnerable--;
			const opp = this.fighters[1 - f.slot];
			if (!f.finisherReady && (f.momentum >= 95 || (hpPct(opp) < 0.25 && f.momentum >= 60))) {
				f.finisherReady = true;
				this.emit('emotion', f.slot, `${f.def.name} is calling for the finish!`, { finisher: 1 });
			}
			this.updateEmotion(f);
		}
	}

	// ─── Per-fighter action state machine ──────────────────────────────

	private updateFighter(slot: 0 | 1): void {
		const f = this.fighters[slot];
		const opp = this.fighters[1 - slot];

		// Being covered / held — the pin & submission systems own this fighter.
		if (f.stance === 'pinned' || f.stance === 'submission') return;

		// Rope run / top-rope dive in flight.
		if (f.special) {
			this.updateSpecial(slot);
			return;
		}

		// Downed / recovering.
		if (f.stance === 'down' || f.stance === 'getting_up' || f.stance === 'groggy') {
			if (f.phaseTimer > 0) f.phaseTimer--;
			if (f.phaseTimer <= 0) {
				if (f.stance === 'down') { f.stance = 'getting_up'; f.phaseTimer = 26; }
				else { f.stance = 'standing'; f.decisionCd = this.rng.int(4, 12); }
			}
			return;
		}

		// Mid-action: attacks advance windup → active → recovery; timed actions
		// (block/dodge/circle/approach/taunt) commit for their full duration.
		if (f.action && (f.actionPhase || f.phaseTimer > 0)) {
			if (f.phaseTimer > 0) f.phaseTimer--;
			if (f.phaseTimer <= 0) this.advanceActionPhase(slot);
			return;
		}

		// Neutral: decide.
		if (f.decisionCd > 0) { f.decisionCd--; return; }
		const intent = chooseAction(f, opp, { distance: dist2(f, opp), phase: this.phase }, this.rng);
		this.startIntent(slot, intent);
	}

	// ─── Rope runs & top-rope dives ────────────────────────────────────

	private updateSpecial(slot: 0 | 1): void {
		const f = this.fighters[slot];
		const opp = this.fighters[1 - slot];
		const sp = f.special!;

		if (sp.kind === 'rope_run') {
			const speed = 0.075 + statFrac(f.def.stats.speed) * 0.03; // sprint — ~2.5× walking
			f.posX += sp.dirX * speed;
			f.posZ += sp.dirZ * speed;
			const atRopes = Math.abs(f.posX) >= RING_HALF || Math.abs(f.posZ) >= RING_HALF;
			f.posX = clamp(f.posX, -RING_HALF, RING_HALF);
			f.posZ = clamp(f.posZ, -RING_HALF, RING_HALF);

			if (sp.stage === 'out') {
				if (atRopes) {
					// Hit the ropes — spring back toward the opponent with momentum.
					sp.stage = 'back';
					const dx = opp.posX - f.posX, dz = opp.posZ - f.posZ;
					const len = Math.hypot(dx, dz) || 1;
					sp.dirX = dx / len; sp.dirZ = dz / len;
					f.momentum = clamp(f.momentum + 5, 0, 100);
					this.crowd = clamp01(this.crowd + 0.06);
					this.emit('rope_bounce', slot, `${f.def.name} bounces off the ropes!`);
				}
				return;
			}

			// Charging back — track the opponent lightly, hit on contact.
			const dx = opp.posX - f.posX, dz = opp.posZ - f.posZ;
			const d = Math.hypot(dx, dz);
			const len = d || 1;
			sp.dirX = sp.dirX * 0.82 + (dx / len) * 0.18;
			sp.dirZ = sp.dirZ * 0.82 + (dz / len) * 0.18;
			const n = Math.hypot(sp.dirX, sp.dirZ) || 1;
			sp.dirX /= n; sp.dirZ /= n;

			if (d < 1.05) {
				// Contact — deliver the running move with a charge bonus.
				f.special = null;
				f.action = null;
				this.resolveRunningHit(slot, sp.moveId);
				return;
			}
			// Only pull up when actually driving INTO a boundary — sliding along
			// the rope line while chasing is fine.
			const drivingOut =
				(f.posX >= RING_HALF && sp.dirX > 0.05) || (f.posX <= -RING_HALF && sp.dirX < -0.05) ||
				(f.posZ >= RING_HALF && sp.dirZ > 0.05) || (f.posZ <= -RING_HALF && sp.dirZ < -0.05);
			if (drivingOut) {
				// Ran the gauntlet and nobody home — pull up, winded.
				f.special = null;
				f.action = null;
				f.decisionCd = this.rng.int(14, 26);
				f.stamina = clamp(f.stamina - 4, 0, f.maxStamina);
				this.emit('move_miss', slot, `${f.def.name}'s charge comes up empty!`);
			}
			return;
		}

		// ── Top-rope dive ──
		sp.t++;
		const k = clamp01(sp.t / sp.total);
		if (sp.stage === 'climb') {
			// Walk/climb up into the corner.
			f.posX = sp.fromX + (sp.cornerX - sp.fromX) * k;
			f.posZ = sp.fromZ + (sp.cornerZ - sp.fromZ) * k;
			if (sp.t >= sp.total) {
				sp.stage = 'perch'; sp.t = 0; sp.total = 14;
				this.crowd = clamp01(this.crowd + 0.15);
				this.emit('climb', slot, `${f.def.name} is up top — the crowd rises!`);
			}
			return;
		}
		if (sp.stage === 'perch') {
			if (sp.t >= sp.total) {
				// Launch! Aim at where the opponent is right now.
				sp.stage = 'air'; sp.t = 0; sp.total = 26;
				sp.fromX = f.posX; sp.fromZ = f.posZ;
				sp.targetX = clamp(opp.posX, -RING_HALF, RING_HALF);
				sp.targetZ = clamp(opp.posZ, -RING_HALF, RING_HALF);
				const move = getMove(sp.moveId);
				this.emit('dive', slot, `${f.def.name} FLIES OFF THE TOP with the ${move?.name ?? 'dive'}!`);
			}
			return;
		}
		// In the air — travel the arc; land and resolve.
		f.posX = sp.fromX + (sp.targetX - sp.fromX) * k;
		f.posZ = sp.fromZ + (sp.targetZ - sp.fromZ) * k;
		if (sp.t >= sp.total) {
			f.special = null;
			f.action = null;
			this.resolveDiveLanding(slot, sp.moveId);
		}
	}

	/** A rope-run charge connects (or gets countered) at full speed. */
	private resolveRunningHit(slot: 0 | 1, moveId: string): void {
		const att = this.fighters[slot];
		const def = this.fighters[1 - slot];
		const move = getMove(moveId);
		if (!move) return;

		// A read opponent can dodge the charge — riskier than a standing strike.
		const dodgeP = def.stance === 'standing'
			? clamp(0.1 + statFrac(def.def.stats.speed) * 0.22 - statFrac(att.def.stats.speed) * 0.08, 0.05, 0.35)
			: 0;
		if (this.rng.chance(dodgeP)) {
			att.stance = 'groggy'; att.phaseTimer = this.rng.int(16, 30);
			att.tally.movesMissed++;
			this.crowd = clamp01(this.crowd + 0.12);
			this.emit('dodge', def.slot, `${def.def.name} sidesteps the charge — ${att.def.name} eats the ropes!`);
			return;
		}

		// A composed defender can counter the charge (leapfrog/drop-down into a slam).
		if (def.stance === 'standing') {
			const counterP = clamp(0.05 + statFrac(def.def.stats.technique) * 0.14, 0.05, 0.2);
			if (this.rng.chance(counterP)) {
				const rev = computeDamage(def, att, move, this.rng);
				const dmg = Math.max(1, Math.round(rev.dmg * 0.7));
				this.applyDamage(att, dmg, 'body');
				def.momentum = clamp(def.momentum + 12, 0, 100);
				def.tally.reversals++;
				this.crowd = clamp01(this.crowd + 0.2);
				this.emit('reversal', def.slot, `${def.def.name} catches the charge and plants ${att.def.name}!`, { damage: dmg });
				this.knockdown(slot, att.health <= 0);
				return;
			}
		}

		const { dmg: base, crit } = computeDamage(att, def, move, this.rng);
		const dmg = Math.max(1, Math.round(base * 1.35));
		this.applyDamage(def, dmg, move.region);
		att.momentum = clamp(att.momentum + move.momentum + 6, 0, 100);
		att.comboCount++;
		att.tally.movesLanded++;
		att.tally.damageDealt += dmg;
		this.crowd = clamp01(this.crowd + 0.2);
		this.emit('move_hit', slot, `${att.def.name} charges in — running ${move.name}${crit ? ' — flush!' : ''} (${dmg})!`, { move: move.id, damage: dmg, running: true });
		// Full-steam impact puts people down far more often.
		if (this.rng.chance(0.75) || def.health <= 0) this.knockdown(def.slot, def.health <= 0);
		else this.stagger(def.slot);
	}

	/** The dive lands — flush on a grounded foe, or nobody home. */
	private resolveDiveLanding(slot: 0 | 1, moveId: string): void {
		const att = this.fighters[slot];
		const def = this.fighters[1 - slot];
		const move = getMove(moveId);
		if (!move) return;

		const d = dist2(att, def);
		// Even a grounded opponent can roll out of the way at the last second.
		const grounded = (def.stance === 'down' || def.stance === 'getting_up' || def.stance === 'pinned') && this.rng.chance(0.82);
		const groggy = def.stance === 'groggy';
		// Standing, alert opponents step aside more often than not.
		const connects =
			(grounded && d < 1.25) ||
			(groggy && d < 1.15 && this.rng.chance(0.8)) ||
			(def.stance === 'standing' && d < 1.1 && this.rng.chance(0.4));

		if (connects) {
			// Same damage model as everything else, with a top-rope premium.
			const { dmg: base } = computeDamage(att, def, move, this.rng);
			const dmg = Math.max(1, Math.round(base * 1.3));
			this.applyDamage(def, dmg, move.region);
			att.momentum = clamp(att.momentum + move.momentum + 10, 0, 100);
			att.tally.movesLanded++;
			att.tally.damageDealt += dmg;
			// A dive only opens a real pin window once the opponent is worn.
			if (hpPct(def) < 0.55) def.pinVulnerable = Math.max(def.pinVulnerable, 100);
			this.crowd = clamp01(this.crowd + 0.4);
			this.emit('dive_hit', slot, `${att.def.name} CRUSHES ${def.def.name} from the top rope (${dmg})!`, { move: move.id, damage: dmg });
			if (def.stance !== 'down') this.knockdown(def.slot, def.health <= 0);
			else def.phaseTimer = Math.max(def.phaseTimer, 70); // flattened — stays down
			// Diver often hooks the leg right off the impact.
			if (this.rng.chance(0.65)) this.startCover(slot);
			else att.decisionCd = this.rng.int(12, 24);
			return;
		}

		// NOBODY HOME — crash and burn.
		const selfDmg = 6 + this.rng.int(0, 6);
		this.applyDamage(att, selfDmg, 'body');
		att.tally.movesMissed++;
		def.momentum = clamp(def.momentum + 14, 0, 100);
		this.crowd = clamp01(this.crowd + 0.3);
		this.emit('dive_crash', slot, `NOBODY HOME! ${att.def.name} crashes and burns!`, { damage: selfDmg });
		this.knockdown(slot, false);
	}

	private startIntent(slot: 0 | 1, intent: Intent): void {
		const f = this.fighters[slot];
		const opp = this.fighters[1 - slot];
		switch (intent.kind) {
			case 'idle': f.action = null; f.actionPhase = null; f.decisionCd = this.rng.int(14, 30); return;
			case 'approach': f.action = 'approach'; f.actionPhase = null; f.phaseTimer = 8; return;
			case 'retreat': f.action = 'retreat'; f.actionPhase = null; f.phaseTimer = 10; return;
			case 'circle':
				f.action = 'circle'; f.actionPhase = null;
				f.circleDir = this.rng.chance(0.5) ? 1 : -1;
				f.phaseTimer = this.rng.int(26, 60);
				return;
			case 'block': f.action = 'block'; f.actionPhase = null; f.phaseTimer = 24; return;
			case 'dodge':
				f.action = 'dodge'; f.actionPhase = null;
				f.circleDir = this.rng.chance(0.5) ? 1 : -1; // sidestep direction
				f.phaseTimer = 16;
				return;
			case 'rope_run': {
				// Sprint away from the opponent to the ropes, then charge back.
				let ax = f.posX - opp.posX, az = f.posZ - opp.posZ;
				let len = Math.hypot(ax, az) || 1;
				ax /= len; az /= len;
				// Already backed against those ropes? Run across the ring instead.
				const nextEdge = Math.min(
					edgeDistance(f.posX, f.posZ, ax, az),
					RING_HALF * 2
				);
				if (nextEdge < 1.0) { ax = -ax; az = -az; }
				f.action = 'rope_run'; f.actionPhase = null;
				f.special = { kind: 'rope_run', stage: 'out', dirX: ax, dirZ: az, moveId: intent.moveId! };
				this.emit('rope_run', slot, `${f.def.name} takes off to the ropes!`);
				return;
			}
			case 'climb': {
				// Head for the nearest corner and go up top.
				const cx = f.posX >= 0 ? RING_HALF : -RING_HALF;
				const cz = f.posZ >= 0 ? RING_HALF : -RING_HALF;
				const travel = Math.hypot(cx - f.posX, cz - f.posZ);
				f.action = 'climb'; f.actionPhase = null;
				f.special = {
					kind: 'dive', stage: 'climb', cornerX: cx, cornerZ: cz, moveId: intent.moveId!,
					t: 0, total: Math.round(26 + travel * 14), fromX: f.posX, fromZ: f.posZ, targetX: 0, targetZ: 0
				};
				this.emit('climb', slot, `${f.def.name} heads for the turnbuckle!`);
				return;
			}
			case 'taunt':
				f.action = 'taunt'; f.actionPhase = null; f.phaseTimer = 36;
				f.momentum = clamp(f.momentum + 12, 0, 100);
				this.crowd = clamp01(this.crowd + 0.08);
				this.emit('taunt', slot, `${f.def.name} plays to the crowd.`);
				return;
			case 'cover': this.startCover(slot); return;
			case 'strike': case 'grapple': case 'aerial': case 'signature': case 'finisher': case 'submit':
				this.startAttack(slot, intent.moveId!); return;
			default:
				f.decisionCd = 8; return;
		}
	}

	private startAttack(slot: 0 | 1, moveId: string): void {
		const f = this.fighters[slot];
		const move = getMove(moveId);
		if (!move) { f.decisionCd = 6; return; }
		if (move.staminaCost > f.stamina + 2) { f.decisionCd = 10; return; }
		f.stamina = clamp(f.stamina - move.staminaCost, 0, f.maxStamina);
		const speedFrac = statFrac(f.def.stats.speed);
		const fatigue = 1 + (1 - stamPct(f)) * 0.4;
		f.action = intentKindFor(move.category);
		f.actionPhase = 'windup';
		f.activeMoveId = moveId;
		f.phaseTimer = Math.max(2, Math.round(move.windup * (1.15 - speedFrac * 0.35) * fatigue));
	}

	private advanceActionPhase(slot: 0 | 1): void {
		const f = this.fighters[slot];
		const move = f.activeMoveId ? getMove(f.activeMoveId) : null;
		if (!f.actionPhase) return;

		if (f.actionPhase === 'windup' && move) {
			f.actionPhase = 'active';
			f.phaseTimer = Math.max(1, move.active);
			this.resolveActiveHit(slot);
		} else if (f.actionPhase === 'active' && move) {
			f.actionPhase = 'recovery';
			const fatigue = 1 + (1 - stamPct(f)) * 0.4;
			f.phaseTimer = Math.max(3, Math.round(move.recovery * fatigue));
		} else {
			// Recovery done (or a non-attack timed action finished).
			const wasMovement = f.action === 'approach' || f.action === 'retreat' || f.action === 'circle';
			f.action = null; f.actionPhase = null; f.activeMoveId = null;
			// Movement flows straight into the next read; combat takes a beat.
			f.decisionCd = wasMovement ? this.rng.int(1, 4) : this.rng.int(10, 24);
			// Auto-cover after a finisher lands.
			if (this.pendingCover === slot) { this.pendingCover = null; this.startCover(slot); }
		}
	}

	private resolveActiveHit(slot: 0 | 1): void {
		const att = this.fighters[slot];
		const def = this.fighters[1 - slot];
		const move = att.activeMoveId ? getMove(att.activeMoveId) : null;
		if (!move) return;

		// A defender flying off the top rope can't be punched out of the air here.
		if (def.special?.kind === 'dive' && def.special.stage === 'air') {
			att.tally.movesMissed++;
			this.emit('move_miss', slot, `${att.def.name} swings at empty air!`, { move: move.id });
			return;
		}

		// Range check at contact — dodged footwork / spacing makes it whiff.
		const dist = dist2(att, def);
		if (dist > move.range + 0.5 && def.stance === 'standing') {
			att.comboCount = 0; att.tally.movesMissed++;
			this.emit('move_miss', slot, `${att.def.name} misses the ${move.name}.`, { move: move.id });
			return;
		}

		// Submissions branch off into a hold rather than a strike.
		if (move.submission && (def.stance === 'down' || def.stance === 'getting_up' || hpPct(def) < 0.45)) {
			this.startSubmission(slot, move.id);
			return;
		}

		const out = resolveAttack(att, def, move, this.rng);
		if (out.result === 'blocked') {
			this.applyDamage(def, out.damage, move.region);
			att.comboCount = 0;
			this.emit('block', def.slot, `${def.def.name} blocks the ${move.name}.`, { move: move.id });
			return;
		}
		if (out.result === 'dodged') {
			att.comboCount = 0; att.tally.movesMissed++;
			this.emit('dodge', def.slot, `${def.def.name} slips away from the ${move.name}!`, { move: move.id });
			return;
		}
		if (out.result === 'reversed') {
			this.applyDamage(att, out.reversalDamage, move.region);
			def.momentum = clamp(def.momentum + 14, 0, 100);
			def.tally.reversals++;
			att.comboCount = 0;
			att.stance = 'groggy'; att.action = null; att.actionPhase = null; att.phaseTimer = 24;
			this.crowd = clamp01(this.crowd + 0.16);
			this.emit('reversal', def.slot, `REVERSED! ${def.def.name} counters the ${move.name}!`, { move: move.id });
			return;
		}

		// Clean hit.
		this.applyDamage(def, out.damage, move.region);
		att.momentum = clamp(att.momentum + move.momentum, 0, 100);
		att.comboCount++;
		att.tally.movesLanded++;
		att.tally.damageDealt += out.damage;
		att.tally.longestCombo = Math.max(att.tally.longestCombo, att.comboCount);
		this.crowd = clamp01(this.crowd + 0.03 + out.damage / 200);

		const critTxt = out.critical ? ' — flush!' : '';
		if (move.category === 'finisher') {
			att.tally.finishers++;
			att.finisherReady = false;
			att.momentum = 25;
			this.crowd = clamp01(this.crowd + 0.4);
			this.emit('finisher', slot, `${att.def.name} HITS THE ${move.name.toUpperCase()}!`, { move: move.id, damage: out.damage });
			this.knockdown(def.slot, true);
			def.pinVulnerable = 230; // ~3.8s window where a cover is likely to put them away
			this.pendingCover = slot; // go for the cover next
		} else if (move.category === 'signature') {
			att.tally.signatures++;
			this.crowd = clamp01(this.crowd + 0.2);
			this.emit('signature', slot, `${att.def.name} lands the ${move.name}!`, { move: move.id, damage: out.damage });
			if (move.knockdown && (this.rng.chance(0.7) || hpPct(def) < 0.4)) this.knockdown(def.slot, false);
			else this.stagger(def.slot);
		} else {
			this.emit('move_hit', slot, `${att.def.name} connects with the ${move.name}${critTxt} (${out.damage}).`, { move: move.id, damage: out.damage });
			if (this.knockdownRoll(move, def)) this.knockdown(def.slot, def.health <= 0);
			else if (move.knockdown) this.stagger(def.slot);
		}
	}

	/** Whether a hit puts the opponent on the mat (knockdown moves only, by chance). */
	private knockdownRoll(move: { knockdown?: boolean; damage: number }, def: Fighter): boolean {
		if (def.health <= 0) return true;
		if (!move.knockdown) return false;
		let p = 0.28 + move.damage / 100;
		if (hpPct(def) < 0.4) p += 0.35;
		if (def.stance === 'groggy') p += 0.4;
		return this.rng.chance(clamp01(p));
	}

	/** Brief stagger — a hit that hurts but doesn't put them down. */
	private stagger(slot: 0 | 1): void {
		const f = this.fighters[slot];
		if (f.stance !== 'standing') return;
		f.stance = 'groggy';
		f.special = null;
		f.action = null; f.actionPhase = null; f.activeMoveId = null;
		f.phaseTimer = this.rng.int(14, 26);
	}

	private applyDamage(f: Fighter, dmg: number, region: BodyRegion): void {
		f.health = clamp(f.health - dmg, 0, f.maxHealth);
		f.limb[region] = clamp(f.limb[region] + dmg * 0.6, 0, 100);
	}

	private knockdown(slot: 0 | 1, hard: boolean): void {
		const f = this.fighters[slot];
		if (f.stance === 'pinned' || f.stance === 'submission') return;
		f.stance = 'down';
		f.special = null; // knocked off the ropes / out of a charge
		f.action = null; f.actionPhase = null; f.activeMoveId = null; f.comboCount = 0;
		const base = 85 + (1 - hpPct(f)) * 100 + (hard ? 55 : 0);
		f.phaseTimer = Math.round(clamp(base, 60, 260));
		this.emit('knockdown', slot, `${f.def.name} is down!`);
	}

	// ─── Pin / near-fall ───────────────────────────────────────────────

	private startCover(slot: 0 | 1): void {
		const att = this.fighters[slot];
		const def = this.fighters[1 - slot];
		if (!(def.stance === 'down' || def.stance === 'getting_up')) { att.decisionCd = 8; return; }
		if (dist2(att, def) > 1.5) { att.decisionCd = 6; return; }
		def.stance = 'pinned';
		// Lock the covered wrestler completely — no rope-running out of a pin.
		def.special = null;
		def.action = null; def.actionPhase = null; def.activeMoveId = null;
		att.action = 'cover'; att.actionPhase = null; att.phaseTimer = 0;
		this.pin = { attacker: slot, defender: (1 - slot) as 0 | 1, count: 0, timer: PIN_INTERVAL };
		this.crowd = clamp01(this.crowd + 0.15);
		this.emit('cover', slot, `${att.def.name} hooks the leg — cover!`);
	}

	private kickoutChance(def: Fighter, count: number): number {
		// Kickout power is mostly about how spent they are.
		let c = 0.25 + hpPct(def) * 0.9;
		c *= 0.65 + stamPct(def) * 0.35;
		c += def.momentum / 100 * 0.1 + statFrac(def.def.stats.resilience) * 0.12;
		// A fresh finisher is what actually puts people away.
		if (def.pinVulnerable > 0) c *= 0.55;
		if (count === 2) c *= 0.9;
		return clamp(c, 0.04, 0.97);
	}

	private updatePin(): void {
		if (!this.pin) return;
		this.pin.timer--;
		if (this.pin.timer > 0) return;

		this.pin.count++;
		const def = this.fighters[this.pin.defender];
		const att = this.fighters[this.pin.attacker];
		this.emit('count', this.pin.attacker, ['', 'ONE!', 'TWO!', 'THREE!'][this.pin.count], { count: this.pin.count });

		// Count 1 is trivial — everyone survives it (unless already knocked out).
		if (this.pin.count === 1) {
			if (def.health > 0) { this.pin.timer = PIN_INTERVAL; return; }
		}
		// Count 3 = pinfall (they failed to kick out at two).
		if (this.pin.count >= 3) { this.finish(this.pin.attacker, 'pinfall'); return; }

		// Booking: a pin can only actually END the match against a genuinely
		// worn-down opponent — nearly out, softened by a fresh finisher, or deep
		// in the climax after surviving near-falls. Everything else is drama.
		const worn = hpPct(def);
		const canPin =
			worn < 0.22 ||
			(def.pinVulnerable > 0 && worn < 0.5) ||
			(this.phase === 'climax' && worn < 0.38 && def.kickouts >= 1);
		const kicksOut = !canPin || (def.health > 0 && this.rng.chance(this.kickoutChance(def, this.pin.count)));

		// Count 2 is the near-fall roll — the dramatic beat.
		if (kicksOut) {
			def.kickouts++;
			def.tally.nearFalls++;
			def.momentum = clamp(def.momentum + 24, 0, 100);
			this.crowd = clamp01(this.crowd + 0.55);
			this.emit('near_fall', this.pin.defender, `KICKOUT! ${def.def.name} gets the shoulder up at TWO — the crowd erupts!`);
			def.stance = 'groggy'; def.phaseTimer = this.rng.int(24, 48);
			att.action = null; att.actionPhase = null; att.decisionCd = this.rng.int(20, 40);
			this.pin = null;
		} else {
			this.pin.timer = PIN_INTERVAL;
		}
	}

	// ─── Submission ────────────────────────────────────────────────────

	private startSubmission(slot: 0 | 1, moveId: string): void {
		const holder = this.fighters[slot];
		const victim = this.fighters[1 - slot];
		const move = getMove(moveId);
		victim.stance = 'submission';
		// Fully seize the victim — no stale walks, wind-ups, or perched dives.
		victim.special = null;
		victim.action = null; victim.actionPhase = null; victim.activeMoveId = null;
		victim.submitPressure = 25 + victim.limb[move?.region ?? 'body'] * 0.3;
		holder.action = 'submit'; holder.actionPhase = null; holder.phaseTimer = 0;
		this.sub = { holder: slot, victim: (1 - slot) as 0 | 1 };
		this.crowd = clamp01(this.crowd + 0.2);
		this.emit('submission_applied', slot, `${holder.def.name} locks in the ${move?.name ?? 'hold'}!`, { move: moveId });
	}

	private updateSubmission(): void {
		if (!this.sub) return;
		const holder = this.fighters[this.sub.holder];
		const victim = this.fighters[this.sub.victim];
		// Pressure climbs with technique & limb damage; the victim fights it.
		const climb = 0.5 + statFrac(holder.def.stats.technique) * 0.9 + victim.limb.legs / 100 * 0.4;
		const resist = 0.25 + statFrac(victim.def.stats.resilience) * 0.5 + stamPct(victim) * 0.4;
		victim.submitPressure = clamp(victim.submitPressure + climb - resist, 0, 100);
		holder.stamina = clamp(holder.stamina - holder.maxStamina * 0.03 / HZ, 0, holder.maxStamina);
		victim.health = clamp(victim.health - 0.05, 0, victim.maxHealth);

		if (victim.submitPressure >= 100 && hpPct(victim) < 0.35) {
			this.finish(this.sub.holder, 'submission');
			return;
		}
		// Escape roll (rope break / power out), likelier when fresh / resilient.
		const escapeP = (0.004 + statFrac(victim.def.stats.resilience) * 0.006 + stamPct(victim) * 0.006) * (hpPct(victim) > 0.3 ? 1.6 : 0.6);
		if (this.rng.chance(escapeP)) {
			this.emit('submission_escape', this.sub.victim, `${victim.def.name} scrambles to the ropes — break!`);
			victim.stance = 'groggy'; victim.phaseTimer = this.rng.int(20, 40); victim.submitPressure = 0;
			holder.action = null; holder.actionPhase = null; holder.decisionCd = this.rng.int(20, 40);
			this.crowd = clamp01(this.crowd + 0.25);
			this.sub = null;
		}
	}

	// ─── Movement ──────────────────────────────────────────────────────

	private updateMovement(): void {
		const [a, b] = this.fighters;
		for (const f of this.fighters) {
			if (f.special) continue; // rope runs / dives steer themselves
			if (f.action !== 'approach' && f.action !== 'retreat' && f.action !== 'circle' && f.action !== 'dodge') continue;
			const opp = f.slot === 0 ? b : a;
			const dx = opp.posX - f.posX, dz = opp.posZ - f.posZ;
			const len = Math.hypot(dx, dz) || 1;
			const nx = dx / len, nz = dz / len;
			const speed = 0.028 + statFrac(f.def.stats.speed) * 0.032;
			switch (f.action) {
				case 'approach': f.posX += nx * speed; f.posZ += nz * speed; break;
				case 'retreat': f.posX -= nx * speed * 0.8; f.posZ -= nz * speed * 0.8; break;
				case 'circle': // strafe around the opponent
					f.posX += -nz * speed * 0.85 * f.circleDir;
					f.posZ += nx * speed * 0.85 * f.circleDir;
					break;
				case 'dodge': // quick lateral sidestep
					f.posX += -nz * speed * 1.6 * f.circleDir;
					f.posZ += nx * speed * 1.6 * f.circleDir;
					break;
			}
			f.posX = clamp(f.posX, -RING_HALF, RING_HALF);
			f.posZ = clamp(f.posZ, -RING_HALF, RING_HALF);
		}
		// Keep them from standing inside each other (unless someone is flying).
		if (!a.special && !b.special && a.stance !== 'pinned' && b.stance !== 'pinned') {
			const dx = b.posX - a.posX, dz = b.posZ - a.posZ;
			const d = Math.hypot(dx, dz);
			if (d < MIN_SEP) {
				const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
				const push = (MIN_SEP - d) / 2;
				a.posX = clamp(a.posX - nx * push, -RING_HALF, RING_HALF);
				a.posZ = clamp(a.posZ - nz * push, -RING_HALF, RING_HALF);
				b.posX = clamp(b.posX + nx * push, -RING_HALF, RING_HALF);
				b.posZ = clamp(b.posZ + nz * push, -RING_HALF, RING_HALF);
			}
		}
		a.facing = a.posX <= b.posX ? 1 : -1;
		b.facing = b.posX < a.posX ? 1 : -1;
	}

	// ─── Win conditions ────────────────────────────────────────────────

	private checkWin(): void {
		if (!this.running) return;
		for (const f of this.fighters) {
			if (f.health <= 0 && (f.stance === 'down' || f.stance === 'pinned')) {
				this.finish((1 - f.slot) as 0 | 1, 'knockout');
				return;
			}
		}
		if (this.tick / HZ >= this.timeLimit) this.finish(this.leader(), 'timeout');
	}

	private leader(): 0 | 1 {
		return hpPct(this.fighters[0]) >= hpPct(this.fighters[1]) ? 0 : 1;
	}

	private finish(winner: 0 | 1, method: WinMethod): void {
		if (!this.running) return;
		this.running = false;
		const w = this.fighters[winner];
		const l = this.fighters[1 - winner];
		const nearFalls = w.tally.nearFalls + l.tally.nearFalls;
		const fins = w.tally.finishers + l.tally.finishers;
		// Stars need length AND drama — a 30-second squash can't be a classic.
		const rating = clamp(
			1.6 +
				Math.min(1.5, nearFalls * 0.3) +
				Math.min(0.6, fins * 0.25) +
				Math.min(1.7, this.tick / HZ / 150),
			1, 5
		);
		this.result = { winner, method, durationTicks: this.tick, rating: Math.round(rating * 10) / 10 };
		this.crowd = 1;
		this.emit('win', winner, `${w.def.name} wins by ${method}! (${'★'.repeat(Math.round(rating))})`, { rating });
	}

	// ─── Emotion + logging ─────────────────────────────────────────────

	private updateEmotion(f: Fighter): void {
		if (this.tick % 30 !== f.slot) return;
		const hp = hpPct(f);
		let e = 'calm';
		if (hp < 0.2) e = 'desperate';
		else if (hp < 0.4) e = 'hurt';
		else if (f.momentum > 70) e = 'dominant';
		else if (f.finisherReady) e = 'fired up';
		if (e !== f.emotion) {
			f.emotion = e;
			if (e === 'desperate' || e === 'dominant') {
				this.emit('emotion', f.slot, `${f.def.name} looks ${e}.`);
			}
		}
	}

	private emit(type: MatchEventType, actor: (0 | 1) | undefined, text: string, data?: Record<string, number | string | boolean>): void {
		this.events.push({ tick: this.tick, type, actor, text, data });
	}
}

/** Distance along a ray from (x,z) until it exits the ring square. */
function edgeDistance(x: number, z: number, dx: number, dz: number): number {
	let t = Infinity;
	if (dx > 1e-6) t = Math.min(t, (RING_HALF - x) / dx);
	else if (dx < -1e-6) t = Math.min(t, (-RING_HALF - x) / dx);
	if (dz > 1e-6) t = Math.min(t, (RING_HALF - z) / dz);
	else if (dz < -1e-6) t = Math.min(t, (-RING_HALF - z) / dz);
	return t === Infinity ? RING_HALF * 2 : Math.max(0, t);
}

function intentKindFor(cat: string): Fighter['action'] {
	if (cat === 'grapple') return 'grapple';
	if (cat === 'aerial') return 'aerial';
	if (cat === 'signature') return 'signature';
	if (cat === 'finisher') return 'finisher';
	if (cat === 'submission') return 'submit';
	return 'strike';
}
