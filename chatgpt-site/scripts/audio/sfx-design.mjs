/** One sound palette for every public CueKind. Gains are relative to the mix bus. */
export const SFX = {
  pop:       { seconds: 0.34, gain: 0.30, variants: 3, room: true },
  tick:      { seconds: 0.12, gain: 0.19, variants: 3 },
  type:      { seconds: 2.4,  gain: 0.18, variants: 3, source: 'eleven', prompt: 'Close-miked, soft mechanical keyboard typing in a short controlled burst, muted premium tactile keycaps, dry studio recording, no room noise, no music, no voice', promptSeconds: 2.4 },
  rise:      { seconds: 0.7,  gain: 0.24, variants: 2, sustained: true },
  shimmer:   { seconds: 0.72, gain: 0.22, variants: 3, room: true },
  glitch:    { seconds: 0.32, gain: 0.20, variants: 3 },
  impact:    { seconds: 0.52, gain: 0.34, variants: 3 },
  swish:     { seconds: 0.42, gain: 0.23, variants: 3 },
  whoosh:    { seconds: 0.7,  gain: 0.22, variants: 3, source: 'eleven', prompt: 'One elegant short stereo air whoosh passing left to right, shaped low-mid air with a clean soft transient, premium motion-graphics transition, no bass boom, no hiss, no music, no voice', promptSeconds: 0.9 },
  whip:      { seconds: 0.28, gain: 0.24, variants: 3, source: 'eleven', prompt: 'A single precise short whip-pan air snap, smooth filtered air sweep with a restrained soft transient, modern cinematic UI motion, no cracking whip, no harsh treble, no music', promptSeconds: 0.55 },
  coin:      { seconds: 0.46, gain: 0.24, variants: 3, room: true },
  coins:     { seconds: 0.85, gain: 0.22, variants: 3, source: 'eleven', prompt: 'A small elegant cascade of three metallic coin pickups, bright but soft silver chimes with quick separated timing and a clean tail, polished game UI sound, no cash register, no music', promptSeconds: 0.9 },
  cash:      { seconds: 0.48, gain: 0.21, variants: 2, source: 'eleven', prompts: [
    'A single crisp slap of a small stack of paper banknotes onto a hard counter, thick dry paper body with a quick soft flutter, close premium foley, no coin, no cash register, no music, no voice',
    'One restrained bundle of notes lands flat on a desk: firm palm-sized paper slap, layered fibrous flutter and short low contact, realistic close studio recording, no counting, no register, no music',
  ], promptSeconds: 0.65 },
  thud:      { seconds: 0.42, gain: 0.30, variants: 3 },
  crack:     { seconds: 0.3,  gain: 0.24, variants: 2 },
  shatter:   { seconds: 0.68, gain: 0.20, variants: 2, room: true, source: 'eleven', prompt: 'A small delicate glass crystal breaking into a few soft pieces, restrained high detail with a short clean tail, stylized and nonviolent, no explosion, no dramatic crash, no music', promptSeconds: 0.75 },
  click:     { seconds: 0.1,  gain: 0.18, variants: 3 },
  clack:     { seconds: 0.18, gain: 0.22, variants: 2, source: 'eleven', prompts: [
    'One close-miked steel ticket-vault latch closing: a compact sliding bolt followed by a precise metal stop, dense machined resonance and a short dry tail, no keys, no jangle, no music, no voice',
    'One heavy brushed-metal locking mechanism seats firmly with a small double contact, tactile bolt travel and a clean low-mid clack, restrained premium foley, close dry recording, no rattle, no music',
  ], promptSeconds: 0.65 },
  servo:     { seconds: 0.82, gain: 0.21, variants: 2, source: 'eleven', prompts: [
    'A premium close-miked hydraulic press engaging once: a short weighted metal slide, compressed mechanical clunk and soft piston release, dense machined steel body with restrained low resonance, dry studio foley, no alarm, no music, no voice',
    'A precision industrial actuator makes one deliberate movement and seats into a metal stop: compact motor strain, solid latch clack and brief steel vibration, intimate tactile foley, clean controlled tail, no alarm, no music, no voice',
  ], promptSeconds: 0.9 },
  boing:     { seconds: 0.55, gain: 0.20, variants: 2 },
  sparkle:   { seconds: 0.78, gain: 0.20, variants: 3, room: true },
  drop:      { seconds: 0.68, gain: 0.30, variants: 2 },
  bass:      { seconds: 0.62, gain: 0.28, variants: 2 },
  glass:     { seconds: 0.58, gain: 0.20, variants: 2, room: true, source: 'eleven', prompt: 'One clear small glass tap with a delicate resonant crystalline ring, warm restrained overtones, clean studio recording, no clinking cluster, no break, no music', promptSeconds: 0.65 },
  paper:     { seconds: 0.55, gain: 0.20, variants: 2, source: 'eleven', prompts: [
    'A concert ticket tears once along its perforation: crisp fibrous paper rip, a small stiff-stock flap and a few delicate falling paper fibers, close-miked dry studio foley, one gesture only, no voice, no music',
    'A single thick ticket is torn cleanly at the perforation, sharp paper grain and a short soft flutter as the two pieces separate, intimate premium tactile foley, no extra shuffling, no voice, no music',
  ], promptSeconds: 0.8 },
  stamp:     { seconds: 0.35, gain: 0.26, variants: 2 },
  alarm:     { seconds: 0.92, gain: 0.16, variants: 2, source: 'eleven', prompt: 'A restrained two-pulse low-volume electronic warning tone, rounded and neutral, no panic, no siren sweep, no harsh treble, clean isolated UI sound, no music', promptSeconds: 1.0 },
  heartbeat: { seconds: 0.78, gain: 0.20, variants: 2, source: 'eleven', prompt: 'Two soft rounded heartbeat thumps with a subtle low body, calm and intimate, tasteful cinematic tension, no breathing, no music, no exaggerated sub-bass', promptSeconds: 0.85 },
  zap:       { seconds: 0.24, gain: 0.18, variants: 2 },
  rumble:    { seconds: 0.9,  gain: 0.22, variants: 2, sustained: true, source: 'eleven', prompts: [
    'A short cinematic swell of a close, expectant crowd in a concert hall: layered indistinct audience murmur rises with a few soft collective gasps, broad but controlled, no intelligible words, no cheers, no music, no sharp whistles',
    'A compact crowd anticipation swell in a live venue, many distant voices blending into a low textured murmur that gathers and recedes, realistic room depth with a subtle low body, no intelligible speech, no music, no isolated shouts',
  ], promptSeconds: 1.0 },
  snap:      { seconds: 0.18, gain: 0.23, variants: 3 },
  beep:      { seconds: 0.26, gain: 0.19, variants: 3 },
  step:      { seconds: 0.25, gain: 0.20, variants: 3 },
  land:      { seconds: 0.5,  gain: 0.30, variants: 3 },
  squeak:    { seconds: 0.32, gain: 0.16, variants: 2 },
  build:     { seconds: 1.2,  gain: 0.22, variants: 2, sustained: true },
  reverse:   { seconds: 0.76, gain: 0.20, variants: 2, sustained: true },
  tape:      { seconds: 0.48, gain: 0.22, variants: 2 },
  ding:      { seconds: 0.5, gain: 0.24, variants: 3, room: true, tail: 0.46 },
};

export const MUSIC_BPM = { drive: 118, chill: 92, tense: 108, bright: 124 };

export function variantPitch(kind, variant) {
  const count = SFX[kind]?.variants ?? 1;
  if (count <= 1) return 0;
  return [-1.15, 0, 1.05, -0.55][variant % 4];
}
