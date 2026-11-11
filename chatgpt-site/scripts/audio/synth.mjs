import {writeFile} from 'node:fs/promises';

const RATE = 48000;
const TAU = Math.PI * 2;
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const hashSeed = (text, variant) => {
  let h = 2166136261 ^ variant;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0 || 1;
};
const env = (t, length, attack = 0.004, release = 0.12) =>
  Math.max(0, Math.min(1, t / Math.max(0.001, attack), (length - t) / Math.max(0.001, release)));
const decay = (t, length, tau = 0.18, attack = 0.003) =>
  Math.max(0, Math.min(1, t / attack, (length - t) / Math.max(0.001, length * 0.12))) * Math.exp(-t / tau);
const sweepPhase = (t, from, to, length, bend = 1) => {
  const u = Math.max(0, Math.min(1, t / length));
  return TAU * (from * t + (to - from) * length * (u ** (bend + 1)) / (bend + 1));
};

/** Deterministic, mono 48 kHz PCM synthesis. No external binary is needed to author the WAV. */
export async function synthesizeToFile(kind, variant, requestedSeconds, path) {
  const seconds = Math.max(0.08, Math.min(8, requestedSeconds));
  const frames = Math.ceil(seconds * RATE);
  const seed = hashSeed(kind, variant);
  let state = seed;
  let low = 0;
  const noise = new Float32Array(frames);
  const lowNoise = new Float32Array(frames);
  const highNoise = new Float32Array(frames);
  const lowCut = 0.018 + (variant % 3) * 0.006;
  for (let i = 0; i < frames; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const n = ((state >>> 0) / 2147483648) - 1;
    noise[i] = n;
    low += lowCut * (n - low);
    lowNoise[i] = low;
    highNoise[i] = n - low;
  }

  const notes = [0, 2, 4, 7, 9, 12];
  const base = 1.025 ** (notes[variant % notes.length] - 4);
  const out = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    const u = Math.min(1, t / seconds);
    const n = noise[i], lo = lowNoise[i], hi = highNoise[i];
    let s = 0;
    switch (kind) {
      case 'pop': {
        const e = decay(t, seconds, 0.115 + (variant % 3) * 0.018, 0.002);
        const p = TAU * (540 * base * t);
        s = e * (Math.sin(p) * 0.62 + Math.sin(p * 2.01 + Math.sin(p * 1.49) * 0.25) * 0.24 + Math.sin(p * 3) * 0.08);
        break;
      }
      case 'tick': case 'click': case 'snap': {
        const e = decay(t, seconds, kind === 'tick' ? 0.022 : 0.036, 0.0008);
        const p = TAU * (kind === 'tick' ? 2050 : 1420) * base * t;
        s = e * (hi * (kind === 'snap' ? 0.46 : 0.3) + Math.sin(p) * 0.28 + Math.sin(p * 1.83) * 0.12);
        break;
      }
      case 'type': {
        const gate = Math.max(0, 1 - Math.abs(((t * 8.1 + variant * 0.31) % 1) - 0.35) * 5.5);
        const e = gate * env(t, seconds, 0.02, 0.08);
        s = e * (hi * 0.32 + Math.sin(TAU * (760 + 110 * Math.sin(t * 8)) * t) * 0.08);
        break;
      }
      case 'rise': case 'build': case 'reverse': {
        const swell = u ** (kind === 'rise' ? 1.3 : kind === 'reverse' ? 1.65 : 1.8);
        const edge = env(t, seconds, 0.015, kind === 'reverse' ? 0.06 : 0.08);
        const phase = sweepPhase(t, 115, kind === 'reverse' ? 880 : 760, seconds, 1.4);
        const shimmer = Math.sin(phase) * 0.12 + Math.sin(phase * 1.51) * 0.045;
        s = edge * (swell * (lo * 0.34 + hi * (kind === 'reverse' ? 0.28 : 0.13) + shimmer) + (kind === 'reverse' ? Math.sin(TAU * 54 * t) * u * 0.05 : Math.sin(TAU * 54 * t) * u * 0.08));
        break;
      }
      case 'shimmer': case 'sparkle': case 'ding': case 'glass': case 'coin': {
        const e = decay(t, seconds, kind === 'ding' || kind === 'glass' ? 0.38 : 0.26, 0.003);
        const f = (kind === 'coin' ? 980 : kind === 'ding' ? 1220 : kind === 'glass' ? 1080 : 1460) * base;
        const p = TAU * f * t;
        const detune = Math.sin(TAU * (f * 1.497) * t + Math.sin(TAU * f * 0.23 * t) * 0.14);
        const stagger = variant % 2 ? Math.sin(TAU * f * 2.03 * Math.max(0, t - 0.014)) : Math.sin(TAU * f * 2.51 * t);
        s = e * (Math.sin(p) * 0.44 + detune * 0.26 + stagger * 0.13 + hi * 0.035);
        break;
      }
      case 'impact': case 'thud': case 'drop': case 'bass': case 'land': case 'step': case 'heartbeat': {
        const impactLen = Math.min(seconds, kind === 'drop' || kind === 'bass' ? 0.7 : 0.52);
        const e = Math.exp(-t / (kind === 'drop' ? 0.33 : kind === 'bass' ? 0.42 : 0.17)) * env(t, seconds, 0.002, 0.08);
        const p = sweepPhase(t, kind === 'drop' ? 112 : kind === 'step' ? 105 : 78, kind === 'drop' ? 42 : 52, impactLen, 1.1);
        const click = Math.exp(-t / 0.012) * hi;
        const pulse = kind === 'heartbeat' ? Math.max(0, Math.sin(TAU * 2.45 * t)) ** 5 : 0;
        s = e * (Math.sin(p) * (kind === 'bass' ? 0.56 : 0.45) + Math.sin(p * 2.03) * 0.12 + lo * 0.12) + click * 0.14 + pulse * 0.22;
        break;
      }
      case 'swish': case 'whoosh': case 'whip': {
        const center = kind === 'whip' ? 0.34 : variant === 1 ? 0.43 : 0.56;
        const width = kind === 'whip' ? 0.12 : 0.27;
        const pass = Math.exp(-((u - center) ** 2) / (2 * width * width));
        const e = env(t, seconds, 0.012, 0.055);
        const phase = sweepPhase(t, 520, kind === 'whip' ? 190 : 350, seconds, 1.2);
        s = e * (pass * (hi * 0.29 + lo * 0.18 + Math.sin(phase) * 0.08) + Math.sin(phase) * 0.035);
        break;
      }
      case 'glitch': case 'zap': case 'beep': case 'alarm': {
        const pulse = kind === 'beep' ? (t < seconds * 0.75 ? 1 : 0) : kind === 'alarm' ? ((t % 0.33) < 0.2 ? 1 : 0) : kind === 'glitch' ? (((Math.floor(t * 38) + variant) % 5) < 3 ? 1 : 0) : 1;
        const p = kind === 'zap' ? sweepPhase(t, 620, 1450, seconds, 0.8) : TAU * (kind === 'alarm' ? 620 : kind === 'beep' ? 740 : 1100) * base * t;
        const e = env(t, seconds, 0.003, 0.045);
        s = e * pulse * (Math.sin(p) * 0.29 + (kind === 'glitch' ? hi * 0.14 : Math.sin(p * 2.01) * 0.05));
        break;
      }
      case 'clack': case 'stamp': case 'crack': {
        const e = decay(t, seconds, kind === 'crack' ? 0.055 : 0.085, 0.0007);
        const body = Math.sin(TAU * (kind === 'stamp' ? 170 : 290) * base * t);
        s = e * (hi * (kind === 'crack' ? 0.52 : 0.24) + lo * 0.2 + body * 0.22);
        break;
      }
      case 'coins': case 'cash': {
        const e = env(t, seconds, 0.004, 0.12);
        const p = TAU * (kind === 'cash' ? 430 : 840) * base * t;
        const clicks = kind === 'coins' ? Math.max(0, Math.sin(TAU * 4.2 * t)) ** 5 : 0;
        s = e * (Math.sin(p) * 0.2 + Math.sin(p * 2.41) * 0.13 + Math.sin(p * 3.7) * 0.07 + clicks * Math.sin(p * 1.7) * 0.2 + hi * 0.055);
        break;
      }
      case 'servo': {
        const gate = (t % 0.18) < 0.12 ? 1 : 0.35;
        const p = sweepPhase(t, 280, 190, seconds, 0.7);
        s = env(t, seconds, 0.008, 0.15) * gate * (Math.sin(p) * 0.22 + Math.sin(p * 2.03) * 0.11 + lo * 0.12);
        break;
      }
      case 'boing': case 'squeak': {
        const from = kind === 'boing' ? 400 : 560;
        const to = kind === 'boing' ? 88 : 980;
        const p = sweepPhase(t, from * base, to * base, seconds, kind === 'boing' ? 0.65 : 0.8);
        s = env(t, seconds, 0.004, 0.12) * Math.exp(-t / (kind === 'boing' ? 0.34 : 0.2)) * (Math.sin(p) * 0.32 + Math.sin(p * 2.01) * 0.08);
        break;
      }
      case 'paper': {
        const gesture = (Math.sin(TAU * 2.2 * t) * 0.5 + 0.5) ** 2;
        s = env(t, seconds, 0.015, 0.12) * gesture * (hi * 0.22 + lo * 0.12);
        break;
      }
      case 'rumble': {
        const swell = 0.65 + 0.35 * Math.sin(TAU * (1.1 + variant * 0.18) * t);
        s = env(t, seconds, 0.12, 0.2) * swell * (lo * 0.42 + Math.sin(TAU * 48 * t) * 0.16);
        break;
      }
      case 'tape': {
        const p = sweepPhase(t, 520, 38, seconds, 2.4);
        const flutter = 1 + 0.025 * Math.sin(TAU * 17 * t);
        s = env(t, seconds, 0.003, 0.15) * (Math.sin(p) * 0.32 + Math.sin(p * 2.01) * 0.07) * flutter;
        break;
      }
      default: {
        const e = decay(t, seconds, 0.16, 0.003);
        s = e * (Math.sin(TAU * 620 * base * t) * 0.25 + hi * 0.08);
      }
    }
    // Soft saturation rounds procedural transients before the bus compressor.
    const shaped = Math.tanh(s * 1.35) / Math.tanh(1.35);
    out[i] = Math.round(clamp(shaped * 0.72) * 32767);
  }

  const dataBytes = out.length * 2;
  const wav = Buffer.allocUnsafe(44 + dataBytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < out.length; i++) wav.writeInt16LE(out[i], 44 + i * 2);
  await writeFile(path, wav);
  return path;
}
