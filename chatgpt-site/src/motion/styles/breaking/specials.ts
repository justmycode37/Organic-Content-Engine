import { z } from 'zod';
import type { Frame } from '../../core.ts';
import type { SpecialScene } from '../style.ts';
import { BODY, SUPPORT, copy, cutout, rect } from './draw.ts';
import { beat, headline, number } from './scenes.ts';

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);
const alertSchema = z.object({ headline: bounded(72), kicker: bounded(48).optional(), deck: bounded(100).optional() }).strict();
const headlineSchema = z.object({ kicker: bounded(48), headline: bounded(90), deck: bounded(120), asset: bounded(64).optional(), imageLabel: bounded(48).optional() }).strict();
const numberSchema = z.object({ number: bounded(14), label: bounded(60), comparison: bounded(96), attribution: bounded(70) }).strict();
const quoteSchema = z.object({ text: bounded(180), attribution: bounded(70), source: z.string().url().max(500) }).strict();
const cutoutSchema = z.object({ asset: bounded(64).optional(), name: bounded(48), deck: bounded(120).optional(), quote: quoteSchema.optional() }).strict();
const tickerSchema = z.object({ title: bounded(48), headlines: z.array(bounded(70)).min(2).max(5), attribution: bounded(80) }).strict();
const verdictSchema = z.object({ verdict: z.enum(['TRUE', 'MISLEADING', 'DEVELOPING']), claim: bounded(100), explanation: bounded(160), attribution: bounded(80) }).strict();

function readData<Shape>(frame: Frame, schema: z.ZodType<Shape>, input: unknown): Shape | undefined {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  headline(frame, 'SCENE DATA MISSING');
  return undefined;
}

export const specials: Record<string, SpecialScene> = {
  alert: {
    schema: alertSchema,
    purpose: 'Readable opening headline becomes its qualification, not a masthead plus kicker plus deck.',
    hook: true,
    render(frame, props) {
      const data = readData(frame, alertSchema, props.data);
      if (!data) return;
      const current = beat(frame, 3);
      const numeric = data.headline.match(/^(\d[\d,.]*)\s+(.+)$/s);
      // Frame zero already reads attribution, number and subject; the highlight underlines it, the reveal replaces it.
      if (numeric && current < 2) {
        number(frame, numeric[1]!, data.kicker ?? '', numeric[2]!);
        if (current === 1) rect(frame, 140, 800, 716 * Math.min(1, (frame.t - frame.events[0]!.at) / 0.18), 18, frame.theme.accent);
      } else headline(frame, current === 2 ? data.deck ?? data.headline : data.headline, current < 2 ? data.kicker ?? '' : '');
    },
  },
  headline: {
    schema: headlineSchema,
    purpose: 'Cut-out subject hands off to one headline, then one explanatory clause.',
    hook: true,
    render(frame, props) {
      const data = readData(frame, headlineSchema, props.data);
      if (!data) return;
      const current = beat(frame, 3);
      if (data.asset && current === 0) {
        cutout(frame, data.asset, 190, 360, 580, 500);
        copy(frame, data.imageLabel ?? 'ILLUSTRATION', 140, 880, 716, 112, SUPPORT, frame.theme.fg, BODY);
      } else headline(frame, current === 2 ? data.deck : data.headline);
    },
  },
  bignumber: {
    schema: numberSchema,
    purpose: 'One stable number with units, followed by its comparison and mandatory attribution.',
    hook: true,
    render(frame, props) {
      const data = readData(frame, numberSchema, props.data);
      if (!data) return;
      const current = beat(frame, 3);
      if (current === 2) headline(frame, data.attribution);
      else number(frame, data.number, data.label, current === 1 ? data.comparison : '');
    },
  },
  cutout: {
    schema: cutoutSchema,
    purpose: 'A labelled illustration is replaced by its implication or a supplied attributed quote.',
    render(frame, props) {
      const data = readData(frame, cutoutSchema, props.data);
      if (!data) return;
      const current = beat(frame, 3);
      if (current === 0) {
        cutout(frame, data.asset, 190, 340, 580, 530);
        copy(frame, data.name, 140, 880, 716, 112, 96);
      } else headline(frame, current === 2 && data.quote ? data.quote.attribution : data.quote?.text ?? data.deck ?? data.name);
    },
  },
  ticker: {
    schema: tickerSchema,
    purpose: 'Dispatch reel: one full-size headline physically rolls off before the next lands. No crawl or stacked newspaper UI.',
    render(frame, props) {
      const data = readData(frame, tickerSchema, props.data);
      if (!data) return;
      const current = beat(frame, data.headlines.length + 1);
      const latest = frame.events?.filter(event => event.at <= frame.t).at(-1)?.at ?? current * 0.8;
      const elapsed = Math.max(0, frame.t - latest);
      const shift = current > 0 ? 100 * Math.max(0, 1 - elapsed / 0.16) ** 3 : 0;
      frame.ctx.save();
      frame.ctx.beginPath(); frame.ctx.rect(96, 340, 820, 640); frame.ctx.clip();
      frame.ctx.translate(0, shift);
      headline(frame, current === data.headlines.length ? data.attribution : data.headlines[current] ?? '');
      frame.ctx.restore();
    },
  },
  verdict: {
    schema: verdictSchema,
    purpose: 'Question, one verdict slam, then the condition that resolves it; never simultaneous paragraphs.',
    render(frame, props) {
      const data = readData(frame, verdictSchema, props.data);
      if (!data) return;
      const current = beat(frame, 4);
      const bottom = headline(frame, [data.claim, data.verdict, data.explanation, data.attribution][current] ?? '', '', 900);
      if (current === 1) rect(frame, 140, bottom + 20, 716, 18, frame.theme.accent);
    },
  },
};
