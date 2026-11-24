import { font, type Frame, type ShotProps } from '../core.ts';
import { ease, phase } from '../kit/motion.ts';
import { drawStage } from '../kit/stage.ts';
import { beats, cue, cuesIn, drawActor, drawItem, num, pick, str } from './common.ts';
import type { ShotDef } from './index.ts';

const VIEWS = ['offer', 'accrue', 'balance', 'charge', 'question'] as const;
const X = 360, TOP = 290, W = 500;
const PAPER = '#FFF2D6', INK = '#222020', LOSS = '#9F2D23';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function plan(props: ShotProps, dur: number) {
  const p = props.params;
  const [first, second] = beats(props, dur, [0.16, 0.54]);
  return {
    view: pick(p, 'view', VIEWS, 'balance'), first: first!, second: second!,
    title: str(p, 'title', 'LOAN STATEMENT'),
    before: str(p, 'before', '$10,000'), change: str(p, 'change', '+$300'),
    after: str(p, 'after', '$10,300'), rate: str(p, 'rate', '6%'),
    months: Math.round(num(p, 'months', 6, 2, 12)),
    monthly: num(p, 'monthly', 50, 0, 1e6),
    next: str(p, 'next', ''),
    monthlyRate: str(p, 'monthlyRate', ''),
    question: str(p, 'question', ''),
  };
}

function text(ctx: Frame['ctx'], value: string, y: number, size: number, fill = INK, maxWidth = W - 44) {
  ctx.font = font(size, 900, 'mono');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(value.toUpperCase(), X, y, maxWidth);
}

export const statementShot: ShotDef = {
  name: 'statement',
  stage: 'clean',
  describe: 'A large paper statement with legible balances and a Hedgy reaction. params: view ("offer", "accrue", "balance", "charge" or "question"), title (short name on the paper), before (starting balance as text), change (signed amount as text), after (updated balance as text), rate (unchanged annual rate as text), months (2–12), monthly (dollars accruing each month), monthlyRate (optional monthly rate as text), next (optional next interest charge attributable to change, as text), question (optional short borrower question). For loan-payment deferral: offer shows a car and a pause button, event 1 presses it and event 2 reveals the extra debt; accrue counts months and unpaid interest from event 1 to 2; balance shows the old balance, event 1 slides in unpaid interest and event 2 posts it to principal; charge shows the monthly rate on event 1 and the next interest charge branching from the amount on event 2; question returns to the opening offer and replaces the pause button with the borrower question on event 1. Keep amounts and timing consistent with narration. The printed values already carry the result.',
  render(frame, props) {
    const { ctx, t, dur } = frame, s = plan(props, dur);
    const reveal = ease.outCubic(phase(t, s.first, s.first + 0.26));
    const post = ease.outCubic(phase(t, s.second, s.second + 0.32));
    const car = s.view === 'offer' || s.view === 'question';
    const owed = s.view === 'charge' || (s.view === 'offer' || s.view === 'balance') && post > 0;
    drawStage(ctx, { line: true });
    if (car) drawItem(ctx, 'car', { x: 451, y: 674, t, scale: 0.62 });

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(X - W / 2 + 9, TOP + 12, W, 262);
    ctx.fillStyle = PAPER;
    ctx.fillRect(X - W / 2, TOP, W, 262);
    ctx.fillStyle = INK;
    ctx.fillRect(X - W / 2, TOP, W, 48);
    text(ctx, s.title, TOP + 24, 28, PAPER);

    ctx.save();
    if (s.view === 'question' && s.question && t >= s.first) {
      const words = s.question.trim().split(/\s+/);
      const split = Math.ceil(words.length / 2);
      text(ctx, 'ASK THE LENDER', TOP + 85, 22, LOSS);
      text(ctx, words.slice(0, split).join(' '), TOP + 144, 34);
      text(ctx, words.slice(split).join(' '), TOP + 194, 34);
    } else if (car) {
      const pressed = s.view === 'offer' && t >= s.first;
      text(ctx, pressed ? 'PAYMENTS PAUSED' : 'PAUSE PAYMENTS?', TOP + 103, 37);
      const extraDebt = pressed && post > 0;
      const buttonY = TOP + 141 + reveal * (pressed && !extraDebt ? 5 : 0);
      ctx.fillStyle = extraDebt ? LOSS : INK;
      ctx.fillRect(X - 165, buttonY, 330, 84);
      text(ctx, extraDebt ? s.change : pressed ? 'INTEREST: ON' : 'Ⅱ  PAUSE', buttonY + 44, extraDebt ? 59 : 31, PAPER, 290);
    } else if (s.view === 'accrue') {
      const step = Math.min(s.months, Math.floor(phase(t, s.first, Math.max(s.first + 0.1, s.second)) * (s.months + 1)));
      const width = (W - 72) / s.months, start = X - (W - 72) / 2;
      for (let i = 0; i < s.months; i++) {
        ctx.fillStyle = i < step ? LOSS : '#D8CBAD';
        ctx.fillRect(start + i * width, TOP + 65, width - 5, 19);
      }
      const sum = usd.format(step * s.monthly).replace(/\.00$/, '');
      text(ctx, `MONTH ${step} / ${s.months}`, TOP + 109, 26);
      text(ctx, sum, TOP + 169, 62, LOSS);
      text(ctx, 'UNPAID INTEREST', TOP + 229, 25, LOSS);
    } else if (s.view === 'balance') {
      text(ctx, `BALANCE   •   ${s.rate} / YEAR`, TOP + 79, 24);
      text(ctx, post >= 0.65 ? s.after : s.before, TOP + 138, 63, post >= 0.65 ? LOSS : INK);
      ctx.globalAlpha *= reveal * (1 - post);
      text(ctx, `${s.change} UNPAID INTEREST`, TOP + 226 + (1 - reveal) * 20 - post * 92, 28, LOSS);
    } else {
      text(ctx, `FROM THE PAUSE: ${s.change.replace(/^\+/, '')}`, TOP + 84, 28);
      if (s.monthlyRate && t >= s.first) text(ctx, `× ${s.monthlyRate} THIS MONTH`, TOP + 122, 25);
      ctx.globalAlpha *= post;
      text(ctx, s.next || '↓', TOP + 180, 65, LOSS);
      text(ctx, 'NEW INTEREST', TOP + 231, 28, LOSS);
    }
    ctx.restore();
    drawActor(ctx, { who: 'hedgy', x: car ? 166 : 220, y: 776, scale: 0.65, facing: 1, time: t, pose: owed ? 'shock' : 'lookup', expression: owed ? 'shocked' : 'worried', look: 'up' });
  },
  cues(props, dur) {
    const s = plan(props, dur);
    if (s.view === 'question') return s.question ? [cue(s.first, 'rustle', 0.7)] : [];
    if (s.view === 'accrue') return cuesIn(dur, Array.from({length:s.months},(_,i)=>cue(s.first+(s.second-s.first)*(i+1)/(s.months+1),'tick',0.7)));
    return cuesIn(dur, [
      cue(s.first, s.view === 'offer' ? 'click' : 'rustle', 0.95),
      cue(s.second, s.view === 'charge' ? 'coin' : 'stamp', 1.15),
    ]);
  },
};
