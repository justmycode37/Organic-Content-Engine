import { clamp, ease, font, stripMarkup, type Cue, type Frame, type SceneDef, type TokensProps } from '../core.ts';
import { dither } from '../pix.ts';
import { fitPixel, pixelHeight, pixelText, text, textWidth } from '../prim.ts';

type Piece = {
  value: string;
  accent: boolean;
  id: number;
  sourceIndex: number;
  overflow?: boolean;
};

type TilePosition = Piece & {
  x: number;
  y: number;
  w: number;
  row: number;
};

type Candidate = {
  token: string;
  p: number;
  index: number;
};

type ContextLayout = {
  items: TilePosition[];
  slot: { x: number; y: number; w: number };
};

const SAFE_X = 96;
const SAFE_W = 888;
const CENTER_X = 540;
const HERO_Y = 740;
const TILE_FACE_H = 60;
const TILE_SIDE_H = 24;
const TILE_BODY_H = TILE_FACE_H + TILE_SIDE_H;
const TILE_ID_Y = 98;
const TILE_TOTAL_H = 144;
const TILE_GAP_X = 12;
const TILE_GAP_Y = 24;
const MAX_VISIBLE_TILES = 18;
const MAX_ROWS = 3;
const TILE_TEXT_SIZE = 44;
const TILE_MAX_W = 264;
const CONTEXT_Y = 350;
const ROW_Y = 554;
const ROW_H = 120;
const ROW_GAP = 12;

function hashText(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function tokenId(index: number, value: string): number {
  return hashText(String(index) + ':' + value) % 900 + 100;
}

function piecesOf(raw: string): Piece[] {
  const spans = String(raw ?? '').slice(0, 180).split(/(\*[^*]+\*)/).filter(Boolean);
  const pieces: Piece[] = [];

  spans.forEach((span) => {
    const marked = span.startsWith('*') && span.endsWith('*');
    const plain = marked ? span.slice(1, -1) : span;

    plain.split(/\s+/).filter(Boolean).forEach((word) => {
      for (let offset = 0; offset < word.length && pieces.length < 80; offset += 8) {
        const value = word.slice(offset, offset + 8);
        const sourceIndex = pieces.length;
        pieces.push({
          value,
          accent: marked,
          id: tokenId(sourceIndex, value),
          sourceIndex,
        });
      }
    });
  });

  return pieces;
}

function candidatesOf(raw: TokensProps['predict']): Candidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 4)
    .map((candidate, index) => ({
      token: String(candidate?.token ?? '').slice(0, 24),
      p: clamp(Number.isFinite(candidate?.p) ? candidate.p : 0),
      index,
    }))
    .sort((a, b) => b.p - a.p || a.index - b.index);
}

function roundUp(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}

function tileWidth(value: string): number {
  const measured = Math.max(104, Math.min(TILE_MAX_W, [...value].length * 26 + 40));
  return Math.min(TILE_MAX_W, roundUp(measured, 12));
}

function overflowPiece(count: number): Piece {
  const value = '+' + count;
  return {
    value,
    accent: false,
    id: tokenId(-1, value),
    sourceIndex: -1,
    overflow: true,
  };
}

function packGridRow(rows: Piece[][], piece: Piece): void {
  const current = rows[rows.length - 1]!;
  const used = current.reduce((sum, item) => sum + tileWidth(item.value), 0)
    + Math.max(0, current.length - 1) * TILE_GAP_X;
  const addition = (current.length ? TILE_GAP_X : 0) + tileWidth(piece.value);

  if (current.length && used + addition > SAFE_W) rows.push([piece]);
  else current.push(piece);
}

function gridLayout(pieces: Piece[]): TilePosition[] {
  if (pieces.length === 0) return [];

  const limit = Math.min(MAX_VISIBLE_TILES, pieces.length);
  for (let keep = limit; keep >= 0; keep--) {
    const visible = pieces.slice(0, keep);
    if (keep < pieces.length) visible.push(overflowPiece(pieces.length - keep));

    const rows: Piece[][] = [[]];
    visible.forEach((piece) => packGridRow(rows, piece));
    const compactRows = rows.filter((row) => row.length > 0);
    if (compactRows.length > MAX_ROWS) continue;

    const blockH = compactRows.length * TILE_TOTAL_H
      + Math.max(0, compactRows.length - 1) * TILE_GAP_Y;
    const top = HERO_Y - blockH / 2;
    const placed: TilePosition[] = [];

    compactRows.forEach((row, rowIndex) => {
      const totalW = row.reduce((sum, piece) => sum + tileWidth(piece.value), 0)
        + Math.max(0, row.length - 1) * TILE_GAP_X;
      let x = CENTER_X - totalW / 2;
      const y = top + rowIndex * (TILE_TOTAL_H + TILE_GAP_Y);

      row.forEach((piece) => {
        const w = tileWidth(piece.value);
        placed.push({ ...piece, x, y, w, row: rowIndex });
        x += w + TILE_GAP_X;
      });
    });

    return placed;
  }

  return [];
}

function contextLayout(pieces: Piece[], winner: Piece): ContextLayout {
  const available = pieces.slice(-4);
  const slotW = tileWidth(winner.value);
  let selected: Piece[] = [];

  for (let count = available.length; count >= 0; count--) {
    const trial = available.slice(-count);
    const totalW = trial.reduce((sum, piece) => sum + tileWidth(piece.value), 0)
      + (trial.length ? trial.length * TILE_GAP_X : 0)
      + slotW;
    if (totalW <= SAFE_W) {
      selected = trial;
      break;
    }
  }

  const totalW = selected.reduce((sum, piece) => sum + tileWidth(piece.value), 0)
    + selected.length * TILE_GAP_X
    + slotW;
  let x = CENTER_X - totalW / 2;
  const items: TilePosition[] = selected.map((piece) => {
    const w = tileWidth(piece.value);
    const item = { ...piece, x, y: CONTEXT_Y, w, row: 0 };
    x += w + TILE_GAP_X;
    return item;
  });

  return {
    items,
    slot: { x, y: CONTEXT_Y, w: slotW },
  };
}

function sceneTiming(dur: number, tileCount: number, candidateCount: number) {
  const d = Math.max(0.8, Number.isFinite(dur) ? dur : 1);
  const sentenceReveal = Math.min(0.2, d * 0.12);
  const cutStart = Math.min(0.72, Math.max(d * 0.1, sentenceReveal + 0.02));
  const cutDur = Math.min(0.24, d * 0.08);
  const tileStart = cutStart + cutDur;
  const tileSpan = tileCount > 1 ? Math.min(0.48, d * 0.14) : 0;
  const tileDur = Math.min(0.2, d * 0.1);
  const tileComplete = tileStart + tileSpan + tileDur;
  const contextStart = Math.max(tileComplete + 0.04, d * 0.5);
  const contextDur = Math.min(0.28, d * 0.1);
  const predictionStart = Math.max(contextStart + contextDur + 0.06, d * 0.6);
  const rowDelay = Math.min(0.07, d * 0.02);
  const raceDur = Math.min(0.5, d * 0.13);
  const predictionComplete = predictionStart
    + Math.max(0, candidateCount - 1) * rowDelay
    + raceDur;
  const winnerStart = Math.max(predictionComplete + 0.04, d * 0.82);
  const winnerDur = Math.min(0.28, d * 0.1);

  return {
    sentenceReveal,
    cutStart,
    cutDur,
    tileStart,
    tileSpan,
    tileDur,
    tileComplete,
    contextStart,
    contextDur,
    predictionStart,
    rowDelay,
    raceDur,
    winnerStart,
    winnerDur,
  };
}

function wrapSentence(ctx: Frame['ctx'], value: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  const pushPart = (part: string) => {
    const next = line ? line + ' ' + part : part;
    if (!line || textWidth(ctx, next, size) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = part;
    }
  };

  words.forEach((word) => {
    if (textWidth(ctx, word, size) <= maxWidth) {
      pushPart(word);
      return;
    }

    let part = '';
    for (const char of word) {
      if (part && textWidth(ctx, part + char, size) > maxWidth) {
        pushPart(part);
        part = char;
      } else {
        part += char;
      }
    }
    if (part) pushPart(part);
  });

  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last && textWidth(ctx, last + '…', size) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = last + '…';
  return kept;
}

function sentenceLayout(ctx: Frame['ctx'], sentence: string): { lines: string[]; size: number; lineH: number } {
  if (!sentence.trim()) return { lines: [], size: 56, lineH: 68 };

  for (let size = 74; size >= 56; size -= 2) {
    if (textWidth(ctx, sentence, size) <= SAFE_W) {
      return { lines: [sentence], size, lineH: Math.round(size * 1.2) };
    }
  }

  const size = 56;
  const lines = wrapSentence(ctx, sentence, size, SAFE_W, 8);
  return { lines, size, lineH: Math.round(size * 1.2) };
}

function fitSans(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string {
  const chars = [...String(value ?? '')];
  if (textWidth(ctx, chars.join(''), size) <= maxWidth) return chars.join('');

  while (chars.length > 1 && textWidth(ctx, chars.join('') + '…', size) > maxWidth) chars.pop();
  return chars.length ? chars.join('') + '…' : '…';
}

function steppedRect(ctx: Frame['ctx'], x: number, y: number, w: number, h: number, cut = 8): void {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w - cut, y + cut);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x + cut, y + h - cut);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.lineTo(x + cut, y + cut);
  ctx.closePath();
}

function drawTile(
  frame: Frame,
  piece: Piece,
  x: number,
  y: number,
  w: number,
  options: { accent?: boolean; scale?: number; alpha?: number; bob?: number } = {},
): void {
  const { ctx, theme } = frame;
  const scale = options.scale ?? 1;
  const cx = x + w / 2;
  const cy = y + TILE_TOTAL_H / 2;
  const highlighted = options.accent ?? piece.accent;

  ctx.save();
  ctx.globalAlpha *= clamp(options.alpha ?? 1);
  ctx.translate(cx, cy + (options.bob ?? 0));
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // The offset base is the cast pixel shadow and the lower keycap bevel.
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 8, y + 12, w - 8, TILE_BODY_H - 8);
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x + 4, y + TILE_FACE_H, w - 8, TILE_SIDE_H - 4);

  steppedRect(ctx, x + 4, y + 4, w - 8, TILE_FACE_H, 8);
  ctx.fillStyle = highlighted ? theme.accent : theme.panelAlt;
  ctx.fill();

  if (!highlighted) {
    dither(ctx, x + 12, y + 38, w - 24, 16, theme.dim, (_u, v) => 0.18 + 0.18 * v);
  }

  // The top and left catches make the face read as a bevelled block.
  ctx.fillStyle = highlighted ? theme.onAccent : theme.fg;
  ctx.fillRect(x + 12, y + 8, w - 24, 4);
  ctx.fillRect(x + 8, y + 12, 4, 36);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 12, y + TILE_FACE_H + 4, w - 24, 4);
  ctx.fillRect(x + w - 12, y + 12, 4, 36);

  steppedRect(ctx, x + 4, y + 4, w - 8, TILE_FACE_H, 8);
  ctx.strokeStyle = highlighted ? theme.accent : theme.line;
  ctx.lineWidth = 4;
  ctx.stroke();

  const label = fitSans(ctx, piece.value, w - 28, TILE_TEXT_SIZE);
  text(ctx, label, cx, y + 34, {
    size: TILE_TEXT_SIZE,
    color: highlighted ? theme.onAccent : theme.fg,
    align: 'center',
    baseline: 'middle',
  });

  // Dithered side face and a few registration marks give the keycap some depth.
  dither(ctx, x + 12, y + TILE_FACE_H + 4, w - 24, TILE_SIDE_H - 8, theme.dim, (_u, v) => 0.16 + v * 0.2);
  ctx.fillStyle = theme.line;
  for (let mark = 0; mark < 3; mark++) {
    const mx = x + 20 + mark * 20;
    if (mx < x + w - 16) ctx.fillRect(mx, y + TILE_FACE_H + 12, 4, 4);
  }

  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 12, y + TILE_BODY_H + 4, w - 24, 4);
  pixelText(ctx, String(piece.id), cx, y + TILE_ID_Y, 6, {
    color: theme.dim,
    align: 'center',
  });
  ctx.restore();
}

function drawEmptySlot(frame: Frame, x: number, y: number, w: number, alpha: number): void {
  const { ctx, theme, t } = frame;
  const pulse = Math.floor(t * 3) % 2 === 0 ? 1 : 0.42;

  ctx.save();
  ctx.globalAlpha *= clamp(alpha) * pulse;
  ctx.fillStyle = theme.panel;
  ctx.fillRect(x + 4, y + 8, w - 8, TILE_BODY_H - 8);
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x + 8, y + TILE_FACE_H, w - 16, TILE_SIDE_H - 4);
  steppedRect(ctx, x + 4, y + 4, w - 8, TILE_FACE_H, 8);
  ctx.strokeStyle = theme.dim;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 12, y + 14, w - 24, 4);
  ctx.fillRect(x + 12, y + TILE_FACE_H + 4, w - 24, 4);
  pixelText(ctx, 'NEXT', x + w / 2, y + 12, 6, { color: theme.dim, align: 'center' });
  ctx.fillStyle = theme.fg;
  ctx.fillRect(x + w / 2 - 4, y + 54, 8, 8);
  ctx.restore();
}

function drawRails(frame: Frame, top: number, bottom: number, reveal: number): void {
  const { ctx, theme } = frame;
  const width = SAFE_W * clamp(reveal);
  const left = CENTER_X - width / 2;

  ctx.fillStyle = theme.line;
  ctx.fillRect(left, top, width, 4);
  ctx.fillRect(left, bottom, width, 4);
  ctx.fillStyle = theme.dim;
  ctx.fillRect(left, top - 4, 12, 12);
  ctx.fillRect(left + width - 12, top - 4, 12, 12);
  ctx.fillRect(left, bottom, 12, 12);
  ctx.fillRect(left + width - 12, bottom, 12, 12);
}

function drawSentence(frame: Frame, lines: string[], size: number, reveal: number): { top: number; height: number; width: number } {
  const { ctx, theme } = frame;
  if (lines.length === 0) return { top: HERO_Y, height: 0, width: 0 };

  const lineH = Math.round(size * 1.2);
  const height = lines.length * lineH;
  const top = HERO_Y - height / 2;
  const widths = lines.map((line) => textWidth(ctx, line, size));
  const width = Math.max(...widths);

  lines.forEach((line, index) => {
    const lineWidth = widths[index]!;
    const y = top + lineH * (index + 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(CENTER_X - lineWidth / 2, y - size / 2 - 4, lineWidth * clamp(reveal), size + 8);
    ctx.clip();
    text(ctx, line, CENTER_X, y, {
      size,
      color: theme.fg,
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();
  });

  return { top, height, width };
}

function drawCuts(frame: Frame, sentence: { top: number; height: number; width: number }, progress: number, count: number): void {
  const { ctx, theme } = frame;
  if (sentence.width <= 0 || sentence.height <= 0) return;

  const left = CENTER_X - sentence.width / 2;
  const cutY = HERO_Y - 3;
  ctx.fillStyle = theme.dim;

  for (let index = 1; index < count; index++) {
    const point = index / count;
    if (progress >= point) {
      const x = left + sentence.width * point;
      ctx.fillRect(x - 2, sentence.top - 20, 4, sentence.height + 40);
    }
  }

  const bladeX = left + sentence.width * ease.outExpo(progress);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(bladeX - 6, sentence.top - 28, 12, sentence.height + 56);
  ctx.fillStyle = theme.fg;
  ctx.fillRect(left, cutY, Math.max(0, bladeX - left), 6);

  // Small chips kick off the leading edge as the cut travels.
  for (let index = 0; index < 7; index++) {
    const phase = frame.t * 11 + index * 1.7;
    const x = bladeX + Math.sin(phase) * (10 + index * 3);
    const y = HERO_Y + Math.cos(phase * 1.3) * (18 + index * 2);
    ctx.fillStyle = index % 2 === 0 ? theme.fg : theme.dim;
    ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, 4, 4);
  }
}

function drawHeader(frame: Frame, rawTitle: string): void {
  const { ctx, theme } = frame;
  const label = String(rawTitle ?? '').trim().slice(0, 60).toUpperCase() || 'TOKENIZATION';
  const fit = fitPixel(label, SAFE_W, 1, [8, 7, 6]);
  pixelText(ctx, fit.lines[0] ?? label, CENTER_X, 264, fit.px, {
    color: theme.dim,
    align: 'center',
  });
  ctx.fillStyle = theme.line;
  ctx.fillRect(SAFE_X, 324, SAFE_W, 4);
}

function drawTileGrid(frame: Frame, items: TilePosition[], timing: ReturnType<typeof sceneTiming>): void {
  if (items.length === 0) return;
  const { ctx, t } = frame;
  const top = Math.min(...items.map((item) => item.y));
  const bottom = Math.max(...items.map((item) => item.y + TILE_TOTAL_H));
  const railReveal = ease.outExpo(clamp((t - timing.tileStart) / Math.max(0.12, timing.tileDur * 2)));

  drawRails(frame, top - 20, bottom + 20, railReveal);

  items.forEach((item, index) => {
    const stagger = items.length > 1 ? timing.tileSpan * index / (items.length - 1) : 0;
    const p = clamp((t - timing.tileStart - stagger) / timing.tileDur);
    if (p <= 0) return;

    const pop = ease.outBack(p);
    const sourceX = CENTER_X - item.w * 0.38;
    const sourceY = HERO_Y - TILE_TOTAL_H / 2;
    const x = sourceX + (item.x - sourceX) * pop;
    const y = sourceY + (item.y - sourceY) * pop;
    const scale = 0.72 + 0.28 * ease.outBack(p);
    const bob = Math.sin(t * 3.1 + item.id) * 1.5 * clamp((p - 0.85) / 0.15);

    drawTile(frame, item, x, y, item.w, { scale, bob });
  });
}

function drawContextStage(
  frame: Frame,
  grid: TilePosition[],
  context: ContextLayout,
  winner: Piece,
  timing: ReturnType<typeof sceneTiming>,
  landed: boolean,
): void {
  const { t } = frame;
  const move = clamp((t - timing.contextStart) / timing.contextDur);
  const eased = ease.outBack(move);
  const gridByIndex = new Map(grid.filter((item) => item.sourceIndex >= 0).map((item) => [item.sourceIndex, item]));

  context.items.forEach((item) => {
    const source = gridByIndex.get(item.sourceIndex);
    const fromX = source?.x ?? (CENTER_X - item.w / 2);
    const fromY = source?.y ?? (HERO_Y - TILE_TOTAL_H / 2);
    const x = fromX + (item.x - fromX) * eased;
    const y = fromY + (item.y - fromY) * eased;
    drawTile(frame, item, x, y, item.w, {
      accent: false,
      alpha: 1,
      bob: Math.sin(t * 3.2 + item.id) * 1.5 * move,
    });
  });

  const slotAlpha = clamp(move);
  if (!landed) drawEmptySlot(frame, context.slot.x, context.slot.y, context.slot.w, slotAlpha);
  else {
    const landedAt = timing.winnerStart + timing.winnerDur;
    const landedFor = Math.max(0, t - landedAt);
    const punch = 1 + 0.14 * Math.exp(-landedFor * 16) * Math.sin(landedFor * 28);
    drawTile(frame, winner, context.slot.x, context.slot.y, context.slot.w, {
      accent: true,
      bob: Math.sin(t * 2.7 + winner.id) * 2.2,
      scale: punch + Math.sin(t * 2.2) * 0.02,
    });
  }

  if (move < 1) {
    grid.forEach((item) => {
      if (item.sourceIndex < 0 || context.items.some((entry) => entry.sourceIndex === item.sourceIndex)) return;
      const fall = ease.inCubic(clamp((t - timing.contextStart) / (timing.contextDur * 0.8)));
      if (fall >= 1) return;
      drawTile(frame, item, item.x, item.y + fall * 150, item.w, {
        alpha: 1 - fall,
        scale: 1 - fall * 0.18,
        bob: 0,
      });
    });
  }
}

function drawProbabilityBar(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number,
  amount: number,
  accent: boolean,
): void {
  const { ctx, theme } = frame;
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);

  const innerX = x + 4;
  const innerY = y + 4;
  const innerW = Math.max(0, (w - 8) * clamp(amount));
  const innerH = h - 8;
  if (innerW > 0) {
    if (accent) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(innerX, innerY, innerW, innerH);
    } else {
      dither(ctx, innerX, innerY, innerW, innerH, theme.dim, (_u, v) => 0.55 + v * 0.16);
    }
  }

  ctx.fillStyle = theme.line;
  for (let mark = 1; mark < 10; mark++) {
    const mx = x + mark * w / 10;
    ctx.fillRect(mx - 2, y + 4, 4, h - 8);
  }
}

function drawCandidateRow(
  frame: Frame,
  candidate: Candidate,
  index: number,
  winnerIndex: number,
  timing: ReturnType<typeof sceneTiming>,
): void {
  const { ctx, theme, t } = frame;
  const start = timing.predictionStart + index * timing.rowDelay;
  const local = t - start;
  if (local < 0) return;

  const winner = index === winnerIndex;
  const entranceDur = Math.min(0.2, timing.raceDur * 0.6);
  const enter = ease.outBack(clamp(local / entranceDur));
  const alpha = clamp(local / Math.max(0.001, entranceDur));
  const exit = winner ? 0 : ease.inCubic(clamp((t - timing.winnerStart) / 0.22));
  if (!winner && exit >= 1) return;

  const rowY = ROW_Y + index * (ROW_H + ROW_GAP);
  const y = rowY + (1 - enter) * 54 + exit * 170;
  const rowAlpha = alpha * (1 - exit);
  const moving = t >= timing.winnerStart;
  const race = ease.outCubic(clamp(local / timing.raceDur));

  ctx.save();
  ctx.globalAlpha *= rowAlpha;
  ctx.fillStyle = theme.panel;
  ctx.fillRect(SAFE_X, y, SAFE_W, ROW_H);
  ctx.strokeStyle = winner && moving ? theme.accent : theme.line;
  ctx.lineWidth = 4;
  ctx.strokeRect(SAFE_X, y, SAFE_W, ROW_H);

  ctx.fillStyle = winner && moving ? theme.accent : theme.dim;
  ctx.fillRect(SAFE_X + 16, y + 20, 8, ROW_H - 40);
  const label = fitSans(ctx, candidate.token || '…', 258, 44);
  text(ctx, label, SAFE_X + 40, y + 52, {
    size: 44,
    color: winner && moving ? theme.accent : theme.fg,
    align: 'left',
    baseline: 'middle',
  });

  drawProbabilityBar(
    frame,
    SAFE_X + 328,
    y + 74,
    420,
    28,
    candidate.p * race,
    winner && moving,
  );

  pixelText(ctx, Math.round(candidate.p * 100) + '%', SAFE_X + SAFE_W - 20, y + 34, 6, {
    color: winner && moving ? theme.accent : theme.fg,
    align: 'right',
  });
  ctx.restore();
}

function drawWinnerFlight(
  frame: Frame,
  winner: Candidate,
  winnerPiece: Piece,
  winnerIndex: number,
  context: ContextLayout,
  timing: ReturnType<typeof sceneTiming>,
): void {
  const { t } = frame;
  if (t < timing.winnerStart) return;

  const progress = clamp((t - timing.winnerStart) / timing.winnerDur);
  if (progress >= 1) return;

  const sourceX = SAFE_X + 40 + tileWidth(winnerPiece.value) / 2;
  const sourceY = ROW_Y + winnerIndex * (ROW_H + ROW_GAP) + (ROW_H - TILE_TOTAL_H) / 2;
  const targetX = context.slot.x + context.slot.w / 2;
  const targetY = context.slot.y;
  const eased = ease.outCubic(progress);
  const x = sourceX + (targetX - sourceX) * eased;
  const y = sourceY + (targetY - sourceY) * eased;
  const punch = 0.82 + 0.18 * ease.outBack(progress);

  drawTile(frame, winnerPiece, x - tileWidth(winnerPiece.value) / 2, y, tileWidth(winnerPiece.value), {
    accent: true,
    scale: punch,
    bob: 0,
  });
}

function sentenceState(frame: Frame, sentence: string, timing: ReturnType<typeof sceneTiming>, pieceCount: number) {
  const { t } = frame;
  const layout = sentenceLayout(frame.ctx, sentence);
  const reveal = ease.outExpo(clamp((t - 0.01) / timing.sentenceReveal));
  const geometry = drawSentence(frame, layout.lines, layout.size, reveal);

  if (t >= timing.cutStart && t < timing.tileStart) {
    const progress = clamp((t - timing.cutStart) / timing.cutDur);
    drawCuts(frame, geometry, progress, Math.max(1, pieceCount));
  }
}

export const tokensScene: SceneDef<TokensProps> = {
  type: 'tokens',

  render(frame: Frame, props: TokensProps) {
    const { ctx, theme, t } = frame;
    const dur = Math.max(0.8, Number.isFinite(frame.dur) ? frame.dur : 1);
    const raw = String(props?.text ?? '').slice(0, 180);
    const sentence = stripMarkup(raw);
    const pieces = piecesOf(raw);
    const grid = gridLayout(pieces);
    const candidates = candidatesOf(props?.predict);
    const hasPrediction = candidates.length > 0;
    const winner = candidates[0];
    const winnerPiece: Piece | null = winner ? {
      value: winner.token || '…',
      accent: false,
      id: tokenId(-2, winner.token),
      sourceIndex: -2,
    } : null;
    const context = winnerPiece ? contextLayout(pieces, winnerPiece) : null;
    const timing = sceneTiming(dur, grid.length, candidates.length);

    drawHeader(frame, props?.title ?? '');

    if (t < timing.tileStart) {
      sentenceState(frame, sentence, timing, grid.length);
      return;
    }

    if (!hasPrediction || !winner || !winnerPiece || !context) {
      drawTileGrid(frame, grid, timing);
      if (grid.length > 0 && t >= timing.tileComplete) {
        const countLabel = pieces.length + (pieces.length === 1 ? ' TOKEN' : ' TOKENS');
        pixelText(ctx, countLabel, CENTER_X, Math.max(...grid.map((item) => item.y + TILE_TOTAL_H)) + 34, 6, {
          color: theme.dim,
          align: 'center',
          reveal: ease.outBack(clamp((t - timing.tileComplete) / 0.2)),
        });
      }
      return;
    }

    const moveProgress = clamp((t - timing.winnerStart) / timing.winnerDur);
    const landed = moveProgress >= 1;
    const contextProgress = clamp((t - timing.contextStart) / timing.contextDur);

    if (contextProgress <= 0) {
      drawTileGrid(frame, grid, timing);
      return;
    }

    drawContextStage(frame, grid, context, winnerPiece, timing, landed);

    candidates.forEach((candidate, index) => {
      drawCandidateRow(frame, candidate, index, 0, timing);
    });

    drawWinnerFlight(frame, winner!, winnerPiece!, 0, context, timing);
  },

  cues(props: TokensProps, dur: number): Cue[] {
    if (!(dur > 0)) return [];

    const pieces = piecesOf(String(props?.text ?? ''));
    const grid = gridLayout(pieces);
    const candidates = candidatesOf(props?.predict);
    const timing = sceneTiming(dur, grid.length, candidates.length);
    const cues: Cue[] = [
      { t: 0, kind: 'type', len: timing.sentenceReveal },
      { t: Math.max(0, timing.cutStart - 0.14), kind: 'rise', len: Math.min(0.14, timing.cutStart) },
      { t: timing.cutStart, kind: 'swish' },
    ];

    grid.forEach((_, index) => {
      const stagger = grid.length > 1 ? timing.tileSpan * index / (grid.length - 1) : 0;
      const at = timing.tileStart + stagger;
      if (at < dur) cues.push({ t: at, kind: 'pop', step: index / Math.max(1, grid.length - 1) });
    });

    if (candidates.length === 0) {
      if (timing.tileComplete < dur) cues.push({ t: timing.tileComplete, kind: 'shimmer' });
      return cues.filter((cue) => cue.t >= 0 && cue.t < dur).slice(0, 38);
    }

    if (timing.contextStart < dur) {
      cues.push({ t: timing.contextStart, kind: 'swish' });
      cues.push({ t: timing.contextStart, kind: 'pop', step: 0 });
    }

    cues.push({ t: Math.max(0, timing.predictionStart - 0.12), kind: 'rise', len: Math.min(0.12, timing.predictionStart) });
    candidates.forEach((_, index) => {
      const at = timing.predictionStart + index * timing.rowDelay;
      if (at < dur) cues.push({ t: at, kind: 'pop', step: index / Math.max(1, candidates.length - 1) });
    });

    for (let tick = 1; tick <= 3; tick++) {
      const at = timing.predictionStart + timing.raceDur * tick / 4;
      if (at < dur) cues.push({ t: at, kind: 'tick' });
    }

    if (timing.winnerStart < dur) {
      cues.push(
        { t: Math.max(0, timing.winnerStart - 0.16), kind: 'rise', len: Math.min(0.16, timing.winnerStart) },
        { t: timing.winnerStart, kind: 'swish' },
      );
      const landing = timing.winnerStart + timing.winnerDur;
      if (landing < dur) {
        cues.push({ t: landing, kind: 'impact' });
        if (landing + 0.04 < dur) cues.push({ t: landing + 0.04, kind: 'shimmer' });
      }
    }

    return cues.filter((cue) => cue.t >= 0 && cue.t < dur).slice(0, 38);
  },
};

