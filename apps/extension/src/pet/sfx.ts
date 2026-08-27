/**
 * Mochi's voice.
 *
 * Everything is synthesised with Web Audio rather than shipped as audio files:
 * the extension stays asset-free, nothing has to be decoded before the first
 * bark, and a new sound is a few lines rather than a new binary in the bundle.
 *
 * The AudioContext stays suspended until a real user gesture, which is what
 * browser autoplay policy requires — and on someone else's website, a pet that
 * made noise before being touched would be indefensible anyway.
 */

const MUTED_KEY = 'pet.muted';

interface NoteOptions {
  f: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
  atk?: number;
}

class Sfx {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #muted = false;
  #unlocked = false;

  async init(): Promise<void> {
    const stored = (await chrome.storage.local
      .get(MUTED_KEY)
      .catch(() => ({}))) as Record<string, unknown>;
    this.#muted = stored[MUTED_KEY] === true;
  }

  get muted(): boolean {
    return this.#muted;
  }

  async setMuted(muted: boolean): Promise<void> {
    this.#muted = muted;
    await chrome.storage.local.set({ [MUTED_KEY]: muted }).catch(() => {});
  }

  /** Call from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    this.#audio();
  }

  #audio(): AudioContext | null {
    if (!this.#ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return null;
      try {
        this.#ctx = new Ctor();
      } catch {
        return null;
      }
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = 0.28;
      this.#master.connect(this.#ctx.destination);
    }
    if (this.#ctx.state === 'suspended') void this.#ctx.resume().catch(() => {});
    this.#unlocked = this.#ctx.state === 'running';
    return this.#ctx;
  }

  #note(o: NoteOptions): void {
    const ctx = this.#audio();
    if (!ctx || !this.#master || this.#muted) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const peak = Math.max(0.0002, (o.vol ?? 1) * 0.5);
    const attack = o.atk ?? 0.008;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(gain);
    gain.connect(this.#master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  /** Filtered noise burst — gives a bark its breath. */
  #puff(o: { f: number; to?: number; dur: number; vol?: number; at?: number }): void {
    const ctx = this.#audio();
    if (!ctx || !this.#master || this.#muted) return;
    if (!this.#noise) {
      this.#noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
      const data = this.#noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(o.f, t0);
    if (o.to) bp.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t0 + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime((o.vol ?? 1) * 0.28, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.#master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.03);
  }

  /** One friendly yip. */
  yip(at = 0): void {
    this.#note({ f: 760, to: 420, dur: 0.09, type: 'triangle', vol: 0.55, at });
    this.#puff({ f: 2200, to: 900, dur: 0.07, vol: 0.5, at });
  }
  bark(): void {
    this.yip(0);
    this.yip(0.13);
  }
  chirp(): void {
    this.#note({ f: 620, to: 900, dur: 0.1, vol: 0.5 });
    this.#note({ f: 940, to: 1180, dur: 0.13, vol: 0.4, at: 0.09 });
  }
  celebrate(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.#note({ f, dur: 0.24, type: 'triangle', vol: 0.42, at: i * 0.085 }),
    );
    this.#note({ f: 1568, to: 2093, dur: 0.3, vol: 0.22, at: 0.36 });
  }
  whine(): void {
    this.#note({ f: 480, to: 300, dur: 0.32, vol: 0.4 });
    this.#note({ f: 392, to: 262, dur: 0.36, vol: 0.28, at: 0.14 });
  }
  snore(): void {
    this.#note({ f: 150, to: 96, dur: 0.55, vol: 0.34, atk: 0.16 });
    this.#puff({ f: 320, to: 170, dur: 0.5, vol: 0.16 });
  }
  ping(): void {
    this.#note({ f: 1046.5, dur: 0.2, vol: 0.4 });
    this.#note({ f: 1396.9, dur: 0.34, vol: 0.3, at: 0.11 });
  }
  /** Per-token tick while the reply streams in. Deliberately tiny. */
  blip(): void {
    this.#note({ f: 1150 + Math.random() * 260, dur: 0.026, type: 'square', vol: 0.05 });
  }
  send(): void {
    this.#note({ f: 520, to: 820, dur: 0.09, vol: 0.32 });
  }
  xp(): void {
    this.#note({ f: 880, dur: 0.09, type: 'triangle', vol: 0.34 });
    this.#note({ f: 1318.5, dur: 0.16, type: 'triangle', vol: 0.28, at: 0.07 });
  }
  /** A correction is being shown — attention, never failure. */
  fix(): void {
    this.#note({ f: 392, dur: 0.11, type: 'triangle', vol: 0.3 });
    this.#note({ f: 587.33, dur: 0.2, type: 'triangle', vol: 0.26, at: 0.1 });
  }
  pop(): void {
    this.#note({ f: 340, to: 760, dur: 0.07, vol: 0.26 });
  }

  get unlocked(): boolean {
    return this.#unlocked;
  }
}

export const sfx = new Sfx();

/** Maps a pet state onto the sound it makes on entry. */
export function soundForState(state: string): (() => void) | null {
  switch (state) {
    case 'happy': return () => sfx.chirp();
    case 'celebrating': return () => sfx.celebrate();
    case 'sad': return () => sfx.whine();
    case 'notifying': return () => sfx.ping();
    case 'sleeping': return () => sfx.snore();
    case 'talking': return () => sfx.bark();
    default: return null;
  }
}
