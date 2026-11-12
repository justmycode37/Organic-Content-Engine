/** One sound palette for every public CueKind. Gains are relative to the mix bus. */
export const SFX = {
  pop:       { seconds: 0.34, gain: 0.25, variants: 3, room: true, tier: 'dull', lowpass: 1850 },
  tick:      { seconds: 0.12, gain: 0.16, variants: 3, tier: 'dull', lowpass: 1550 },
  type:      { seconds: 2.4,  gain: 0.18, variants: 3, source: 'eleven', prompt: 'Close-miked, soft mechanical keyboard typing in a short controlled burst, muted premium tactile keycaps, dry studio recording, no room noise, no music, no voice', promptSeconds: 2.4 },
  rise:      { seconds: 0.7,  gain: 0.24, variants: 2, sustained: true },
  shimmer:   { seconds: 0.72, gain: 0.16, variants: 2, room: true, tier: 'bright', lowpass: 9000 },
  glitch:    { seconds: 0.32, gain: 0.20, variants: 3 },
  impact:    { seconds: 0.58, gain: 0.30, variants: 2, source: 'eleven', tier: 'dull', lowpass: 1700, prompts: [
    'One oversized mechanical BUY button slams down onto a hard steel console, a short heavy spring-loaded clunk with a decisive plastic-metal cap contact and low desk resonance, close tactile Foley, no electronic beep, no interface chirp, no speech, no music',
    'A thick industrial push-button is struck and bottoms out once: weighted metal housing knock, compressed spring snap and short low register, clean close-miked studio Foley, no alarm, no digital tone, no voice, no music',
  ], promptSeconds: 0.75 },
  swish:     { seconds: 0.42, gain: 0.19, variants: 3, tier: 'dull', lowpass: 2300 },
  whoosh:    { seconds: 0.7,  gain: 0.18, variants: 3, source: 'eleven', tier: 'dull', lowpass: 2600, prompt: 'One elegant short stereo air whoosh passing left to right, shaped low-mid air with a clean soft transient, premium motion-graphics transition, no bass boom, no hiss, no music, no voice', promptSeconds: 0.9 },
  whip:      { seconds: 0.28, gain: 0.24, variants: 3, source: 'eleven', prompt: 'A single precise short whip-pan air snap, smooth filtered air sweep with a restrained soft transient, modern cinematic UI motion, no cracking whip, no harsh treble, no music', promptSeconds: 0.55 },
  coin:      { seconds: 0.46, gain: 0.17, variants: 2, room: true, tier: 'bright', lowpass: 10000 },
  coins:     { seconds: 0.85, gain: 0.15, variants: 2, source: 'eleven', tier: 'bright', lowpass: 10500, prompt: 'A small elegant cascade of three metallic coin pickups, bright but soft silver chimes with quick separated timing and a clean tail, polished game UI sound, no cash register, no music', promptSeconds: 0.9 },
  cash:      { seconds: 0.48, gain: 0.21, variants: 2, source: 'eleven', prompts: [
    'A single firm slap of a small stack of banknotes onto a hard wooden counter, crisp fibrous paper contact, a short uneven flutter and dry low body, close-miked premium Foley, no coins, no register, no counting, no speech, no music',
    'A compact bundle of paper currency lands flat on a desk with one decisive palm-sized slap, layered note edges flutter once and settle, realistic intimate studio Foley, no cash register, no coin jingle, no voice, no music',
  ], promptSeconds: 0.65 },
  thud:      { seconds: 0.42, gain: 0.34, variants: 3, tier: 'deep', lowpass: 700 },
  crack:     { seconds: 0.3,  gain: 0.24, variants: 2 },
  shatter:   { seconds: 0.68, gain: 0.14, variants: 2, room: true, tier: 'bright', lowpass: 10500, source: 'eleven', prompt: 'A small delicate glass crystal breaking into a few soft pieces, restrained high detail with a short clean tail, stylized and nonviolent, no explosion, no dramatic crash, no music', promptSeconds: 0.75 },
  click:     { seconds: 0.1,  gain: 0.15, variants: 3, tier: 'dull', lowpass: 1300 },
  clack:     { seconds: 0.18, gain: 0.20, variants: 3, source: 'eleven', tier: 'dull', lowpass: 1550, prompts: [
    'One close-miked steel ticket-vault latch closing: a compact sliding bolt followed by a precise metal stop, dense machined resonance and a short dry tail, no keys, no jangle, no music, no voice',
    'One heavy brushed-metal locking mechanism seats firmly with a small double contact, tactile bolt travel and a clean low-mid clack, restrained premium foley, close dry recording, no rattle, no music',
  ], promptSeconds: 0.65 },
  servo:     { seconds: 0.82, gain: 0.18, variants: 2, source: 'eleven', tier: 'dull', lowpass: 1900, prompts: [
    'A premium close-miked hydraulic press engaging once: a short weighted metal slide, compressed mechanical clunk and soft piston release, dense machined steel body with restrained low resonance, dry studio foley, no alarm, no music, no voice',
    'A precision industrial actuator makes one deliberate movement and seats into a metal stop: compact motor strain, solid latch clack and brief steel vibration, intimate tactile foley, clean controlled tail, no alarm, no music, no voice',
  ], promptSeconds: 0.9 },
  boing:     { seconds: 0.55, gain: 0.20, variants: 2 },
  sparkle:   { seconds: 0.78, gain: 0.14, variants: 2, room: true, tier: 'bright', lowpass: 11000 },
  drop:      { seconds: 0.68, gain: 0.30, variants: 2 },
  bass:      { seconds: 0.62, gain: 0.28, variants: 2 },
  glass:     { seconds: 0.58, gain: 0.14, variants: 2, room: true, tier: 'bright', lowpass: 11000, source: 'eleven', prompt: 'One clear small glass tap with a delicate resonant crystalline ring, warm restrained overtones, clean studio recording, no clinking cluster, no break, no music', promptSeconds: 0.65 },
  paper:     { seconds: 0.55, gain: 0.17, variants: 3, source: 'eleven', tier: 'dull', lowpass: 1750, prompts: [
    'One stiff concert ticket is slapped flat onto a counter, a sharp paper-stock crack followed by a brief papery flutter and dead contact, close dry Foley with tactile grain, one gesture, no hand movement after, no speech, no music',
    'A concert ticket tears once along its perforation under tension: crisp fibrous rip, a small stiff-stock flap and two light paper fragments falling, close-miked dry studio Foley, single gesture only, no shuffling, no voice, no music',
  ], promptSeconds: 0.8 },
  stamp:     { seconds: 0.42, gain: 0.26, variants: 3, source: 'eleven', tier: 'dull', lowpass: 1650, prompts: [
    'One heavy rubber date stamp lands squarely on thick ticket stock: compact wooden handle knock, firm flat paper contact and a short muted mechanical rebound, close dry Foley, one strike only, no speech, no music',
    'A steel office stamp presses once onto a paper ticket on a hard desk, solid weighted clack with a crisp paper slap and tiny spring release, intimate realistic Foley, restrained tail, no repeated stamping, no voice, no music',
  ], promptSeconds: 0.7 },
  alarm:     { seconds: 0.92, gain: 0.16, variants: 2, source: 'eleven', prompt: 'A restrained two-pulse low-volume electronic warning tone, rounded and neutral, no panic, no siren sweep, no harsh treble, clean isolated UI sound, no music', promptSeconds: 1.0 },
  heartbeat: { seconds: 0.78, gain: 0.18, variants: 2, source: 'eleven', tier: 'deep', lowpass: 850, prompt: 'Two soft rounded heartbeat thumps with a subtle low body, calm and intimate, tasteful cinematic tension, no breathing, no music, no exaggerated sub-bass', promptSeconds: 0.85 },
  zap:       { seconds: 0.24, gain: 0.18, variants: 2 },
  rumble:    { seconds: 0.9,  gain: 0.22, variants: 2, sustained: true, source: 'eleven', prompts: [
    'A short cinematic swell of a close, expectant crowd in a concert hall: layered indistinct audience murmur rises with a few soft collective gasps, broad but controlled, no intelligible words, no cheers, no music, no sharp whistles',
    'A compact crowd anticipation swell in a live venue, many distant voices blending into a low textured murmur that gathers and recedes, realistic room depth with a subtle low body, no intelligible speech, no music, no isolated shouts',
  ], promptSeconds: 1.0 },
  snap:      { seconds: 0.42, gain: 0.22, variants: 3, source: 'eleven', tier: 'dull', lowpass: 1750, prompts: [
    'A taut fine steel tether suddenly releases with one short plucked snap, tight string tension twang with a dry initial tick and tiny low resonance, close studio Foley, no whip crack, no electric sound, no speech, no music',
    'One tight braided cord under load snaps free and vibrates once like a muted bass string, sharp fibrous attack, compact woody twang and very short decay, realistic close Foley, no whip, no explosion, no voice, no music',
  ], promptSeconds: 0.65 },
  beep:      { seconds: 0.26, gain: 0.19, variants: 3 },
  step:      { seconds: 0.25, gain: 0.21, variants: 3, tier: 'deep', lowpass: 900 },
  land:      { seconds: 0.5,  gain: 0.30, variants: 3, tier: 'deep', lowpass: 950 },
  squeak:    { seconds: 0.32, gain: 0.16, variants: 2 },
  build:     { seconds: 1.2,  gain: 0.22, variants: 2, sustained: true },
  reverse:   { seconds: 0.76, gain: 0.20, variants: 2, sustained: true },
  tape:      { seconds: 0.48, gain: 0.22, variants: 2 },
  ding:      { seconds: 0.9, gain: 0.17, variants: 2, room: true, tier: 'bright', lowpass: 10500, tail: 0.46 },
  thump:     { seconds: 0.38, gain: 0.35, variants: 3, tier: 'deep', lowpass: 650 },
  knock:     { seconds: 0.31, gain: 0.23, variants: 3, tier: 'dull', lowpass: 1150 },
  whump:     { seconds: 0.48, gain: 0.26, variants: 3, tier: 'deep', lowpass: 800 },
  sub:       { seconds: 0.30, gain: 0.24, variants: 3, tier: 'deep', lowpass: 140 },
  rustle:    { seconds: 0.55, gain: 0.16, variants: 3, tier: 'mid', lowpass: 1800 },
  creak:     { seconds: 0.46, gain: 0.19, variants: 3, tier: 'mid', lowpass: 1250 },
  clunk:     { seconds: 0.42, gain: 0.30, variants: 3, tier: 'deep', lowpass: 1250 },
  slide:     { seconds: 0.40, gain: 0.17, variants: 3, tier: 'mid', lowpass: 1450 },
  footfall:  { seconds: 0.30, gain: 0.22, variants: 3, tier: 'deep', lowpass: 850 },
  pluck:     { seconds: 0.36, gain: 0.19, variants: 3, tier: 'dull', lowpass: 1000 },
  gulp:      { seconds: 0.48, gain: 0.19, variants: 3, tier: 'dull', lowpass: 900 },
  hum:       { seconds: 1.0, gain: 0.11, variants: 2, tier: 'deep', lowpass: 180 },
  tap:       { seconds: 0.14, gain: 0.15, variants: 3, tier: 'dull', lowpass: 1500 },
};

export const MUSIC_BPM = { drive: 118, chill: 92, tense: 108, bright: 124 };

export const CINEMATIC_IMPACTS = new Set(['impact','thud','thump','land','clunk','stamp','sub','drop']);
export const CINEMATIC_MOVEMENT = new Set(['swish','whoosh','whump','slide','whip']);
export const CINEMATIC_ACCENTS = new Set(['pop','pluck','coin','coins','ding','sparkle','shimmer','click','tick','tap','glass']);
export const CINEMATIC_BUILDS = new Set(['build','rise','reverse','rumble']);

const SOFT_FOLEY = {
  footfall:{gain:0.085,seconds:0.34}, rustle:{gain:0.07,seconds:0.62},
  paper:{gain:0.075,seconds:0.6}, knock:{gain:0.08,seconds:0.38},
  step:{gain:0.08,seconds:0.34}, type:{gain:0.085,seconds:2.4},
  creak:{gain:0.08,seconds:0.5}, gulp:{gain:0.075,seconds:0.48},
};

/** Return a style-specific design without changing the established foley palette. */
export function designFor(kind, style = 'foley') {
  const base = SFX[kind];
  if (!base || style !== 'cinematic') return base;
  if (CINEMATIC_IMPACTS.has(kind)) return {
    ...base, seconds: kind === 'sub' ? 0.85 : 0.82, gain: kind === 'sub' ? 0.17 : 0.25,
    variants: 3, source: 'synth', room: false, tail: 0.46, lowpass: 4600,
  };
  if (CINEMATIC_MOVEMENT.has(kind)) return {
    ...base, seconds: kind === 'whip' ? 0.82 : 0.88, gain: 0.20,
    variants: 3, source: 'synth', room: false, tail: 0.34, lowpass: 5100,
  };
  if (CINEMATIC_ACCENTS.has(kind)) return {
    ...base, seconds: kind === 'ding' ? 1.5 : kind === 'coins' ? 0.95 : 0.76,
    gain: kind === 'ding' ? 0.42 : 0.40, variants: 3, source: 'synth', room: false,
    tail: kind === 'ding' ? 0.78 : 0.42, lowpass: 5200,
  };
  if (CINEMATIC_BUILDS.has(kind)) return {
    ...base, seconds: kind === 'rumble' ? 1.05 : 1.0, gain: 0.18,
    variants: 3, source: 'synth', room: false, tail: 0.42, lowpass: 5000,
  };
  const foley = SOFT_FOLEY[kind];
  if (foley) return { ...base, ...foley };
  return { ...base, gain: base.gain * 0.78, room: false };
}

export function isTonalAccent(kind, style = 'foley') {
  return style === 'cinematic' && CINEMATIC_ACCENTS.has(kind);
}

export function variantPitch(kind, variant, style = 'foley') {
  if (isTonalAccent(kind, style)) return 0;
  const count = SFX[kind]?.variants ?? 1;
  if (count <= 1) return 0;
  return [-1.15, 0, 1.05, -0.55][variant % 4];
}
