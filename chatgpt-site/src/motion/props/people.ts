// The supporting cast. Every character is an animal drawn on Hedgy's own rig
// (actor/hedgy.ts), so they share his style, poses, blending and helpers.
// Roles are presets over species — use whichever reads best for the story.
import { drawHedgy, hedgyAt, hedgyBounds, hedgyFace, hedgyPaw, HEDGY_HEIGHT, type Accessory, type HedgyOptions, type SpeciesId } from '../actor/hedgy.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Role presets: who usually plays what in a finance story. */
export const ROLE_ALIASES = {
  broker: { species: 'badger', accessory: 'tie+glasses' },
  banker: { species: 'badger', accessory: 'tie' },
  lender: { species: 'owl', accessory: 'none' },
  buyer: { species: 'raccoon', accessory: 'none' },
  trader: { species: 'fox', accessory: 'none' },
  rival: { species: 'fox', accessory: 'scarf' },
  clerk: { species: 'mouse', accessory: 'visor' },
  saver: { species: 'mouse', accessory: 'none' },
  fan1: { species: 'rabbit', accessory: 'none' },
  fan2: { species: 'rabbit2', accessory: 'scarf' },
  fan3: { species: 'rabbit3', accessory: 'none' },
  customer: { species: 'rabbit', accessory: 'none' },
  seller1: { species: 'hedgehog', accessory: 'none' },
  seller2: { species: 'hedgehog2', accessory: 'visor' },
  investor: { species: 'hedgehog', accessory: 'none' },
} as const satisfies Record<string, { species: SpeciesId; accessory: Accessory }>;
export type Role = keyof typeof ROLE_ALIASES;
export type Who = Role | SpeciesId;

export const CAST: { id: SpeciesId; looks: string; height: number }[] = [
  { id: 'hedgy', looks: 'the brown hedgehog mascot', height: 320 },
  { id: 'hedgehog', looks: 'grey hedgehog (others like Hedgy)', height: 307 },
  { id: 'hedgehog2', looks: 'russet hedgehog', height: 326 },
  { id: 'fox', looks: 'orange fox, bushy white-tipped tail', height: 400 },
  { id: 'badger', looks: 'stocky badger, striped face', height: 330 },
  { id: 'owl', looks: 'brown owl, big eyes, gold beak', height: 345 },
  { id: 'raccoon', looks: 'grey raccoon, black mask, ringed tail', height: 345 },
  { id: 'rabbit', looks: 'white rabbit, ears up', height: 430 },
  { id: 'rabbit2', looks: 'white rabbit, one ear flopped', height: 430 },
  { id: 'rabbit3', looks: 'white lop-eared rabbit', height: 300 },
  { id: 'mouse', looks: 'small grey mouse, pink ears', height: 265 },
];

export interface PersonOptions extends Omit<HedgyOptions, 'species'> { who: Who; flip?: boolean }
function resolve(o: PersonOptions): HedgyOptions {
  const role = (ROLE_ALIASES as Record<string, { species: SpeciesId; accessory: Accessory }>)[o.who];
  const { who: _who, flip, ...rest } = o;
  return { ...rest, facing: flip ? -1 : rest.facing, species: role ? role.species : o.who as SpeciesId, accessory: o.accessory ?? role?.accessory };
}

/** Draw a cast member. `x`,`y` = feet (float device px). Same poses/expressions/handTarget/blending as drawHedgy. */
export function drawPerson(ctx: Ctx, o: PersonOptions) { drawHedgy(ctx, resolve(o)); }
/** Device position of the front paw / wing tip — attach props here. */
export const personHand = (o: PersonOptions) => hedgyPaw(resolve(o));
export const personFace = (o: PersonOptions) => hedgyFace(resolve(o));
export const personBounds = (o: PersonOptions) => hedgyBounds(resolve(o));
export const personHeight = (who: Who) => { const role = (ROLE_ALIASES as Record<string, { species: SpeciesId }>)[who]; const id = role ? role.species : who; return CAST.find(c => c.id === id)?.height ?? HEDGY_HEIGHT; };
/** Pose timeline with blends: `drawPerson(ctx, { who, x, y, ...personAt(t, [{ at: 0, pose: 'idle' }, { at: 1, pose: 'give' }]) })`. */
export const personAt = hedgyAt;
export const PERSON_HEIGHT = HEDGY_HEIGHT;
/** Ground distance covered by one run cycle at natural speed (px). */
export const runStride = 190;

export const GALLERY: { name: string; draw(ctx: Ctx, x: number, y: number, t: number): void }[] = [
  ...CAST.map(c => ({ name: c.id, draw: (ctx: Ctx, x: number, y: number, t: number) => drawPerson(ctx, { who: c.id, x, y: y + 150, scale: 0.75, t, pose: 'idle', shadow: true }) })),
  ...(Object.keys(ROLE_ALIASES) as Role[]).map(role => ({ name: `role ${role}`, draw: (ctx: Ctx, x: number, y: number, t: number) => drawPerson(ctx, { who: role, x, y: y + 150, scale: 0.75, t, pose: 'idle', shadow: true }) })),
];
