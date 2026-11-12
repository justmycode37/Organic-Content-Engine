import { z } from 'zod';
import type { Frame } from '../../core.ts';
import type { SpecialScene } from '../style.ts';
import { active, beat, copy, focusText, marker } from './draw.ts';
import { attribution, inspect, quotation, sourceImage } from './source.ts';

const short = (maximum: number) => z.string().trim().min(1).max(maximum);
const source = { source: short(90), date: short(32) };
const unit = z.number().min(0).max(1);
const region = z.tuple([unit, unit, unit, unit]).refine(([left, top, width, height]) => width > 0 && height > 0 && left + width <= 1 && top + height <= 1, 'crop must stay inside the capture');
const exhibitSchema = z.object({
  label: short(36).optional(), title: short(90).optional(), text: short(360).optional(), ...source,
  asset: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional(), captured: short(32).optional(),
  url: z.url().optional(), focus: region.optional(), destination: region.optional(),
  highlight: short(80).optional(), loupe: z.boolean().optional(),
  /** Exact source clauses in original capture pixels, read in order on the scene's events; a clause may wrap onto a second line. */
  clauses: z.array(z.array(z.tuple([z.number().min(0), z.number().min(0), z.number().positive(), z.number().positive()])).min(1).max(3)).min(1).max(6).optional(),
  /** Clauses already marked when the scene opens, carried over from the previous visit to the same capture. */
  held: z.number().int().min(0).max(5).optional(),
}).strict().refine(data => !data.clauses || !data.asset || (data.held ?? 0) < data.clauses.length, { message: 'held must leave at least one clause to read', path: ['held'] })
  .refine(data => !data.clauses || Boolean(data.asset), { message: 'clauses require a capture asset', path: ['clauses'] }).refine(data => Boolean(data.asset || data.text), { message: 'an exhibit needs a capture asset or its verbatim text', path: ['text'] })
  .refine(data => !data.highlight || Boolean(data.text?.includes(data.highlight)), { message: 'highlight must be an exact substring of text', path: ['highlight'] });

function exhibit(frame: Frame, data: z.infer<typeof exhibitSchema>) {
  const image = data.asset ? frame.assets?.[data.asset] : undefined;
  const rectangle = (value?: [number, number, number, number]) => value && image ? { x: value[0] * image.width, y: value[1] * image.height, w: value[2] * image.width, h: value[3] * image.height } : undefined;
  if (data.asset && data.clauses) inspect(frame, data.asset, data.clauses.map(clause => clause.map(([x, y, w, h]) => ({ x, y, w, h }))), data.held ?? 0, data.source, data.captured ?? data.date);
  else if (data.asset) sourceImage(frame, data.asset, rectangle(data.focus), data.title ?? '', data.source, data.captured ?? data.date, rectangle(data.destination));
  else {
    focusText(frame, data.text, 88, 490, beat(frame, 0));
    attribution(frame, data.source, data.date);
  }
}

const claimSchema = z.object({ case: short(24).optional(), question: short(120), note: short(160).optional() }).strict();
const claim: SpecialScene<z.infer<typeof claimSchema>> = {
  schema: claimSchema, purpose: 'Open on the question, then mark its operative word.', hook: true,
  render(frame, { data }) {
    focusText(frame, `*${data.question}*`, 132, 480, beat(frame, 0));
    marker(frame, 120, 960, 768, 12, beat(frame, 1));
  },
};
const quoteSchema = z.object({ text: short(360), highlight: short(80).optional(), ...source }).strict().refine(data => !data.highlight || data.text.includes(data.highlight), { message: 'highlight must occur verbatim in the quote', path: ['highlight'] });
const quote: SpecialScene<z.infer<typeof quoteSchema>> = {
  schema: quoteSchema, purpose: 'Read a verbatim quotation sequentially, retaining every qualifier.',
  render(frame, { data }) { quotation(frame, data.text, data.source, data.date); },
};
const boardSchema = z.object({
  title: short(80), exhibits: z.array(z.object({ label: short(28), title: short(64), detail: short(120), ...source }).strict()).min(3).max(5),
  connectors: z.array(z.tuple([z.number().int().min(0).max(4), z.number().int().min(0).max(4)])).max(8).optional(),
}).strict().superRefine((data, context) => {
  (data.connectors ?? []).forEach((pair, index) => {
    if (pair.some(value => value >= data.exhibits.length) || pair[0] === pair[1]) context.addIssue({ code: 'custom', path: ['connectors', index], message: 'connectors must join two different existing exhibit indices' });
  });
});
const board: SpecialScene<z.infer<typeof boardSchema>> = {
  schema: boardSchema, purpose: 'Replace one attributed condition with the next instead of piling up cards.',
  render(frame, { data }) {
    const items = data.exhibits ?? [], selected = active(frame, items.length), item = items[selected];
    if (!item) return;
    focusText(frame, item.title, 112, 490, beat(frame, selected));
    attribution(frame, item.source, item.date);
  },
};
const timelineSchema = z.object({ title: short(80), events: z.array(z.object({ date: short(32), text: short(100), source: short(80) }).strict()).min(2).max(5) }).strict();
const timeline: SpecialScene<z.infer<typeof timelineSchema>> = {
  schema: timelineSchema, purpose: 'Reveal dated evidence one observation at a time.',
  render(frame, { data }) {
    const items = data.events ?? [], item = items[active(frame, items.length)];
    if (!item) return;
    focusText(frame, item.text, 96, 490);
    attribution(frame, item.source, item.date);
  },
};
const verdictSchema = z.object({ status: z.enum(['CONFIRMED', 'PARTLY TRUE', 'MISLEADING', 'UNVERIFIED']), reason: short(180), note: short(120).optional() }).strict();
const verdict: SpecialScene<z.infer<typeof verdictSchema>> = {
  schema: verdictSchema, purpose: 'Land a scoped verdict after the evidence, then replace it with the reason.',
  render(frame, { data }) {
    if (beat(frame, 1) > .5) { focusText(frame, data.reason, 104, 500); return; }
    const landing = beat(frame, 0);
    frame.ctx.save(); frame.ctx.translate(120, 540 + 70 * (1 - landing));
    marker(frame, 0, 0, 768, 250, landing);
    copy(frame, data.status, 24, 30, 720, { size: 112, maxLines: 2 });
    frame.ctx.restore();
  },
};

export const proofSpecials: Record<string, SpecialScene> = {
  claim, exhibit: { schema: exhibitSchema, purpose: 'Travel to an exact clause of a real capture, mark it on speech, then resolve.', render: (frame, { data }) => exhibit(frame, data) },
  board, quote, timeline, verdict,
};
