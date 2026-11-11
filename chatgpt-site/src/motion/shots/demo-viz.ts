import { clamp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { pixelText, pixelWidth } from '../prim.ts';
import {
  drawCandlesticks, drawChangeBadge, drawDivergence, drawExtrudedChart, drawMarketHeatmap,
  drawOdometer, drawOrderBook, drawPieCoins, drawPriceLine, drawTickerTape, type Candlestick,
} from '../viz/finance.ts';
import { drawHeroType, type KineticEffect } from '../viz/type.ts';
import type { ShotDef } from './index.ts';

const values = [42, 45, 43, 47, 46, 52, 49, 55, 57, 53, 61, 58, 65, 62, 70, 74, 68, 77, 82, 79, 91];
const candles: Candlestick[] = [
  { open: 62, close: 65, high: 68, low: 59, volume: 8 }, { open: 65, close: 63, high: 67, low: 61, volume: 6 },
  { open: 63, close: 69, high: 71, low: 62, volume: 10 }, { open: 69, close: 67, high: 72, low: 65, volume: 7 },
  { open: 67, close: 72, high: 75, low: 66, volume: 12 }, { open: 72, close: 76, high: 78, low: 70, volume: 9 },
  { open: 76, close: 73, high: 78, low: 70, volume: 14 }, { open: 73, close: 68, high: 75, low: 65, volume: 18 },
  { open: 68, close: 71, high: 73, low: 66, volume: 11 }, { open: 71, close: 66, high: 73, low: 63, volume: 20 },
  { open: 66, close: 61, high: 68, low: 58, volume: 24 }, { open: 61, close: 64, high: 67, low: 60, volume: 16 },
  { open: 64, close: 57, high: 66, low: 54, volume: 28 }, { open: 57, close: 53, high: 59, low: 49, volume: 22 },
];
const bids = Array.from({ length: 7 }, (_, i) => ({ price: (124.2 - i * 0.1).toFixed(2), size: [840, 1220, 690, 1740, 910, 2010, 1160][i]! }));
const asks = Array.from({ length: 7 }, (_, i) => ({ price: (124.3 + i * 0.1).toFixed(2), size: [740, 1160, 1580, 880, 1950, 980, 1460][i]! }));
const heat = [
  { label: 'NVDA', change: 3.8 }, { label: 'MSFT', change: 1.4 }, { label: 'AMZN', change: -1.9 }, { label: 'META', change: 2.2 }, { label: 'GOOG', change: -0.8 },
  { label: 'AAPL', change: -2.6 }, { label: 'TSLA', change: 4.4 }, { label: 'JPM', change: 0.9 }, { label: 'XOM', change: -1.1 }, { label: 'AVGO', change: 3.1 },
  { label: 'AMD', change: -3.7 }, { label: 'COST', change: 1.8 }, { label: 'NFLX', change: 2.6 }, { label: 'ORCL', change: -0.6 }, { label: 'ADBE', change: -2.1 },
];
const effectNames = ['slam', 'assemble', 'split', 'shatter', 'stretch', 'typewriter', 'scramble', 'mask', 'crack'] as const;

function heading(frame: Frame, title: string, note: string) {
  const { ctx, theme } = frame;
  const titleText = title.toUpperCase();
  const titleSize = [12, 11, 10, 9, 8].find(size => pixelWidth(titleText, size) <= 960) ?? 8;
  const noteText = note.toUpperCase();
  const noteSize = [6, 5, 4, 3].find(size => pixelWidth(noteText, size) <= 780) ?? 3;
  pixelText(ctx, titleText, 540, 270, titleSize, { color: theme.fg, align: 'center', reveal: clamp(frame.t / 0.18), mode: 'type' });
  ctx.fillStyle = theme.line; ctx.fillRect(324, 382, 432, 4);
  pixelText(ctx, noteText, 540, 404, noteSize, { color: theme.dim, align: 'center' });
}

export const demoVizShot: ShotDef = {
  name: 'demo-viz',
  describe: 'Data visualization and kinetic type test bench. params.demo selects line, follow, candles, extruded, extruded-candles, orderbook, ticker, odometer, badge, divergence, heatmap, pie, or type effect (slam/assemble/split/shatter/stretch/typewriter/scramble/mask/crack).',
  render(frame: Frame, props: ShotProps) {
    const mode = String(props.params?.demo ?? 'candles').toLowerCase();
    if (mode.startsWith('type-')) {
      const effect = mode.slice(5) as KineticEffect;
      heading(frame, effect.toUpperCase(), 'KINETIC TYPE / PIXEL DISPLAY');
      drawHeroType(frame, effect === 'crack' ? 'MARKET CRASH' : effect === 'scramble' ? 'DECODE' : effect === 'typewriter' ? 'SIGNAL' : 'VOLATILE',
        { x: 120, y: 560, w: 840, h: 420 }, frame.t, { effect, size: 22, direction: effect === 'crack' ? 'loss' : undefined });
      return;
    }
    switch (mode) {
    case 'line':
        heading(frame, 'PRICE DISCOVERY', 'A LINE THAT BUILDS INTO THE FUTURE');
        drawPriceLine(frame, { x: 108, y: 465, w: 864, h: 750 }, values, frame.t, { label: 'HEDGY / CLOSE', valueLabel: '$128.40', drawSeconds: 1.35 });
        break;
      case 'follow': {
        heading(frame, 'CAMERA FOLLOW', 'THE HEAD STAYS IN FRAME');
        const result = drawPriceLine(frame, { x: 108, y: 465, w: 864, h: 750 }, values, frame.t, { follow: true, label: 'LIVE PRICE', valueLabel: '$128.40', drawSeconds: 1.55 });
        ctxMarker(frame, result.head.x, result.head.y, frame.theme.fg);
        break;
      }
      case 'extruded':
      case 'extruded-candles':
        heading(frame, mode === 'extruded-candles' ? 'CANDLES IN DEPTH' : 'VOLUME IN DEPTH', 'LIT PIXEL BOXES / ORBIT CAMERA');
        drawExtrudedChart(frame, { x: 108, y: 462, w: 864, h: 738 }, mode === 'extruded-candles' ? candles : [4, 6, 4, 8, 6, 9, 7, 11, 8, 12], frame.t, { kind: mode === 'extruded-candles' ? 'candles' : 'bars', orbit: true, label: mode === 'extruded-candles' ? 'AAPL / 1H' : 'DAILY VOLUME' });
        break;
      case 'orderbook':
      case 'order-book':
        heading(frame, 'ORDER BOOK', 'DEPTH BUILDS AROUND THE SPREAD');
        drawOrderBook(frame, { x: 132, y: 462, w: 816, h: 738 }, bids, asks, frame.t, { label: 'NASDAQ / AAPL', spread: '0.10', rows: 7 });
        break;
      case 'ticker':
        heading(frame, 'MARKET TAPE', 'SCROLLING PRICES / LIVE DIRECTION');
        drawTickerTape(frame, { x: 84, y: 650, w: 912, h: 116 }, [
          { symbol: 'SPX', price: '5,842.30', change: 0.84 }, { symbol: 'NDX', price: '20,312.7', change: -0.36 },
          { symbol: 'BTC', price: '67,420', change: 2.16 }, { symbol: 'VIX', price: '18.42', change: -1.04 },
        ], frame.t, { speed: 176, label: true });
        break;
      case 'odometer':
        heading(frame, 'THE COUNT', 'A PRICE ROLLS INTO PLACE');
        drawOdometer(frame, { x: 120, y: 535, w: 840, h: 360 }, frame.t, { from: 94382.16, to: 108264.72, prefix: '$', decimals: 2, size: 16, label: 'BITCOIN / USD' });
        break;
      case 'badge':
        heading(frame, 'THE MOVE', 'DIRECTIONAL PERCENTAGE IMPACT');
        drawChangeBadge(frame, { x: 240, y: 520, w: 600, h: 320 }, frame.t, { value: -18.7, label: 'MARKET SELLOFF' });
        break;
      case 'divergence':
        heading(frame, 'TWO OUTCOMES', 'THE GAP OPENS OVER TIME');
        drawDivergence(frame, { x: 108, y: 465, w: 864, h: 750 }, [40, 41, 42, 42, 43, 44, 45, 46, 47, 48, 49, 50], [40, 40, 41, 42, 43, 45, 48, 52, 57, 62, 68, 74], frame.t, { leftLabel: 'BASE CASE', rightLabel: 'UPSIDE' });
        break;
      case 'heatmap':
      case 'market-map':
        heading(frame, 'MARKET MAP', 'EACH TILE TURNS WITH THE SESSION');
        drawMarketHeatmap(frame, { x: 108, y: 462, w: 864, h: 738 }, heat, frame.t, { cols: 5, rows: 3, label: 'LARGE CAP / DAILY CHANGE' });
        break;
      case 'pie':
      case 'pie-coins':
        heading(frame, 'PORTFOLIO MIX', 'AN ALLOCATION IN EXTRUDED COIN SLICES');
        drawPieCoins(frame, { x: 192, y: 462, w: 696, h: 715 }, [
          { label: 'EQUITIES', value: 48 }, { label: 'BONDS', value: 27 }, { label: 'CASH', value: 15 }, { label: 'OTHER', value: 10 },
        ], frame.t, { orbit: true, selected: Math.floor(frame.t * 1.25) % 4 });
        break;
      case 'candles':
      default:
        heading(frame, 'THE SELLOFF', 'CANDLES BUILD / VOLUME ARRIVES BELOW');
        drawCandlesticks(frame, { x: 108, y: 462, w: 864, h: 758 }, candles, frame.t, { label: 'AAPL / 1H', buildSeconds: 1.25 });
        break;
    }
  },
  cues(_props: ShotProps, dur: number): Cue[] {
    return [0.1, 0.42, 0.74, 1.06].filter(t => t < dur * 0.62).map(t => ({ kind: 'tick', t, gain: 0.22, len: 0.06 }));
  },
};

function ctxMarker(frame: Frame, x: number, y: number, color: string) {
  const { ctx } = frame, sx = Math.round(x / 4) * 4, sy = Math.round(y / 4) * 4;
  ctx.fillStyle = frame.theme.bg; ctx.fillRect(sx - 20, sy - 20, 40, 40);
  ctx.fillStyle = color; ctx.fillRect(sx - 12, sy - 12, 24, 24);
  ctx.fillStyle = frame.theme.bg; ctx.fillRect(sx - 4, sy - 4, 8, 8);
}

