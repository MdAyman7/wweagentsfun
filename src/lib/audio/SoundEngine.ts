/**
 * SoundEngine — fully procedural match audio via the Web Audio API.
 *
 * Generates everything synthetically (no asset files): impact thuds, swing
 * whooshes, the ring bell, and a living crowd bed that swells on big moments.
 *
 * This is presentation-only and lives outside the deterministic simulation,
 * so it is free to use real time and the Web Audio clock.
 *
 * Usage:
 *   const sfx = new SoundEngine();
 *   sfx.resume();                 // call after a user gesture
 *   sfx.impact(0.8, { critical: true });
 *   sfx.setCrowdEnergy(0.6);      // 0..1 ambient excitement target
 *   sfx.crowdPop(1.0);            // transient cheer swell
 *   sfx.update(dt);               // each frame, smooths the crowd bed
 */
export interface ImpactOptions {
	critical?: boolean;
	blocked?: boolean;
	reversed?: boolean;
}

export class SoundEngine {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private muted = false;

	// Crowd ambient bed
	private crowdBed: AudioBufferSourceNode | null = null;
	private crowdGain: GainNode | null = null;
	private crowdEnergy = 0.15; // current smoothed level
	private crowdTarget = 0.15; // target level

	private noiseBuf: AudioBuffer | null = null;

	/**
	 * Lazily create the AudioContext. Browsers require this to happen during
	 * (or be resumed after) a user gesture, hence the explicit resume().
	 */
	private ensureContext(): boolean {
		if (this.ctx) return true;
		try {
			const Ctor =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctor) return false;
			this.ctx = new Ctor();
			this.master = this.ctx.createGain();
			this.master.gain.value = this.muted ? 0 : 0.9;
			this.master.connect(this.ctx.destination);
			this.startCrowdBed();
			return true;
		} catch {
			this.ctx = null;
			return false;
		}
	}

	/** Resume the audio context (call from a user-gesture handler). */
	resume(): void {
		if (!this.ensureContext()) return;
		if (this.ctx!.state === 'suspended') void this.ctx!.resume();
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		if (this.master && this.ctx) {
			this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
		}
	}

	isMuted(): boolean {
		return this.muted;
	}

	// ─── Crowd bed ──────────────────────────────────────────────────────

	private getNoiseBuffer(): AudioBuffer {
		if (this.noiseBuf) return this.noiseBuf;
		const ctx = this.ctx!;
		const len = ctx.sampleRate * 2;
		const buf = ctx.createBuffer(1, len, ctx.sampleRate);
		const data = buf.getChannelData(0);
		// Pink-ish noise (smoothed white) reads more like a crowd than raw white.
		let last = 0;
		for (let i = 0; i < len; i++) {
			const white = Math.random() * 2 - 1;
			last = (last + 0.02 * white) / 1.02;
			data[i] = last * 3.5;
		}
		this.noiseBuf = buf;
		return buf;
	}

	private startCrowdBed(): void {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = this.getNoiseBuffer();
		src.loop = true;

		// Band-limit the noise into a "murmuring crowd" timbre.
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 900;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 180;

		const gain = ctx.createGain();
		gain.gain.value = 0.04;

		src.connect(hp);
		hp.connect(lp);
		lp.connect(gain);
		gain.connect(this.master!);
		src.start();

		this.crowdBed = src;
		this.crowdGain = gain;
	}

	/** Set the ambient crowd excitement target (0 = quiet murmur, 1 = roaring). */
	setCrowdEnergy(level: number): void {
		this.crowdTarget = Math.max(0, Math.min(1, level));
	}

	/** Smooth the crowd bed toward its target. Call once per rendered frame. */
	update(dt: number): void {
		if (!this.ctx || !this.crowdGain) return;
		const k = Math.min(1, dt * 1.5);
		this.crowdEnergy += (this.crowdTarget - this.crowdEnergy) * k;
		const target = 0.03 + this.crowdEnergy * 0.22;
		this.crowdGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
	}

	/** Transient crowd cheer/roar layered on top of the bed. */
	crowdPop(intensity = 1): void {
		if (!this.ensureContext() || this.muted) return;
		const ctx = this.ctx!;
		const t = ctx.currentTime;
		const dur = 0.6 + intensity * 0.9;

		const src = ctx.createBufferSource();
		src.buffer = this.getNoiseBuffer();
		src.loop = true;

		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.setValueAtTime(700, t);
		bp.frequency.linearRampToValueAtTime(1400, t + dur * 0.4);
		bp.Q.value = 0.7;

		const g = ctx.createGain();
		const peak = 0.12 + intensity * 0.22;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.linearRampToValueAtTime(peak, t + dur * 0.25); // swell up
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // fade out

		src.connect(bp);
		bp.connect(g);
		g.connect(this.master!);
		src.start(t);
		src.stop(t + dur + 0.05);
	}

	// ─── Impacts & swings ───────────────────────────────────────────────

	/** A strike/slam impact. Intensity 0..1 (≈ damage / maxHealth). */
	impact(intensity: number, opts: ImpactOptions = {}): void {
		if (!this.ensureContext() || this.muted) return;
		const ctx = this.ctx!;
		const t = ctx.currentTime;
		const amt = Math.max(0.1, Math.min(1.4, intensity));

		if (opts.blocked) {
			// Dull, short thud — no low boom.
			this.noiseBurst(t, 0.07, 600, 1.5, 0.18 * amt);
			return;
		}

		// Low-body thud: sine drop.
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		const baseFreq = opts.critical ? 150 : 110;
		osc.frequency.setValueAtTime(baseFreq, t);
		osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
		const og = ctx.createGain();
		const oPeak = (opts.critical ? 0.5 : 0.34) * Math.min(1, amt + 0.2);
		og.gain.setValueAtTime(oPeak, t);
		og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
		osc.connect(og);
		og.connect(this.master!);
		osc.start(t);
		osc.stop(t + 0.3);

		// Slap/crack: filtered noise burst.
		const crackFreq = opts.critical ? 2600 : 1500;
		this.noiseBurst(t, opts.critical ? 0.12 : 0.08, crackFreq, 1.0, 0.22 * amt);

		if (opts.critical) {
			// Brighter secondary crack for big hits.
			this.noiseBurst(t + 0.01, 0.09, 4200, 2.0, 0.16);
		}
		if (opts.reversed) {
			// Quick rising "counter" zip.
			this.noiseBurst(t, 0.1, 1800, 1.2, 0.14, 'up');
		}
	}

	/** Whoosh of a swing through the air. */
	whoosh(intensity = 0.6): void {
		if (!this.ensureContext() || this.muted) return;
		this.noiseBurst(this.ctx!.currentTime, 0.16, 900, 1.4, 0.1 * intensity, 'up');
	}

	/** Ring bell — "ding ding ding" at match start / finish. */
	bell(rings = 3): void {
		if (!this.ensureContext() || this.muted) return;
		const ctx = this.ctx!;
		for (let i = 0; i < rings; i++) {
			const t = ctx.currentTime + i * 0.42;
			// Bell = a couple of inharmonic partials with a long-ish decay.
			for (const [mult, gain] of [
				[1, 0.3],
				[2.76, 0.16],
				[5.4, 0.08]
			] as [number, number][]) {
				const osc = ctx.createOscillator();
				osc.type = 'sine';
				osc.frequency.value = 784 * mult; // G5 fundamental
				const g = ctx.createGain();
				g.gain.setValueAtTime(gain, t);
				g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
				osc.connect(g);
				g.connect(this.master!);
				osc.start(t);
				osc.stop(t + 0.45);
			}
		}
	}

	// ─── helpers ────────────────────────────────────────────────────────

	private noiseBurst(
		t: number,
		dur: number,
		freq: number,
		q: number,
		peak: number,
		sweep: 'flat' | 'up' | 'down' = 'flat'
	): void {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = this.getNoiseBuffer();

		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.Q.value = q;
		if (sweep === 'up') {
			bp.frequency.setValueAtTime(freq * 0.5, t);
			bp.frequency.linearRampToValueAtTime(freq * 1.6, t + dur);
		} else if (sweep === 'down') {
			bp.frequency.setValueAtTime(freq * 1.6, t);
			bp.frequency.linearRampToValueAtTime(freq * 0.5, t + dur);
		} else {
			bp.frequency.value = freq;
		}

		const g = ctx.createGain();
		g.gain.setValueAtTime(peak, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

		src.connect(bp);
		bp.connect(g);
		g.connect(this.master!);
		// Random offset into the noise buffer for variety.
		src.start(t, Math.random() * 1.5);
		src.stop(t + dur + 0.02);
	}

	dispose(): void {
		try {
			this.crowdBed?.stop();
		} catch {
			/* already stopped */
		}
		this.crowdBed = null;
		this.crowdGain = null;
		if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
		this.ctx = null;
		this.master = null;
		this.noiseBuf = null;
	}
}
