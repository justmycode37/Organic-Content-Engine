// Pure data (worker-safe): the world backdrops a Hedgy shot can be staged in. Painted by kit/worlds.ts.
export const WORLDS = ['shop', 'street', 'home', 'kitchen', 'bank', 'office', 'market', 'exchange', 'park', 'night', 'vault', 'farm', 'cafe', 'carlot'] as const;
export type WorldId = typeof WORLDS[number];
export const isWorld = (v: unknown): v is WorldId => typeof v === 'string' && (WORLDS as readonly string[]).includes(v);
export const WORLD_HINTS: Record<WorldId, string> = {
  shop: 'shop or bakery interior with shelves of goods and hanging lamps',
  street: 'daytime town street with shop fronts, windows and a lamp post',
  home: 'living room with a window, curtains, a picture frame, a plant and a lamp',
  kitchen: 'home kitchen with tiles, cabinets, a fridge and a window',
  bank: 'bank lobby with marble columns, teller windows and a vault door',
  office: 'office with a window onto a city skyline, a wall clock and a chart on a whiteboard',
  market: 'outdoor market with striped stall awnings, produce crates and string lights',
  exchange: 'stock-exchange trading floor with a scrolling ticker wall and chart screens',
  park: 'sunny park with trees, hills, a bench and a path',
  night: 'city street at night with a moon, stars and lit windows',
  vault: 'steel vault with deposit boxes and a round vault door',
  farm: 'farm with a red barn, a fence, fields and the sun',
  cafe: 'coffee shop with a counter, an espresso machine, a menu board and pendant lamps',
  carlot: 'car dealership lot with bunting flags, a showroom and a sky',
};

