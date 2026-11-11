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
  cash:      { seconds: 0.48, gain: 0.19, variants: 2 },
  thud:      { seconds: 0.42, gain: 0.30, variants: 3 },
  crack:     { seconds: 0.3,  gain: 0.24, variants: 2 },
  shatter:   { seconds: 0.68, gain: 0.20, variants: 2, room: true, source: 'eleven', prompt: 'A small delicate glass crystal breaking into a few soft pieces, restrained high detail with a short clean tail, stylized and nonviolent, no explosion, no dramatic crash, no music', promptSeconds: 0.75 },
  click:     { seconds: 0.1,  gain: 0.18, variants: 3 },
  clack:     { seconds: 0.18, gain: 0.20, variants: 3 },
  servo:     { seconds: 0.82, gain: 0.18, variants: 2, source: 'eleven', prompt: 'A small precision servo motor engaging and settling, two restrained metallic movements with a smooth electric whirr, close dry studio foley, no alarm, no heavy machinery, no music', promptSeconds: 0.9 },
  boing:     { seconds: 0.55, gain: 0.20, variants: 2 },
  sparkle:   { seconds: 0.78, gain: 0.20, variants: 3, room: true },
  drop:      { seconds: 0.68, gain: 0.30, variants: 2 },
  bass:      { seconds: 0.62, gain: 0.28, variants: 2 },
  glass:     { seconds: 0.58, gain: 0.20, variants: 2, room: true, source: 'eleven', prompt: 'One clear small glass tap with a delicate resonant crystalline ring, warm restrained overtones, clean studio recording, no clinking cluster, no break, no music', promptSeconds: 0.65 },
  paper:     { seconds: 0.72, gain: 0.16, variants: 2, source: 'eleven', prompt: 'A short close paper shuffle and crisp page flick, soft tactile stock, controlled single gesture, dry studio foley, no speech, no music', promptSeconds: 0.8 },
  stamp:     { seconds: 0.35, gain: 0.26, variants: 2 },
  alarm:     { seconds: 0.92, gain: 0.16, variants: 2, source: 'eleven', prompt: 'A restrained two-pulse low-volume electronic warning tone, rounded and neutral, no panic, no siren sweep, no harsh treble, clean isolated UI sound, no music', promptSeconds: 1.0 },
  heartbeat: { seconds: 0.78, gain: 0.20, variants: 2, source: 'eleven', prompt: 'Two soft rounded heartbeat thumps with a subtle low body, calm and intimate, tasteful cinematic tension, no breathing, no music, no exaggerated sub-bass', promptSeconds: 0.85 },
  zap:       { seconds: 0.24, gain: 0.18, variants: 2 },
  rumble:    { seconds: 0.9,  gain: 0.20, variants: 2, sustained: true },
  snap:      { seconds: 0.18, gain: 0.23, variants: 3 },
  beep:      { seconds: 0.26, gain: 0.19, variants: 3 },
  step:      { seconds: 0.25, gain: 0.20, variants: 3 },
  land:      { seconds: 0.5,  gain: 0.30, variants: 3 },
  squeak:    { seconds: 0.32, gain: 0.16, variants: 2 },
  build:     { seconds: 1.2,  gain: 0.22, variants: 2, sustained: true },
  reverse:   { seconds: 0.76, gain: 0.20, variants: 2, sustained: true },
  tape:      { seconds: 0.48, gain: 0.22, variants: 2 },
  ding:      { seconds: 0.62, gain: 0.24, variants: 3, room: true },
};

export const MUSIC_BPM = { drive: 118, chill: 92, tense: 110, bright: 124 };

export function variantPitch(kind, variant) {
  const count = SFX[kind]?.variants ?? 1;
  if (count <= 1) return 0;
  return [-1.15, 0, 1.05, -0.55][variant % 4];
}
