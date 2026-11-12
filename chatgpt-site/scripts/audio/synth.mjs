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
const CIN_IMPACT = ['impact','thud','thump','land','clunk','stamp','sub','drop'];
const CIN_MOVE = ['swish','whoosh','whump','slide','whip'];
const CIN_ACCENT = ['pop','pluck','coin','coins','ding','sparkle','shimmer','click','tick','tap','glass'];
const CIN_BUILD = ['build','rise','reverse','rumble'];

/** Deterministic, mono 48 kHz PCM synthesis. No external binary is needed to author the WAV. */
export async function synthesizeToFile(kind, variant, requestedSeconds, path, options = {}) {
  const seconds = Math.max(0.08, Math.min(kind === 'hum' ? 120 : 8, requestedSeconds));
  const frames = Math.ceil(seconds * RATE);
  const seed = hashSeed(kind, variant);
  let state = seed;
  let low = 0;
  let mid = 0;
  let movingFilter = 0;
  const noise = new Float32Array(frames);
  const lowNoise = new Float32Array(frames);
  const midNoise = new Float32Array(frames);
  const highNoise = new Float32Array(frames);
  const lowCut = 0.018 + (variant % 3) * 0.006;
  for (let i = 0; i < frames; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const n = ((state >>> 0) / 2147483648) - 1;
    noise[i] = n;
    low += lowCut * (n - low);
    mid += 0.085 * (n - mid);
    lowNoise[i] = low;
    midNoise[i] = mid - low;
    highNoise[i] = n - mid;
  }

  const notes = [0, 2, 4, 7, 9, 12];
  const base = 1.025 ** (notes[variant % notes.length] - 4);
  const out = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    const u = Math.min(1, t / seconds);
    const n = noise[i], lo = lowNoise[i], md = midNoise[i], hi = highNoise[i];
    let s = 0;
    if (options.style === 'cinematic' && (CIN_IMPACT.includes(kind) || CIN_MOVE.includes(kind) || CIN_ACCENT.includes(kind) || CIN_BUILD.includes(kind))) {
      if (CIN_ACCENT.includes(kind)) {
        // Percussive, NON-melodic accents (owner: "sound effects — clicks and stuff, not notes"):
        // short noise transients, damped woody/plastic bodies and inharmonic metal partials.
        const v = variant % 3, metal = (f) => Math.sin(TAU * f * t);
        if (kind === 'click' || kind === 'tick' || kind === 'tap') {
          // dry plastic/wood click: 3 ms noise snap + tiny damped body around 1–2 kHz + soft low knock
          const snap = Math.exp(-t / 0.0028) * hi * 0.55 + Math.exp(-t / 0.006) * md * 0.5;
          const body = Math.exp(-t / (0.018 + v * 0.004)) * metal((kind === 'tick' ? 1850 : 1250) + v * 170) * 0.22;
          const knock = Math.exp(-t / 0.03) * metal(kind === 'tap' ? 210 : 320) * 0.18;
          s = snap + body + knock;
        } else if (kind === 'pop') {
          // mouth/bubble pop: very fast downward chirp (≈ 60 ms) with a breathy edge — percussive, not a note
          const fq = 140 + 520 * Math.exp(-t / 0.012) + v * 25;
          const ph = TAU * (140 * t + 520 * 0.012 * (1 - Math.exp(-t / 0.012)) + v * 25 * t);
          s = Math.exp(-t / 0.032) * Math.sin(ph) * 0.55 + Math.exp(-t / 0.008) * md * 0.35 + Math.exp(-t / 0.05) * lo * 0.2;
          void fq;
        } else if (kind === 'coin' || kind === 'coins') {
          // metal clink: inharmonic partials with fast decay; 'coins' = a little cascade of clinks
          const hits = kind === 'coins' ? [0, 0.055, 0.105, 0.17, 0.25] : [0];
          for (const [k, h] of hits.entries()) {
            const dt = t - h; if (dt < 0) continue;
            const r = 1 + ((v + k) % 4) * 0.045, g = (kind === 'coins' ? 0.75 - k * 0.11 : 1);
            s += g * (Math.exp(-dt / 0.0025) * hi * 0.35 + Math.exp(-dt / 0.07) * (Math.sin(TAU * 2350 * r * dt) * 0.16 + Math.sin(TAU * 3720 * r * dt + 0.5) * 0.12 + Math.sin(TAU * 5480 * r * dt + 1.1) * 0.07) + Math.exp(-dt / 0.012) * Math.sin(TAU * 760 * r * dt) * 0.12);
          }
        } else if (kind === 'glass') {
          // glass tick: bright snap + short inharmonic ring
          s = Math.exp(-t / 0.002) * hi * 0.4 + Math.exp(-t / 0.11) * (metal(2930 + v * 140) * 0.14 + metal(4610 + v * 90) * 0.1 + metal(6870) * 0.05);
        } else if (kind === 'sparkle' || kind === 'shimmer') {
          // granular sparkle: a scatter of tiny bright ticks fading out (no pitch line)
          const grains = kind === 'shimmer' ? 14 : 9;
          for (let k = 0; k < grains; k++) {
            const h = (k / grains) ** 1.3 * Math.min(0.5, seconds * 0.7) + ((k * 7919 + v * 31) % 97) / 97 * 0.03, dt = t - h;
            if (dt < 0) continue;
            s += (1 - k / grains) * (Math.exp(-dt / 0.003) * hi * 0.22 + Math.exp(-dt / 0.03) * metal(3100 + ((k * 337 + v * 101) % 2400)) * 0.07);
          }
        } else if (kind === 'ding') {
          // service-bell style end hit: strike + inharmonic metal ring (not a melodic note)
          s = Math.exp(-t / 0.004) * hi * 0.4 + Math.exp(-t / 0.55) * (metal(1210 + v * 30) * 0.2 + metal(2870 + v * 50) * 0.11 + metal(4130) * 0.06 + metal(1830) * 0.05) * env(t, seconds, 0.002, Math.min(0.3, seconds * 0.25));
        } else {
          // pluck → soft "thwip": short filtered-noise swipe with a falling resonance
          const ph = TAU * (300 * t + 900 * 0.02 * (1 - Math.exp(-t / 0.02)));
          s = Math.exp(-t / 0.05) * (md * 0.4 + Math.sin(ph) * 0.18) + Math.exp(-t / 0.004) * hi * 0.2;
        }
        s *= 1.15;
      } else if (CIN_IMPACT.includes(kind)) {
        const length = Math.min(seconds, kind === 'sub' ? 0.62 : 0.46);
        const low = kind === 'sub' ? 48 : kind === 'drop' ? 87 : 76 + (variant % 3) * 6;
        const end = kind === 'sub' ? 33 : 39 + (variant % 3) * 3;
        const tau = kind === 'sub' ? 0.67 : 0.57 + (variant % 3) * 0.12;
        const e = Math.exp(-t / tau) * env(t, seconds, 0.026 + (variant % 2) * 0.008, Math.min(0.34, seconds * 0.3));
        const phase = sweepPhase(t, low, end, length, 1.18);
        const body = Math.sin(phase) * 0.55 + Math.sin(phase * 1.97 + 0.18) * 0.17;
        const woody = Math.sin(TAU * (kind === 'stamp' ? 135 : 104 + variant * 7) * t) * 0.09;
        const contact = Math.exp(-t / 0.042) * md * 0.06;
        s = e * (body + Math.sin(TAU * 53 * t + 0.4) * 0.13 + lo * 0.16 + woody) + contact;
      } else if (CIN_MOVE.includes(kind)) {
        const rising = options.direction === 'up' || options.direction === 'departure';
        const passCenter = kind === 'whip' ? 0.42 : 0.54;
        const passWidth = kind === 'whip' ? 0.25 : 0.37;
        const pass = Math.exp(-((u - passCenter) ** 2) / (2 * passWidth * passWidth));
        const attack = 0.06 + u * 0.045;
        const cutoff = rising ? 0.016 + 0.07 * u : 0.086 - 0.07 * u;
        movingFilter += cutoff * (n - movingFilter);
        const from = rising ? 135 : 620;
        const to = rising ? 640 : 128;
        const phase = sweepPhase(t, from + variant * 8, to + variant * 5, seconds, 1.12);
        const e = env(t, seconds, 0.055, Math.min(0.18, seconds * 0.18));
        s = e * (pass * (movingFilter * 0.22 + lo * 0.1 + Math.sin(phase) * 0.065) + movingFilter * 0.09);
      } else if (CIN_BUILD.includes(kind)) {
        const roll = kind === 'build' || kind === 'rumble';
        const count = 5 + variant * 2;
        const interval = seconds / count;
        let drums = 0;
        if (roll) {
          for (let hit = 0; hit < count; hit++) {
            const local = t - hit * interval;
            if (local < 0) continue;
            const amp = 0.11 + 0.12 * (hit / Math.max(1, count - 1));
            const hitEnv = Math.exp(-local / (0.075 + 0.035 * (hit / count)));
            const f0 = 54 + 24 * (hit / Math.max(1, count - 1));
            drums += amp * hitEnv * (Math.sin(TAU * f0 * local) + Math.sin(TAU * f0 * 1.51 * local) * 0.22);
          }
        }
        const edge = env(t, seconds, 0.035, Math.min(0.065, seconds * 0.08));
        const swell = u ** (kind === 'reverse' ? 1.6 : 1.28);
        const cutoff = 0.012 + 0.067 * u;
        movingFilter += cutoff * (n - movingFilter);
        const phase = sweepPhase(t, 110, 560 + variant * 40, seconds, 1.42);
        const air = (movingFilter * 0.19 + md * 0.11 + Math.sin(phase) * 0.038) * swell;
        s = edge * (drums + air + Math.sin(TAU * (42 + 8 * u) * t) * swell * 0.12);
      }
    } else switch (kind) {
      case 'pop': {
        const e = decay(t, seconds, 0.145 + (variant % 3) * 0.02, 0.006);
        const p = TAU * (178 * base * t);
        s = e * (Math.sin(p) * 0.40 + Math.sin(p * 2.03 + Math.sin(p * 1.49) * 0.12) * 0.20 + Math.sin(TAU * 72 * t) * 0.18 + md * 0.12);
        break;
      }
      case 'tick': case 'tap': case 'click': case 'snap': {
        const tau = kind === 'tick' ? 0.028 : kind === 'click' ? 0.045 : 0.095;
        const e = decay(t, seconds, tau, kind === 'snap' ? 0.003 : 0.0015);
        const f = kind === 'tick' ? 310 : kind === 'tap' ? 255 : kind === 'click' ? 205 : 148;
        const p = TAU * f * base * t;
        const transient = kind === 'snap' ? md * 0.20 : md * (kind === 'tick' ? 0.10 : 0.07);
        s = e * (Math.sin(p) * 0.38 + Math.sin(p * 1.93) * 0.12 + Math.sin(TAU * (kind === 'snap' ? 68 : 92) * t) * 0.14 + transient);
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
      case 'shimmer': case 'sparkle': case 'glass': case 'coin': {
        const e = decay(t, seconds, kind === 'glass' ? 0.38 : 0.26, 0.003);
        const f = (kind === 'coin' ? 980 : kind === 'glass' ? 1080 : 1460) * base;
        const p = TAU * f * t;
        const detune = Math.sin(TAU * (f * 1.497) * t + Math.sin(TAU * f * 0.23 * t) * 0.14);
        const stagger = variant % 2 ? Math.sin(TAU * f * 2.03 * Math.max(0, t - 0.014)) : Math.sin(TAU * f * 2.51 * t);
        s = e * (Math.sin(p) * 0.44 + detune * 0.26 + stagger * 0.13 + hi * 0.035);
        break;
      }
      case 'ding': {
        // A warm two-note major-third button with a soft lower body and a long designed tail.
        const first = decay(t, seconds, 0.42, 0.004);
        const secondAt = 0.135, secondTime = t - secondAt;
        const second = secondTime > 0 ? decay(secondTime, Math.max(0.08, seconds - secondAt), 0.34, 0.004) : 0;
        const f = 660 * base, p1 = TAU * f * t, p2 = TAU * f * 1.26 * Math.max(0, secondTime);
        s = first * (Math.sin(p1) * 0.32 + Math.sin(p1 * 2.01) * 0.08 + Math.sin(p1 * 0.5) * 0.14)
          + second * (Math.sin(p2) * 0.28 + Math.sin(p2 * 2.02) * 0.07);
        break;
      }
      case 'impact': case 'thud': case 'drop': case 'bass': case 'land': case 'step': case 'heartbeat': {
        const impactLen = Math.min(seconds, kind === 'drop' || kind === 'bass' ? 0.7 : 0.52);
        const e = Math.exp(-t / (kind === 'drop' ? 0.33 : kind === 'bass' ? 0.42 : 0.17)) * env(t, seconds, 0.002, 0.08);
        const p = sweepPhase(t, kind === 'drop' ? 112 : kind === 'step' ? 105 : 78, kind === 'drop' ? 42 : 52, impactLen, 1.1);
        const click = Math.exp(-t / 0.012) * hi;
        const pulse = kind === 'heartbeat' ? Math.max(0, Math.sin(TAU * 2.45 * t)) ** 5 : 0;
        s = e * (Math.sin(p) * (kind === 'bass' ? 0.56 : 0.48) + Math.sin(p * 2.03) * 0.15 + lo * 0.18 + md * 0.07) + click * 0.045 + pulse * 0.22;
        break;
      }
      case 'swish': case 'whoosh': case 'whip': {
        const center = kind === 'whip' ? 0.34 : variant === 1 ? 0.43 : 0.56;
        const width = kind === 'whip' ? 0.12 : 0.27;
        const pass = Math.exp(-((u - center) ** 2) / (2 * width * width));
        const e = env(t, seconds, 0.012, 0.055);
        const phase = sweepPhase(t, 520, kind === 'whip' ? 190 : 350, seconds, 1.2);
        s = e * (pass * (md * 0.17 + lo * 0.2 + Math.sin(phase) * 0.09) + Math.sin(phase) * 0.045);
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
        const e = decay(t, seconds, kind === 'crack' ? 0.055 : 0.10, kind === 'crack' ? 0.0007 : 0.0025);
        const body = Math.sin(TAU * (kind === 'stamp' ? 142 : kind === 'clack' ? 205 : 265) * base * t);
        s = e * ((kind === 'crack' ? hi * 0.22 : md * 0.11) + lo * 0.22 + body * 0.34 + Math.sin(TAU * 62 * t) * 0.10);
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
        s = env(t, seconds, 0.03, 0.14) * gesture * (md * 0.18 + lo * 0.16 + hi * 0.025);
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
      case 'thump': {
        const e = Math.exp(-t / (0.19 + variant * 0.018)) * env(t, seconds, 0.009, 0.13);
        const p = sweepPhase(t, 88 + variant * 3, 48 + variant * 2, Math.min(seconds, 0.32), 0.8);
        s = e * (Math.sin(p) * 0.42 + Math.sin(p * 1.93) * 0.13 + Math.sin(TAU * 68 * t) * 0.16 + lo * 0.14 + md * 0.035);
        break;
      }
      case 'knock': {
        const first = decay(t, seconds, 0.13 + variant * 0.012, 0.006);
        const reboundAt = 0.092 + variant * 0.008, rt = t - reboundAt;
        const rebound = rt > 0 ? decay(rt, Math.max(0.08, seconds - reboundAt), 0.075, 0.004) * 0.28 : 0;
        const wood = Math.sin(TAU * 184 * base * t) * 0.37 + Math.sin(TAU * 286 * base * t) * 0.13;
        s = first * (wood + lo * 0.13 + md * 0.045) + rebound * wood;
        break;
      }
      case 'whump': {
        const e = env(t, seconds, 0.028, 0.18) * Math.exp(-t / 0.29);
        const p = sweepPhase(t, 112 + variant * 4, 52, seconds, 1.25);
        const air = Math.sin(TAU * (variant === 1 ? 69 : 62) * t) * 0.12;
        s = e * (Math.sin(p) * 0.34 + air + lo * 0.23 + md * 0.045);
        break;
      }
      case 'sub': {
        const length = Math.min(seconds, 0.34);
        const e = env(t, seconds, 0.018, 0.12) * Math.exp(-t / 0.19);
        const p = sweepPhase(t, 52 + variant, 35 + variant, length, 1.1);
        s = e * (Math.sin(p) * 0.46 + Math.sin(p * 1.51) * 0.06);
        break;
      }
      case 'rustle': {
        const motion = (0.24 + 0.76 * Math.max(0, Math.sin(TAU * (2.2 + variant * 0.23) * t + variant)))
          * (0.7 + 0.3 * Math.sin(TAU * 0.43 * t));
        s = env(t, seconds, 0.04, 0.15) * motion * (md * 0.19 + lo * 0.055 + hi * 0.009);
        break;
      }
      case 'creak': {
        const e = env(t, seconds, 0.028, 0.12);
        const wobble = 1 + 0.035 * Math.sin(TAU * (5.2 + variant) * t);
        const p = sweepPhase(t, 138 + variant * 5, 226 + variant * 9, seconds, 1.3);
        s = e * (Math.sin(p) * 0.31 * wobble + Math.sin(p * 2.07) * 0.075 + md * 0.045 + lo * 0.08);
        break;
      }
      case 'clunk': {
        const e = decay(t, seconds, 0.19 + variant * 0.02, 0.007);
        const p = TAU * (82 + variant * 2) * base * t;
        const contact = Math.exp(-t / 0.018) * md * 0.065;
        s = e * (Math.sin(p) * 0.38 + Math.sin(p * 1.91) * 0.18 + Math.sin(p * 3.05) * 0.06 + lo * 0.18) + contact;
        break;
      }
      case 'slide': {
        const travel = Math.sin(Math.PI * Math.min(1, u)) ** 0.72;
        const grain = 0.58 + 0.42 * Math.sin(TAU * (4.4 + variant * 0.25) * t) ** 2;
        s = env(t, seconds, 0.035, 0.12) * travel * grain * (md * 0.16 + lo * 0.065 + Math.sin(TAU * 245 * t) * 0.04);
        break;
      }
      case 'footfall': {
        const e = decay(t, seconds, 0.11 + variant * 0.012, 0.008);
        const p = sweepPhase(t, 96 + variant * 3, 55, Math.min(seconds, 0.24), 1.0);
        s = e * (Math.sin(p) * 0.35 + Math.sin(p * 1.83) * 0.10 + Math.sin(TAU * 78 * t) * 0.14 + lo * 0.10 + md * 0.045);
        break;
      }
      case 'pluck': {
        const e = Math.exp(-t / (0.16 + variant * 0.012)) * env(t, seconds, 0.003, 0.10);
        const p = sweepPhase(t, 122 + variant * 4, 108 + variant * 3, seconds, 0.7);
        s = e * (Math.sin(p) * 0.36 + Math.sin(p * 2.02) * 0.12 + Math.sin(p * 0.5) * 0.08 + lo * 0.055);
        break;
      }
      case 'gulp': {
        const e = env(t, seconds, 0.014, 0.15) * Math.exp(-t / 0.34);
        const p = sweepPhase(t, 176 + variant * 5, 76 + variant * 3, seconds, 0.72);
        const bubble = 0.76 + 0.24 * Math.sin(TAU * (3.8 + variant * 0.2) * t) ** 2;
        s = e * bubble * (Math.sin(p) * 0.38 + Math.sin(p * 1.52) * 0.11 + Math.sin(p * 2.03) * 0.075 + lo * 0.05);
        break;
      }
      case 'hum': {
        const e = env(t, seconds, 0.16, 0.28);
        const f = 52 + variant * 3;
        s = e * (Math.sin(TAU * f * t) * 0.26 + Math.sin(TAU * (f * 1.49) * t + 0.3 * Math.sin(TAU * 0.7 * t)) * 0.11);
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
