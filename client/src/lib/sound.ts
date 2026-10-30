// Petits sons synthétisés (Web Audio) : dés, cuir, charango et flûte de pan, aucun fichier à charger.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.value = opts.freq ?? 2400;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Un dé d'os qui claque contre la paroi. */
function clack(delay: number, gain = 0.16): void {
  noise(0.03, { gain, freq: 2200 + Math.random() * 2600, delay });
  tone(900 + Math.random() * 1500, 0.025, { type: 'square', gain: gain * 0.16, delay });
}

/** Une corde de charango : une attaque sèche et deux harmoniques qui s'éteignent vite. */
function pluck(freq: number, gain = 0.1, delay = 0): void {
  tone(freq, 0.42, { type: 'triangle', gain, delay });
  tone(freq * 2, 0.26, { type: 'sine', gain: gain * 0.5, delay });
  tone(freq * 3, 0.14, { type: 'sine', gain: gain * 0.25, delay });
  noise(0.012, { gain: gain * 0.9, freq: 3800, delay });
}

/** Une note de flûte de pan : du souffle, et une sinusoïde qui prend doucement. */
function pan(freq: number, delay: number, dur = 0.42): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  const lfo = a.createOscillator();
  const depth = a.createGain();
  lfo.frequency.value = 5.2;
  depth.gain.value = freq * 0.006;
  lfo.connect(depth).connect(osc.frequency);
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.07);
  g.gain.setValueAtTime(0.09, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
  noise(dur * 0.7, { gain: 0.05, freq: freq * 2.2, delay });
}

export const sfx = {
  /** Les dés qui s'entrechoquent dans le cuir, le temps que les gobelets s'agitent. */
  rattle: () => {
    for (let t = 0; t < 1.6; t += 0.05 + Math.random() * 0.07) clack(t, 0.09 + Math.random() * 0.1);
    noise(1.6, { gain: 0.05, freq: 500 });
  },
  slam: () => {
    noise(0.14, { gain: 0.9, freq: 170, type: 'lowpass' });
    tone(95, 0.2, { gain: 0.25, slide: 0.55 });
    [0.03, 0.08, 0.14].forEach((d) => clack(d, 0.12));
  },
  bid: (qty: number) => {
    const base = 262 * 2 ** (Math.min(qty, 12) / 12);
    pluck(base, 0.11);
    pluck(base * 1.5, 0.09, 0.07);
  },
  turn: () => {
    pluck(659, 0.09);
    pluck(880, 0.09, 0.09);
    pluck(1319, 0.07, 0.18);
  },
  dudo: () => {
    noise(0.5, { gain: 0.9, freq: 130, type: 'lowpass' });
    noise(0.1, { gain: 0.35, freq: 3000 });
    [146, 175, 220].forEach((f) => tone(f, 0.55, { type: 'sawtooth', gain: 0.1, slide: 0.86 }));
  },
  calza: () => {
    noise(0.3, { gain: 0.6, freq: 180, type: 'lowpass' });
    [330, 440, 554].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', gain: 0.07, delay: i * 0.05, slide: 1.05 }));
  },
  lift: () => [0, 0.05, 0.11].forEach((d) => noise(0.16, { gain: 0.14, freq: 900, delay: d })),
  /** Un dé compté : chaque dé sonne un peu plus haut, la tension monte. */
  count: (n: number) => {
    clack(0, 0.2);
    pluck(196 * 2 ** (n / 12), 0.12);
  },
  good: () => [523, 659, 784].forEach((f, i) => pluck(f, 0.1, i * 0.09)),
  bad: () => {
    tone(110, 0.5, { type: 'sawtooth', gain: 0.1, slide: 0.5 });
    [392, 311, 247].forEach((f, i) => pluck(f, 0.1, i * 0.13));
  },
  /** Le joker du Palifico : le soleil se lève. */
  palifico: () => [294, 370, 440, 587].forEach((f, i) => pan(f, i * 0.2, 0.55)),
  champion: () => [392, 440, 494, 587, 659, 587, 659, 784].forEach((f, i) => pan(f, i * 0.17, 0.4)),
  pop: () => tone(700, 0.08, { gain: 0.06, slide: 1.6 }),
};
