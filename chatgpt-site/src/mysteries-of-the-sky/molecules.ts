// Ball-and-stick models. Equilibrium geometries are in degrees; excursions
// and timing are exaggerated to make bond stretch and bending legible.
type Element = 'C' | 'O' | 'H' | 'S';
export type Molecule = 'CO2' | 'H2O' | 'H2S' | 'SO2';
type Ctx = CanvasRenderingContext2D;
type Site = { x: number; y: number; z: number; radius: number; element: Element };
const models: Record<Molecule, { core: Element; tip: Element; angle: number; length: number }> = {
  CO2: { core: 'C', tip: 'O', angle: 180, length: 155 },
  H2O: { core: 'O', tip: 'H', angle: 104.5, length: 136 },
  H2S: { core: 'S', tip: 'H', angle: 92.1, length: 161 },
  SO2: { core: 'S', tip: 'O', angle: 119.5, length: 166 },
};
const paint = {
  C: { radius: 56, light: [159, 157, 197], dark: [33, 28, 52] },
  O: { radius: 62, light: [255, 167, 153], dark: [75, 35, 58] },
  H: { radius: 38, light: [235, 221, 239], dark: [75, 72, 113] },
  S: { radius: 72, light: [247, 198, 153], dark: [92, 53, 67] },
};
const atoms = new Map<Element, OffscreenCanvas>();
function atomSkin(element: Element) {
  const existing = atoms.get(element);
  if (existing) return existing;
  const size = 224,
    bitmap = new OffscreenCanvas(size, size),
    g = bitmap.getContext('2d')!,
    image = g.createImageData(size, size);
  const { light, dark } = paint[element];
  let seed = 137;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (2 * x + 1) / size - 1,
        v = (2 * y + 1) / size - 1,
        dist = Math.hypot(u, v);
      if (dist >= 1) continue;
      const z = Math.sqrt(1 - dist * dist);
      // Broad upper-left softbox, a cool reflected edge and some fixed surface grain.
      const diffuse = Math.pow(Math.max(0, -0.57 * u - 0.62 * v + 0.54 * z), 0.82);
      const spec = Math.pow(Math.max(0, -0.33 * u - 0.36 * v + 0.872 * z), 24);
      const bounce = Math.pow(1 - z, 2.3) * (0.58 + 0.36 * u);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = (seed / 4294967296 - 0.5) * 8;
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) {
        image.data[i + k] =
          dark[k] +
          (light[k] - dark[k]) * diffuse +
          (255 - light[k]) * 0.49 * spec +
          [58, 55, 97][k] * bounce +
          grain;
      }
      image.data[i + 3] = 255 * Math.min(1, (1 - dist) * size * 0.6);
    }
  g.putImageData(image, 0, 0);
  atoms.set(element, bitmap);
  return bitmap;
}
function bond(ctx: Ctx, a: Site, b: Site, doubled: boolean) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(dy, dx));
  const width = doubled ? 6 : 10;
  for (const offset of doubled ? [-8, 8] : [0]) {
    const shade = ctx.createLinearGradient(0, offset - width, 0, offset + width);
    shade.addColorStop(0, '#75617f');
    shade.addColorStop(0.22, '#d4bcc7');
    shade.addColorStop(0.48, '#ac91a3');
    shade.addColorStop(1, '#49364f');
    ctx.fillStyle = shade;
    ctx.fillRect(0, offset - width, len, width * 2);
    const contact = ctx.createLinearGradient(0, 0, len, 0);
    contact.addColorStop(0, '#251729dc');
    contact.addColorStop(0.46, '#41263c00');
    contact.addColorStop(0.67, '#52304712');
    contact.addColorStop(1, '#211427c2');
    ctx.fillStyle = contact;
    ctx.fillRect(0, offset - width, len, width * 2);
  }
  ctx.restore();
}
function packet(ctx: Ctx, t: number, end: number) {
  const f = (t % 4.6) / 2.15;
  if (f > 1) return;
  const x = -430 + f * (430 + end);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, f * 9, (1 - f) * 9);
  const g = ctx.createLinearGradient(x - 56, 0, x + 56, 0);
  g.addColorStop(0, '#d2c0ee00');
  g.addColorStop(0.5, '#ecdbfb');
  g.addColorStop(1, '#b7abe400');
  ctx.strokeStyle = g;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = -56; s <= 56; s += 2) {
    const y = 9 * Math.cos(s * 0.2 - t * 9) * Math.exp((-s * s) / 710);
    if (s === -56) ctx.moveTo(x + s, y);
    else ctx.lineTo(x + s, y);
  }
  ctx.stroke();
  ctx.restore();
}
export function drawMolecule(
  ctx: Ctx,
  species: Molecule,
  center: readonly [number, number],
  scale: number,
  t: number,
  photolysis = false,
) {
  if (scale <= 0) return;
  const { core, tip, angle, length } = models[species];
  // A single UV event releases one hydrogen. The two products drift apart
  // for the remainder of this shot; seeking backwards reconstructs the event.
  const cleavage = photolysis && species === 'H2O';
  const age = cleavage ? Math.max(0, t - 2.05) : 0;
  const release = 1 - Math.exp(-age * 1.35);
  const yaw = 0.34 * Math.sin(0.45 * t + 0.55),
    roll = -0.17 + 0.12 * Math.sin(0.33 * t),
    pitch = 0.25 + 0.14 * Math.cos(0.39 * t);
  const elapsed = (t % 4.6) - 1.98;
  const excitation = elapsed > 0 ? (1 - Math.exp(-elapsed * 12)) * Math.exp(-elapsed * 0.96) : 0;
  const stretch = Math.sin(7 * t) * (0.021 + 0.095 * excitation);
  const bending = species === 'CO2' ? 0 : 0.052 * Math.sin(3.3 * t) + 0.065 * excitation * Math.sin(t * 6);
  const theta = (angle * Math.PI) / 360 + bending;
  function site(x: number, y: number, element: Element): Site {
    const xx = x * Math.cos(yaw),
      z = -x * Math.sin(yaw),
      yy = y * Math.cos(pitch) - z * Math.sin(pitch);
    const depth = y * Math.sin(pitch) + z * Math.cos(pitch),
      perspective = 1080 / (1080 - depth);
    return {
      x: (xx * Math.cos(roll) - yy * Math.sin(roll)) * perspective,
      y: (xx * Math.sin(roll) + yy * Math.cos(roll)) * perspective,
      z: depth,
      radius: paint[element].radius * perspective,
      element,
    };
  }
  const offset = species === 'CO2' ? -stretch * length * 0.68 : 0;
  const a = site(offset + release * 6, -length * Math.cos(theta) * 0.4, core);
  const tips = [-1, 1].map((sign) => {
    const r = length * (1 + sign * stretch);
    const drift = sign < 0 ? release * (63 + Math.min(age, 8) * 8) : 0;
    return site(sign * r * Math.sin(theta) - drift, r * Math.cos(theta) * 0.6 + drift * 0.28, tip);
  });
  ctx.save();
  ctx.translate(...center);
  ctx.scale(scale, scale);
  if (species === 'CO2' || (species === 'H2O' && (!cleavage || t < 2.15)))
    packet(ctx, t, -length * Math.sin(theta));
  // A soft penumbra separates each cluster of atoms from the sky.
  for (const s of [a, ...tips]) {
    const r = s.radius * 1.55;
    const g = ctx.createRadialGradient(s.x, s.y + 8, 0, s.x, s.y + 8, r);
    g.addColorStop(0, '#120c21b0');
    g.addColorStop(0.68, '#21152948');
    g.addColorStop(1, '#311a3500');
    ctx.fillStyle = g;
    ctx.fillRect(s.x - r, s.y + 8 - r, 2 * r, 2 * r);
  }
  for (const [i, b] of tips.entries()) {
    ctx.save();
    if (i === 0 && cleavage) ctx.globalAlpha *= Math.exp(-age * 10);
    bond(ctx, a, b, species === 'CO2');
    ctx.restore();
  }
  for (const s of [a, ...tips].sort((l, r) => l.z - r.z)) {
    const r = s.radius;
    ctx.drawImage(atomSkin(s.element), s.x - r, s.y - r, 2 * r, 2 * r);
  }
  ctx.restore();
}
