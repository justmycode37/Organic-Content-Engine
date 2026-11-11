import { clamp, ease, font, stripMarkup, type Frame, type TokensProps, type SceneDef } from '../core.ts';
import { fitPixel, pixelHeight, pixelText, text, textWidth } from '../prim.ts';

type Piece = { value: string; accent: boolean; id: number };
type ChipItem = { piece?: Piece; slot?: true; w: number; row: number; x: number };
const CHIP_H = 116;
const CHIP_GAP_X = 12;
const CHIP_GAP_Y = 8;
const ROW_H = 96;
const ROW_GAP = 8;
const CHIP_MAX = 24;

const hashText = (value: string) => {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

function piecesOf(raw: string): Piece[] {
  const spans = raw.slice(0, 12000).split(/(\*[^*]+\*)/).filter(Boolean);
  const out: Piece[] = [];
  spans.forEach((span, si) => {
    const marked = span.startsWith('*') && span.endsWith('*');
    const plain = marked ? span.slice(1, -1) : span;
    plain.split(/\s+/).filter(Boolean).forEach((word, wi) => {
      for (let offset = 0; offset < word.length && out.length < CHIP_MAX; offset += 8) {
        const value = word.slice(offset, offset + 8);
        out.push({ value, accent: marked, id: hashText([si, wi, value, offset].join(':')) % 9000 + 1000 });
      }
    });
  });
  return out;
}

function wrapSans(ctx: Frame['ctx'], value: string, maxWidth: number, size: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const pushWord = (word: string) => {
    const candidate = line ? line + ' ' + word : word;
    if (!line || textWidth(ctx, candidate, size) <= maxWidth) { line = candidate; return; }
    lines.push(line);
    line = word;
  };
  for (const word of words) {
    if (textWidth(ctx, word, size) <= maxWidth) { pushWord(word); continue; }
    let part = '';
    for (const char of word) {
      if (part && textWidth(ctx, part + char, size) > maxWidth) { pushWord(part); part = char; }
      else part += char;
    }
    if (part) pushWord(part);
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last && textWidth(ctx, last + '…', size) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = last + '…';
  return kept;
}

function chipWidth(ctx: Frame['ctx'], value: string): number {
  return Math.min(420, Math.max(112, Math.ceil(textWidth(ctx, value, 50, 800, 'mono') + 40)));
}

function pack(items: Piece[], slotWidth: number | null, maxRows: number): { items: ChipItem[]; rows: number } {
  for (let limit = items.length; limit >= 0; limit--) {
    const shown = items.slice(0, limit);
    if (limit < items.length) {
      const overflow = '+' + (items.length - limit);
      shown.push({ value: overflow, accent: false, id: hashText(overflow) % 9000 + 1000 });
    }
    const rows: { piece?: Piece; slot?: true; w: number }[][] = [[]];
    const sequence: { piece?: Piece; slot?: true; w: number }[] = shown.map(piece => ({ piece, w: chipWidthForValue(piece.value) }));
    if (slotWidth !== null) sequence.push({ slot: true, w: slotWidth });
    sequence.forEach(entry => {
      let current = rows[rows.length - 1]!;
      const used = current.reduce((sum, item) => sum + item.w, 0) + Math.max(0, current.length - 1) * CHIP_GAP_X;
      if (current.length && used + CHIP_GAP_X + entry.w > 888) { rows.push([]); current = rows[rows.length - 1]!; }
      current.push(entry);
    });
    const compactRows = rows.filter(row => row.length > 0);
    if (compactRows.length <= maxRows) {
      const placed: ChipItem[] = [];
      compactRows.forEach((row, rowIndex) => {
        const total = row.reduce((sum, item) => sum + item.w, 0) + Math.max(0, row.length - 1) * CHIP_GAP_X;
        let x = 96 + (888 - total) / 2;
        row.forEach(item => { placed.push({ ...item, row: rowIndex, x }); x += item.w + CHIP_GAP_X; });
      });
      return { items: placed, rows: compactRows.length };
    }
  }
  return { items: [], rows: 0 };
}

function chipWidthForValue(value: string): number {
  // The value is at most eight code units in normal tokenization; this conservative
  // width keeps even unusual font fallbacks inside SAFE.
  return Math.min(420, Math.max(112, value.length * 30 + 40));
}

function drawChip(ctx: Frame['ctx'], theme: Frame['theme'], piece: Piece, x: number, y: number, w: number, scale = 1, winner = false) {
  const cx = x + w / 2, cy = y + CHIP_H / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  const fill = winner ? theme.accent : theme.panel;
  const stroke = winner ? theme.accent : piece.accent ? theme.accent : theme.line;
  const ink = winner ? theme.onAccent : piece.accent ? theme.accent : theme.fg;
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 4;
  ctx.fillRect(x, y, w, CHIP_H); ctx.strokeRect(x, y, w, CHIP_H);
  ctx.font = font(50, 800, 'mono'); ctx.fillStyle = ink; ctx.textBaseline = 'middle';
  ctx.fillText(piece.value, x + 18, y + 36, w - 36);
  pixelText(ctx, String(piece.id), cx, y + 78, 4, { color: winner ? theme.onAccent : theme.dim, align: 'center' });
  ctx.restore();
}

function drawReservation(ctx: Frame['ctx'], theme: Frame['theme'], item: ChipItem, chipTop: number) {
  const y = chipTop + item.row * (CHIP_H + CHIP_GAP_Y);
  ctx.fillStyle = theme.panelAlt; ctx.strokeStyle = theme.dim; ctx.lineWidth = 4;
  ctx.fillRect(item.x, y, item.w, CHIP_H); ctx.strokeRect(item.x, y, item.w, CHIP_H);
  pixelText(ctx, 'NEXT', item.x + item.w / 2, y + 42, 4, { color: theme.dim, align: 'center' });
}

function monoLabel(ctx: Frame['ctx'], value: string, maxWidth: number): string {
  let label = String(value ?? '').trim().slice(0, 12);
  while (label.length > 1 && textWidth(ctx, label, 40, 800, 'mono') > maxWidth) label = label.slice(0, -1);
  return label;
}

export const tokensScene: SceneDef<TokensProps> = {
  type: 'tokens',
  render(frame: Frame, props: TokensProps) {
    const { ctx, theme, t } = frame;
    const dur = Math.max(0.1, Number.isFinite(frame.dur) ? frame.dur : 1);
    const raw = String(props.text ?? '').slice(0, 12000);
    const sentence = stripMarkup(raw);
    const allPieces = piecesOf(raw);
    const sourceCandidates = Array.isArray(props.predict) ? props.predict.slice(0, 4) : [];
    const candidates = sourceCandidates.map((candidate, index) => ({
      token: String(candidate?.token ?? '').slice(0, 128),
      p: clamp(Number.isFinite(candidate?.p) ? candidate.p : 0),
      index,
    })).sort((a, b) => b.p - a.p || a.index - b.index);
    const hasPred = candidates.length > 0;
    const winner = candidates[0];
    const winnerPiece: Piece | null = winner ? { value: winner.token.slice(0, 8) || '…', accent: false, id: hashText('winner:' + winner.token) % 9000 + 1000 } : null;
    const winnerWidth = winnerPiece ? chipWidth(ctx, winnerPiece.value) : null;
    const chipLayout = pack(allPieces, hasPred ? winnerWidth : null, hasPred ? 4 : 7);
    const rows = chipLayout.rows;
    const chipBlockH = rows ? rows * CHIP_H + (rows - 1) * CHIP_GAP_Y : 0;
    const titleText = String(props.title ?? '').slice(0, 64).trim();
    const titleFit = titleText ? fitPixel(titleText.toUpperCase(), 888, 1, [8, 7, 6, 5]) : null;
    const titleLine = titleFit?.lines[0] ?? '';
    const titleH = titleLine ? pixelHeight(titleFit!.px) : 0;
    const titleGap = titleH ? 20 : 0;
    const cutAt = Math.min(dur * 0.28, 0.72);
    const sentenceSize = 68;
    const sentenceLines = wrapSans(ctx, sentence, 840, sentenceSize, 5);
    const sentenceLineH = 78;
    const sentenceH = Math.max(sentenceLineH, sentenceLines.length * sentenceLineH);
    const titleHeight = titleH;
    let chipTop: number;
    let groupTop: number;
    let predictionY = 0;
    if (hasPred) {
      const predictionH = candidates.length * ROW_H + Math.max(0, candidates.length - 1) * ROW_GAP;
      const totalH = titleHeight + titleGap + chipBlockH + 20 + predictionH;
      groupTop = Math.max(240, Math.round(740 - totalH / 2));
      chipTop = groupTop + titleHeight + titleGap;
      predictionY = chipTop + chipBlockH + 20;
    } else {
      const counterH = pixelHeight(8);
      const totalH = titleHeight + titleGap + chipBlockH + 24 + counterH;
      groupTop = Math.max(240, Math.round(740 - totalH / 2));
      chipTop = groupTop + titleHeight + titleGap;
    }
    const sentenceCenter = Math.max(748, groupTop + titleHeight + titleGap + sentenceH / 2 + 24);
    const sentenceTop = Math.round(sentenceCenter - sentenceH / 2);

    if (titleLine) pixelText(ctx, titleLine, 540, groupTop, titleFit!.px, { color: theme.fg, align: 'center' });
    const cutEnd = cutAt + 0.12;
    if (t < cutEnd) {
      sentenceLines.forEach((line, index) => text(ctx, line, 540, sentenceTop + sentenceLineH / 2 + index * sentenceLineH, { size: sentenceSize, color: theme.fg, align: 'center', baseline: 'middle' }));
      if (t >= cutAt) {
        const cutProgress = clamp((t - cutAt) / 0.12);
        const bladeX = 96 + ease.outExpo(cutProgress) * 888;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(bladeX - 6, sentenceTop - 20, 12, sentenceH + 40);
        ctx.fillStyle = theme.fg;
        const cutY = sentenceTop + sentenceH / 2;
        ctx.fillRect(108, cutY - 3, Math.max(0, bladeX - 120), 6);
        ctx.fillRect(Math.min(972, bladeX + 12), cutY - 3, Math.max(0, 972 - bladeX - 12), 6);
      }
      return;
    }

    chipLayout.items.forEach((item, index) => {
      if (item.slot) { drawReservation(ctx, theme, item, chipTop); return; }
      if (!item.piece) return;
      const start = cutAt + Math.min(0.12, index * 0.006);
      const p = ease.outBack(clamp((t - start) / 0.18));
      const scale = 0.82 + Math.max(0, p) * 0.18;
      drawChip(ctx, theme, item.piece, item.x, chipTop + item.row * (CHIP_H + CHIP_GAP_Y), item.w, scale);
    });

    if (!hasPred) {
      const counterY = chipTop + chipBlockH + 24;
      const reveal = ease.outBack(clamp((t - Math.max(cutAt + 0.22, dur * 0.56)) / 0.22));
      pixelText(ctx, allPieces.length + ' TOKENS', 540, counterY, 8, { color: theme.fg, align: 'center', reveal });
      return;
    }

    const winnerIndex = Math.max(0, candidates.findIndex(candidate => candidate === winner));
    const moveAt = dur * 0.55 + Math.max(Math.min(0.45, dur * 0.1), Math.max(0, (candidates.length - 1) * 0.055 + 0.22));
    const moveDur = Math.min(0.28, Math.max(0.14, dur * 0.08));
    const moveProgress = ease.outBack(clamp((t - moveAt) / moveDur));
    candidates.forEach((candidate, index) => {
      const yy = predictionY + index * (ROW_H + ROW_GAP);
      const local = t - dur * 0.55 - index * 0.055;
      if (local < 0) return;
      const winning = candidate === winner;
      const rowEntrance = ease.outExpo(clamp(local / 0.18));
      ctx.save(); ctx.translate((1 - rowEntrance) * 18, 0);
      ctx.fillStyle = theme.panel; ctx.strokeStyle = theme.line; ctx.lineWidth = 4;
      ctx.fillRect(96, yy, 888, ROW_H); ctx.strokeRect(96, yy, 888, ROW_H);
      const label = monoLabel(ctx, candidate.token, 280);
      const rowInk = winning && moveProgress < 1 ? theme.accent : winning ? theme.dim : theme.fg;
      ctx.font = font(40, 800, 'mono'); ctx.fillStyle = rowInk; ctx.textBaseline = 'middle';
      ctx.fillText(label, 120, yy + ROW_H / 2, 280);
      const barX = 432, segmentW = 18, segmentGap = 4, segments = 16;
      const fillCount = Math.round(candidate.p * segments * clamp(local / 0.22));
      for (let segment = 0; segment < segments; segment++) {
        ctx.fillStyle = segment < fillCount ? (winning && moveProgress < 1 ? theme.accent : theme.dim) : theme.line;
        ctx.fillRect(barX + segment * (segmentW + segmentGap), yy + 28, segmentW, 40);
      }
      const percent = Math.round(candidate.p * 100) + '%';
      pixelText(ctx, percent, 984, yy + 23, 7, { color: winning && moveProgress < 1 ? theme.accent : theme.fg, align: 'right' });
      ctx.restore();
    });

    if (winner && winnerPiece && winnerWidth !== null && t >= dur * 0.55) {
      const startY = predictionY + winnerIndex * (ROW_H + ROW_GAP) + ROW_H / 2;
      const startX = 96 + winnerWidth / 2;
      const slot = chipLayout.items.find(item => item.slot);
      const targetX = slot ? slot.x + slot.w / 2 : startX;
      const targetY = slot ? chipTop + slot.row * (CHIP_H + CHIP_GAP_Y) + CHIP_H / 2 : startY;
      const move = clamp((t - moveAt) / moveDur);
      const eased = ease.outBack(move);
      const cx = startX + (targetX - startX) * eased;
      const cy = startY + (targetY - startY) * eased;
      const scale = 0.82 + 0.18 * eased;
      drawChip(ctx, theme, winnerPiece, cx - winnerWidth / 2, cy - CHIP_H / 2, winnerWidth, scale, true);
    }
  },
};
