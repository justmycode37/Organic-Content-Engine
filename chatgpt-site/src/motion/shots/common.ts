// Shared vocabulary for the GENERAL Hedgy shot library. A shot never hard-codes
// a story: it stages actors (`who`) and items (`item`) chosen by params, and
// animates on the narration events in order. Any finance topic is a new spec.
import type { Cue, CueKind, ShotProps } from '../core.ts';
import { drawHedgy, hedgyAt, hedgyBounds, hedgyFace, hedgyPaw, type HedgyKey, type HedgyOptions } from '../actor/hedgy.ts';
import { ROLE_ALIASES, type Who } from '../props/people.ts';
import * as ticket from '../props/ticket.ts';
import * as money from '../props/money.ts';
import * as paper from '../props/paper.ts';
import * as wallet from '../props/wallet.ts';
import * as safe from '../props/safe.ts';
import * as clock from '../props/clock.ts';
import * as booth from '../props/booth.ts';
import * as poster from '../props/poster.ts';
import * as press from '../props/press.ts';
import * as finance from '../props/finance.ts';
import * as buildings from '../props/buildings.ts';
import * as symbols from '../props/symbols.ts';
import * as everyday from '../props/everyday.ts';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface XY { x: number; y: number }

// ---- stage geometry ---------------------------------------------------------
// Clean shots are authored on a 720 x 860 stage (set `stage: 'clean'` on the
// ShotDef); the player zooms it 1.5x to fill the 1080 x 1290 animation area, so
// one art pixel = 9 device px. All coordinates below and all prop sizes are in
// stage units. Hedgy is ~320 tall, a ticket 420 wide: things are BIG.
export const STAGE = { w: 720, h: 860, floor: 770, left: 150, right: 570, centre: 360, top: 70 } as const;

// ---- params ----------------------------------------------------------------
export const str = (p: ShotProps['params'], key: string, fallback: string) => { const v = p?.[key]; return typeof v === 'string' && v ? v : fallback; };
export const num = (p: ShotProps['params'], key: string, fallback: number, lo = -1e9, hi = 1e9) => { const v = p?.[key]; return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback; };
export const flag = (p: ShotProps['params'], key: string, fallback = false) => { const v = p?.[key]; return typeof v === 'boolean' ? v : fallback; };
export const pick = <T extends string>(p: ShotProps['params'], key: string, allowed: readonly T[], fallback: T): T => { const v = p?.[key]; return typeof v === 'string' && allowed.includes(v as T) ? v as T : fallback; };

/**
 * Narration beats, in order. Shots animate on the i-th synced word whatever it
 * is called, so the same shot serves any script. `fallback` = fractions of the
 * shot used when the spec has fewer events.
 */
export function beats(props: ShotProps, dur: number, fallback: readonly number[]): number[] {
  const events = [...(props.events ?? [])].filter(e => Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
  return fallback.map((f, i) => Math.max(0, Math.min(dur, events[i]?.at ?? f * dur)));
}
export const cue = (t: number, kind: CueKind, gain = 1, x: number = STAGE.centre): Cue => ({ t: Math.max(0, t), kind, gain, pan: Math.max(-1, Math.min(1, (x - STAGE.centre) / STAGE.centre)) });
export const cuesIn = (dur: number, list: Cue[]) => list.filter(c => c.t <= dur).sort((a, b) => a.t - b.t);

// ---- actors ----------------------------------------------------------------
export const ACTORS = ['hedgy', ...Object.keys(ROLE_ALIASES), 'hedgehog', 'hedgehog2', 'fox', 'badger', 'owl', 'raccoon', 'rabbit', 'rabbit2', 'rabbit3', 'mouse'] as const;
export type ActorId = 'hedgy' | Who;
export type ActorOptions = Omit<HedgyOptions, 'species' | 'pose'> & { who: string; pose?: HedgyOptions['pose']; keys?: readonly HedgyKey[]; time?: number };
function actorOptions(o: ActorOptions): HedgyOptions {
  const role = (ROLE_ALIASES as Record<string, { species: HedgyOptions['species']; accessory: HedgyOptions['accessory'] }>)[o.who];
  const { who, keys, time, ...rest } = o;
  const timeline = keys ? hedgyAt(time ?? o.t ?? 0, keys) : {};
  return { pose: 'idle', shadow: true, ...rest, ...timeline, species: role ? role.species : (who as HedgyOptions['species']), accessory: o.accessory ?? role?.accessory };
}
/** Draw any cast member ('hedgy', a role like 'broker', or a species). `keys` = blended pose timeline evaluated at `time`. */
export const drawActor = (ctx: Ctx, o: ActorOptions) => drawHedgy(ctx, actorOptions(o));
export const actorPaw = (o: ActorOptions) => hedgyPaw(actorOptions(o));
export const actorFace = (o: ActorOptions) => hedgyFace(actorOptions(o));
export const actorBounds = (o: ActorOptions) => hedgyBounds(actorOptions(o));

// ---- items -----------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draw = (ctx: any, o: any) => void;
interface Item { draw: Draw; w: number; h: number; base?: boolean; state?: Record<string, unknown> }
const I = (draw: Draw, w: number, h: number, extra: Partial<Item> = {}): Item => ({ draw, w, h, ...extra });
/** Every prop a spec can name. `base: true` = the prop's own anchor is its bottom centre. */
export const ITEMS = {
  ticket: I(ticket.drawTicket, 420, 204), ticketStack: I(ticket.drawTicketStack, 456, 228, { state: { count: 3 } }),
  banknote: I(money.drawBanknote, 300, 150), cash: I(money.drawCashBundle, 264, 168, { state: { count: 3 } }),
  cashPile: I(money.drawCashPile, 264, 276, { base: true, state: { level: 1 } }), coin: I(money.drawCoin, 132, 132),
  coinStack: I(money.drawCoinStack, 132, 258, { base: true, state: { n: 5 } }), priceTag: I(money.drawPriceTag, 252, 240),
  iou: I(paper.drawIOU, 228, 276), wallet: I(wallet.drawWallet, 264, 192),
  safe: I(safe.drawSafe, 528, 564, { base: true }), padlock: I(safe.drawPadlock, 168, 204, { state: { shut: 1 } }),
  clock: I(clock.drawClock, 468, 468), hourglass: I(clock.drawHourglass, 210, 330),
  booth: I(booth.drawBooth, 564, 720, { base: true }), poster: I(poster.drawPoster, 522, 684, { state: { reveal: 1 } }), megaphone: I(poster.drawMegaphone, 300, 228),
  press: I(press.drawSqueeze, 456, 540),
  share: I(finance.drawShare, 480, 372), contract: I(finance.drawContract, 420, 390), bond: I(finance.drawBond, 450, 390),
  piggy: I(finance.drawPiggyBank, 390, 336), moneyBag: I(finance.drawMoneyBag, 360, 420), gold: I(finance.drawGoldBars, 420, 300),
  card: I(finance.drawCreditCard, 432, 276), calculator: I(finance.drawCalculator, 360, 456), percent: I(finance.drawPercentBadge, 420, 264),
  pie: I(finance.drawPieChart, 384, 384), barChart: I(finance.drawBarChart, 480, 360), candles: I(finance.drawCandlestickTrio, 420, 336),
  basket: I(finance.drawDiversificationBasket, 420, 360), umbrella: I(finance.drawUmbrella, 420, 420, { state: { open: 1 } }), shield: I(finance.drawShield, 330, 390),
  lever: I(finance.drawLever, 510, 360), magnifier: I(finance.drawMagnifyingGlass, 360, 360), calendar: I(finance.drawCalendarPage, 390, 420),
  dice: I(finance.drawDice, 300, 300), crypto: I(finance.drawCryptoCoin, 330, 330),
  bank: I(buildings.drawBank, 528, 564, { base: true }), exchange: I(buildings.drawExchange, 528, 564, { base: true }), house: I(buildings.drawHouse, 528, 564, { base: true }),
  factory: I(buildings.drawFactory, 528, 564, { base: true }), shop: I(buildings.drawShop, 528, 564, { base: true }), taxOffice: I(buildings.drawTaxOffice, 528, 564, { base: true }),
  bull: I(symbols.drawBull, 510, 390), bear: I(symbols.drawBear, 480, 390), crate: I(symbols.drawLabelledCrate, 420, 360),
  warning: I(symbols.drawWarningTriangle, 360, 330), check: I(symbols.drawCheckStamp, 300, 300), cross: I(symbols.drawCrossStamp, 300, 300), question: I(symbols.drawQuestionMark, 240, 330),
  apple: I(everyday.drawApple, 330, 330), appleCrate: I(everyday.drawAppleCrate, 450, 360), lemonade: I(everyday.drawLemonadeStand, 450, 600), pizza: I(everyday.drawPizza, 420, 420),
  car: I(everyday.drawCar, 510, 300), phone: I(everyday.drawPhoneChart, 276, 450), cart: I(everyday.drawShoppingCart, 480, 360), gift: I(everyday.drawGiftBox, 330, 330),
  key: I(everyday.drawKey, 420, 180), bulb: I(everyday.drawLightBulb, 330, 420), weather: I(everyday.drawRiskWeather, 480, 390), tree: I(everyday.drawCompoundingTree, 390, 420, { state: { grow: 1 } }),
  snowball: I(everyday.drawSnowball, 300, 300, { state: { size: 1 } }),
} satisfies Record<string, Item>;
export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItem = (id: unknown): id is ItemId => typeof id === 'string' && id in ITEMS;
export const itemParam = (p: ShotProps['params'], key: string, fallback: ItemId): ItemId => { const v = p?.[key]; return isItem(v) ? v : fallback; };
export const itemSize = (id: ItemId, scale = 1) => ({ w: ITEMS[id].w * scale, h: ITEMS[id].h * scale });

export interface ItemOptions { x: number; y: number; t?: number; scale?: number; rot?: number; alpha?: number; sx?: number; sy?: number; [state: string]: unknown }
/**
 * Draw any item with its CENTRE at (x, y) (floats). `scale`: 1 = hero size,
 * 0.5 = carried/hand-off size (use exactly 1 or 0.5 at rest so pixels stay
 * crisp). Extra keys are passed to the prop as state (tag, stamp, open, count…).
 * `sx`/`sy` squash around the centre.
 */
export function drawItem(ctx: Ctx, id: ItemId, o: ItemOptions) {
  const item: Item = ITEMS[id], { sx = 1, sy = 1, x, y, ...rest } = o, scale = o.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  item.draw(ctx, { ...item.state, ...rest, x: 0, y: item.base ? (item.h * scale) / 2 : 0, scale });
  ctx.restore();
}
