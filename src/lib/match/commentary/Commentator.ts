import { SeededRandom } from '../../utils/random';
import type { MatchState, MatchLogEntry, AgentState } from '../engine';

/**
 * Commentator — turns raw match-log events into varied, broadcast-style
 * play-by-play lines. Deterministic for a given seed so replays match.
 *
 * Presentation-only: consumes the simulation log, never mutates state.
 */
export type CommentaryTone = 'normal' | 'hype' | 'big' | 'finish' | 'color';

export interface CommentaryLine {
	id: number;
	tick: number;
	text: string;
	tone: CommentaryTone;
}

/** Phrase pools keyed by log event type. {att} {def} {move} {dmg} are filled in. */
const PHRASES: Record<string, { tone: CommentaryTone; lines: string[] }> = {
	match_start: {
		tone: 'hype',
		lines: ['And we are underway!', 'The bell rings — here we go!', "It's go time!"]
	},
	move_hit: {
		tone: 'normal',
		lines: [
			'{att} connects with the {move}!',
			'{att} lands a {move}!',
			'Big {move} from {att}!',
			'{att} drives home the {move}!',
			'Oh! {att} catches {def} with a {move}!'
		]
	},
	move_miss: {
		tone: 'normal',
		lines: [
			'{att} swings and misses!',
			'{def} slips away from the {move}!',
			'{att} whiffs on the {move}!',
			'Nothing but air for {att}!'
		]
	},
	reversal: {
		tone: 'hype',
		lines: [
			'REVERSED! {att} turns it right around!',
			'What a counter by {att}!',
			'{att} scouts it and reverses!',
			'{att} flips the {move} on its head!'
		]
	},
	knockdown: {
		tone: 'big',
		lines: [
			'{att} goes DOWN!',
			'{att} is laid out on the mat!',
			'Down goes {att}!',
			'{att} crumbles to the canvas!'
		]
	},
	comeback: {
		tone: 'big',
		lines: [
			"{att} is firing up — the crowd can feel it!",
			'Here comes {att}! A comeback is brewing!',
			'{att} will NOT stay down — this place is electric!',
			'{att} is digging deep, mounting a comeback!'
		]
	},
	taunt: {
		tone: 'color',
		lines: [
			'{att} plays to the crowd!',
			'{att} is soaking it all in.',
			'A little showboating from {att}.',
			'{att} tells the world to watch this.'
		]
	},
	mistake: {
		tone: 'color',
		lines: [
			'{att} overextends — costly mistake!',
			'{att} got greedy there.',
			'A misstep from {att}!'
		]
	},
	combo_start: {
		tone: 'normal',
		lines: ['{att} opens up with the {combo}!', '{att} is putting it together — {combo}!']
	},
	combo_hit: {
		tone: 'hype',
		lines: ['{att} keeps it going — {combo}!', "{att} is on a roll, {combo}!", 'Combination from {att}!']
	},
	combo_complete: {
		tone: 'big',
		lines: [
			'{att} caps off the {combo} in style!',
			'A flawless {combo} from {att}!',
			'{att} runs the whole sequence — {combo}!'
		]
	},
	finisher_start: {
		tone: 'big',
		lines: [
			'{att} is setting up the {move}! This could be it!',
			"Wait — {att} is going for the {move}!",
			'The crowd is on their feet — {att} signals for the {move}!'
		]
	},
	finisher_impact: {
		tone: 'finish',
		lines: [
			'THE {move} CONNECTS! {def} is done!',
			'{att} HITS THE {move}! What a moment!',
			'DIRECT HIT! The {move} lands flush on {def}!'
		]
	},
	finisher_counter: {
		tone: 'finish',
		lines: [
			"COUNTERED! {def} escapes the {move}!",
			'NO! {def} slips the finisher at the last second!',
			'Unbelievable! {def} counters out of nowhere!'
		]
	}
};

/** Atmospheric color commentary triggered by match context (not events). */
const COLOR = {
	lowHealth: [
		'{name} is running on fumes out there.',
		"{name} is hurt — you can see it.",
		'{name} is hanging on by a thread.'
	],
	highMomentum: [
		'{name} has all the momentum right now.',
		'{name} is rolling and the crowd knows it!',
		'Everything is clicking for {name}.'
	],
	closeMatch: [
		'You could not separate these two!',
		'Even steven — anybody can win this!',
		'What a back-and-forth war this has become!'
	],
	desperate: [
		'{name} is throwing everything at the wall now.',
		'Pure desperation from {name}!'
	]
};

export class Commentator {
	private rng: SeededRandom;
	private nextId = 1;
	private lastTemplate = '';
	private colorCooldown = 0; // ticks until next color line allowed

	constructor(seed: number) {
		this.rng = new SeededRandom((seed ^ 0x5eed) | 0);
	}

	/** Produce a commentary line for a single new log entry, or null to skip. */
	consume(state: MatchState, entry: MatchLogEntry): CommentaryLine | null {
		const spec = PHRASES[entry.type];
		if (!spec) return null;

		const att = this.name(state, entry, ['attackerId', 'agentId']);
		const def = this.name(state, entry, ['defenderId']);
		const move = prettify((entry.data.moveName ?? entry.data.moveId) as string | undefined);
		const combo = (entry.data.comboName as string | undefined) ?? 'combination';
		const dmg = entry.data.damage != null ? String(entry.data.damage) : '';

		const template = this.pickLine(spec.lines);
		const text = template
			.replace(/\{att\}/g, att)
			.replace(/\{def\}/g, def || 'his opponent')
			.replace(/\{move\}/g, move || 'big move')
			.replace(/\{combo\}/g, combo)
			.replace(/\{dmg\}/g, dmg);

		return { id: this.nextId++, tick: entry.tick, text, tone: spec.tone };
	}

	/**
	 * Optional atmospheric line based on live match state. Returns null most
	 * ticks; self-rate-limited so color commentary stays sparse.
	 */
	colorCommentary(state: MatchState): CommentaryLine | null {
		if (this.colorCooldown > 0) {
			this.colorCooldown--;
			return null;
		}
		if (!state.running) return null;

		const [a, b] = state.agents;
		let pool: string[] | null = null;
		let name = '';

		const aLow = a.health / a.maxHealth < 0.25;
		const bLow = b.health / b.maxHealth < 0.25;
		const closeFight =
			Math.abs(a.health / a.maxHealth - b.health / b.maxHealth) < 0.12 && state.elapsed > 25;

		if (a.psych.emotion === 'desperate' || b.psych.emotion === 'desperate') {
			const d = a.psych.emotion === 'desperate' ? a : b;
			pool = COLOR.desperate;
			name = d.name;
		} else if (aLow !== bLow) {
			pool = COLOR.lowHealth;
			name = aLow ? a.name : b.name;
		} else if (a.momentum > 80 || b.momentum > 80) {
			pool = COLOR.highMomentum;
			name = a.momentum > b.momentum ? a.name : b.name;
		} else if (closeFight) {
			pool = COLOR.closeMatch;
		}

		if (!pool) return null;

		this.colorCooldown = 360; // ~6s of simulated time between color lines
		const text = this.pickLine(pool).replace(/\{name\}/g, name);
		return { id: this.nextId++, tick: state.tick, text, tone: 'color' };
	}

	private pickLine(lines: string[]): string {
		// Avoid immediately repeating the same template.
		let line = this.rng.pick(lines);
		if (lines.length > 1 && line === this.lastTemplate) {
			line = this.rng.pick(lines.filter((l) => l !== this.lastTemplate));
		}
		this.lastTemplate = line;
		return line;
	}

	private name(state: MatchState, entry: MatchLogEntry, keys: string[]): string {
		for (const k of keys) {
			const id = entry.data[k];
			if (typeof id === 'string') {
				const agent = state.agents.find((ag: AgentState) => ag.id === id);
				if (agent) return agent.name;
			}
		}
		return '';
	}
}

/** "running_knee" → "Running Knee" */
function prettify(id: string | undefined): string {
	if (!id) return '';
	return id
		.split(/[_\s]+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}
