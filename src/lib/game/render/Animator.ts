import type { Fighter } from '../sim/types.ts';
import { getMove } from '../data/moves.ts';
import { restPose, type Pose } from './Fighter3D.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpPose(a: Pose, b: Pose, t: number): Pose {
	const o = {} as Pose;
	for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
	return o;
}

/**
 * Animator — derives a smooth humanoid pose from a fighter's sim state.
 * Fatigue (low stamina) and strength visibly shape the body language.
 */
export class Animator {
	private cur: Pose = restPose();
	private walkPhase = 0;

	update(f: Fighter, dt: number, time: number, airY: number): Pose {
		const stamPct = f.stamina / f.maxStamina;
		const tired = 1 - stamPct;
		const target = this.targetPose(f, time, tired);
		// Attacks snap; everything else eases.
		const snappy = f.actionPhase === 'active' || f.actionPhase === 'windup';
		const rate = 1 - Math.exp(-(snappy ? 26 : 12) * dt);
		this.cur = lerpPose(this.cur, target, rate);
		// Apply the climb/dive height to a COPY — mutating the persistent pose
		// would feed airY back through the lerp and send divers into the rafters.
		const out = { ...this.cur };
		out.lift += airY;
		return out;
	}

	private targetPose(f: Fighter, time: number, tired: number): Pose {
		const p = restPose();
		const breathe = Math.sin(time * (2 + tired * 2)) * (0.02 + tired * 0.05);

		// Fatigue baseline — hunch, drop the guard, head sags, heavier breathing.
		p.spineX += 0.03 + tired * 0.35 + Math.max(0, breathe);
		p.headX += tired * 0.3;
		p.lArmX += tired * 0.5; p.rArmX += tired * 0.5;
		p.lift += -tired * 0.02;

		// Ring specials — sprinting the ropes / climbing / flying.
		if (f.special?.kind === 'rope_run') return this.sprint(p);
		if (f.special?.kind === 'dive') {
			const sp = f.special;
			if (sp.stage === 'climb') {
				// Hustle to the corner first, then scale it.
				if (sp.t / sp.total < 0.55) return this.sprint(p);
				const step = Math.sin(time * 10) * 0.3;
				p.lArmX = -2.2 + step * 0.3; p.rArmX = -2.2 - step * 0.3;
				p.lElbow = -0.5; p.rElbow = -0.5;
				p.lLegX = 0.6 + step; p.rLegX = 0.6 - step;
				p.lKnee = -1.2; p.rKnee = -1.2;
				p.spineX = 0.35; return p;
			}
			if (sp.stage === 'perch') {
				// Crouched on the top rope, ready to fly.
				p.lift = -0.18; p.spineX = 0.6;
				p.lLegX = 1.1; p.rLegX = 1.1; p.lKnee = -2.0; p.rKnee = -2.0;
				p.lArmX = -0.8; p.rArmX = -0.8; p.lArmZ = 0.5; p.rArmZ = -0.5;
				p.lElbow = -0.3; p.rElbow = -0.3; p.headX = -0.2; return p;
			}
			// Airborne — splash pose: body flat, limbs spread wide.
			p.lieX = 1.15; p.spineX = -0.1;
			p.lArmX = -0.6; p.rArmX = -0.6; p.lArmZ = 1.3; p.rArmZ = -1.3;
			p.lElbow = -0.15; p.rElbow = -0.15;
			p.lLegX = 0.35; p.rLegX = 0.35; p.lLegZ = 0.3; p.rLegZ = -0.3;
			p.lKnee = -0.4; p.rKnee = -0.4; p.headX = -0.4;
			return p;
		}

		switch (f.stance) {
			case 'down': case 'pinned':
				return this.lie(f);
			case 'submission':
				return this.lie(f, 0.9);
			case 'getting_up': {
				const g = this.lie(f, 0.7); g.lift = -0.12; g.rLegX = -0.8; g.rKnee = -1.2; return g;
			}
			case 'groggy': {
				p.spineZ += Math.sin(time * 6) * 0.14; p.hipsZ += Math.sin(time * 5) * 0.08;
				p.lArmX = 0.1; p.rArmX = 0.1; p.headZ += Math.sin(time * 4) * 0.1; return p;
			}
		}

		if (f.action && f.actionPhase) return this.attackPose(f, p);

		switch (f.action) {
			case 'approach': case 'retreat': case 'circle': return this.walk(f, p);
			case 'block':
				p.lArmX = -1.5; p.rArmX = -1.5; p.lElbow = -2.1; p.rElbow = -2.1;
				p.lArmZ = 0.1; p.rArmZ = -0.1; p.spineX += 0.12; p.lift = -0.05; return p;
			case 'dodge':
				p.spineX = -0.35; p.hipsX = -0.2; p.headX = -0.2; return p;
			case 'taunt':
				p.lArmX = -2.4; p.rArmX = -2.4; p.lElbow = -0.2; p.rElbow = -0.2;
				p.lArmZ = 0.6; p.rArmZ = -0.6; p.spineX = -0.1 + Math.sin(time * 4) * 0.05; return p;
			case 'cover':
				return this.cover(f);
		}

		// Idle guard with a light bounce.
		p.lift += Math.abs(Math.sin(time * 3)) * 0.01;
		return p;
	}

	private attackPose(f: Fighter, p: Pose): Pose {
		const move = f.activeMoveId ? getMove(f.activeMoveId) : null;
		const cat = move?.category ?? 'strike';
		const leg = cat === 'aerial' || (move?.id?.includes('kick') || move?.id?.includes('knee') || move?.id?.includes('boot'));
		const phase = f.actionPhase;

		if (leg) {
			if (phase === 'windup') { p.rLegX = 0.7; p.rKnee = -1.4; p.spineX -= 0.1; p.lift = -0.04; }
			else if (phase === 'active') { p.rLegX = -1.5; p.rKnee = -0.2; p.spineX = 0.2; p.lArmX = -1.2; p.lArmZ = 0.7; }
			else { p.rLegX = -0.3; p.rKnee = -0.5; }
			return p;
		}
		if (cat === 'grapple' || cat === 'submission') {
			if (phase === 'windup') { p.lArmX = -1.2; p.rArmX = -1.2; p.lElbow = -0.6; p.rElbow = -0.6; p.spineX -= 0.15; }
			else if (phase === 'active') { p.lArmX = -1.5; p.rArmX = -1.5; p.lElbow = -0.4; p.rElbow = -0.4; p.spineX = 0.3; p.lift = 0.06; }
			return p;
		}
		// Strike — cock the rear arm, then drive it forward with a hip twist.
		if (phase === 'windup') { p.rArmX = 0.4; p.rElbow = -1.6; p.spineY = -0.35; p.spineX -= 0.05; }
		else if (phase === 'active') { p.rArmX = -1.7; p.rElbow = -0.15; p.spineY = 0.4; p.spineX = 0.12; p.lArmX = -0.9; }
		else { p.rArmX = -0.7; p.rElbow = -1.0; p.spineY = 0.1; }
		return p;
	}

	private walk(f: Fighter, p: Pose): Pose {
		this.walkPhase += 0.28;
		const s = Math.sin(this.walkPhase);
		p.lLegX = s * 0.5; p.rLegX = -s * 0.5;
		p.lKnee = -0.2 - Math.max(0, -s) * 0.5; p.rKnee = -0.2 - Math.max(0, s) * 0.5;
		p.lArmX = -0.5 - s * 0.4; p.rArmX = -0.5 + s * 0.4;
		p.spineX += 0.12; return p;
	}

	/** Full sprint — the rope run. Big stride, pumping arms, deep lean. */
	private sprint(p: Pose): Pose {
		this.walkPhase += 0.55;
		const s = Math.sin(this.walkPhase);
		p.lLegX = s * 0.95; p.rLegX = -s * 0.95;
		p.lKnee = -0.3 - Math.max(0, -s) * 0.9; p.rKnee = -0.3 - Math.max(0, s) * 0.9;
		p.lArmX = -0.6 - s * 0.8; p.rArmX = -0.6 + s * 0.8;
		p.lElbow = -1.6; p.rElbow = -1.6;
		p.spineX = 0.38; p.headX = -0.15;
		p.lift += Math.abs(s) * 0.03;
		return p;
	}

	private lie(f: Fighter, angle = 1.42): Pose {
		const p = restPose();
		p.lieX = angle; p.lift = -0.34;
		p.lArmX = 0.3; p.rArmX = 0.3; p.lArmZ = 0.9; p.rArmZ = -0.9;
		p.lLegX = 0.2; p.rLegX = -0.2; p.lElbow = -0.2; p.rElbow = -0.2;
		return p;
	}

	private cover(f: Fighter): Pose {
		// Kneeling over the opponent hooking the leg.
		const p = restPose();
		p.lift = -0.28; p.spineX = 0.9; p.headX = 0.3;
		p.lLegX = 0.9; p.lKnee = -1.6; p.rLegX = 0.4; p.rKnee = -1.2;
		p.lArmX = -1.4; p.rArmX = -1.4; p.lElbow = -0.5; p.rElbow = -0.5;
		return p;
	}
}
