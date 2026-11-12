import { z } from 'zod';
import { type Frame } from '../../core.ts';
import type { SpecialScene } from '../style.ts';
import { bars, beat, command, process, progress, rows, state } from './draw.ts';

const label = z.string().min(1).max(60);
const short = z.string().min(1).max(32);
const updateSchema = z.object({ version: short, date: short, title: z.string().min(1).max(90), changes: z.array(label).min(3).max(4), status: z.enum(['ONLINE', 'DEGRADED', 'PATCHED']).default('ONLINE') }).strict();
const processSchema = z.object({ title: label, steps: z.array(z.object({ label: short, note: label.optional() }).strict()).min(2).max(5), note: label.default('ILLUSTRATIVE PIPELINE') }).strict();
const metricSchema = z.object({ label: short, value: z.number().finite().min(0).max(1e12), suffix: z.string().max(12).optional(), kind: z.enum(['counter', 'gauge', 'sparkline']).default('counter'), max: z.number().positive().max(1e12).optional(), series: z.array(z.number().finite().min(0).max(1e12)).min(2).max(24).optional() }).strict().superRefine((metric, context) => {
  if (metric.kind === 'gauge' && (!metric.max || metric.value > metric.max)) context.addIssue({ code: 'custom', message: 'Gauge needs max >= value', path: ['max'] });
  if (metric.kind === 'sparkline' && !metric.series) context.addIssue({ code: 'custom', message: 'Sparkline needs source series', path: ['series'] });
});
const dashboardSchema = z.object({ title: label, metrics: z.array(metricSchema).min(2).max(4), note: label }).strict();
const benchmarkSchema = z.object({ title: label, unit: z.string().max(12).default(''), items: z.array(z.object({ label: short, value: z.number().finite().min(0).max(1e12), detail: label.optional() }).strict()).min(2).max(5), highlight: z.number().int().min(0).max(4).default(1), delta: label }).strict().superRefine((data, context) => {
  if (data.highlight >= data.items.length) context.addIssue({ code: 'custom', message: 'Highlight must identify an item', path: ['highlight'] });
});
const logSchema = z.object({ title: label, events: z.array(z.object({ time: z.string().regex(/^\d{2}:\d{2}$/), message: label, status: z.enum(['ONLINE', 'DEGRADED', 'PATCHED', 'REVIEW']) }).strict()).min(1).max(5), highlight: z.number().int().min(0).max(4).default(0) }).strict().superRefine((data, context) => {
  if (data.highlight >= data.events.length) context.addIssue({ code: 'custom', message: 'Highlight must identify an event', path: ['highlight'] });
});
const networkSchema = z.object({ title: label, nodes: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,20}$/), label: short }).strict()).min(2).max(6), edges: z.array(z.tuple([z.string().min(1).max(20), z.string().min(1).max(20)])).min(1).max(10), path: z.array(z.string().min(1).max(20)).min(2).max(8), note: label }).strict().superRefine((data, context) => {
  const identifiers = new Set(data.nodes.map(node => node.id));
  if (identifiers.size !== data.nodes.length) context.addIssue({ code: 'custom', message: 'Node IDs must be unique', path: ['nodes'] });
  if ([...data.edges.flat(), ...data.path].some(id => !identifiers.has(id))) context.addIssue({ code: 'custom', message: 'Edges and path must reference known nodes', path: ['edges'] });
  if (data.path.slice(1).some((id, index) => !data.edges.some(edge => edge[0] === data.path[index] && edge[1] === id))) context.addIssue({ code: 'custom', message: 'Path must follow directed edges', path: ['path'] });
});

function define<Data>(schema: z.ZodType<Data>, purpose: string, render: (frame: Frame, data: Data) => void, hook = false): SpecialScene<Data> {
  return { schema, purpose, hook, render(frame, props) {
    const result = schema.safeParse(props.data ?? {});
    if (result.success) render(frame, result.data);
    else rows(frame, [{ label: 'Data unavailable', detail: 'SCHEMA VALIDATION REQUIRED' }], 'Input checkpoint');
  } };
}

export const specials = {
  update: define(updateSchema, 'One update becomes its resulting state; legacy metadata remains data only.', (frame, data) => {
    command(frame, state(frame, 2) ? data.changes[state(frame, data.changes.length)]! : data.title, undefined, progress(frame, 0) > 0);
  }, true),
  process: define(processSchema, 'One command changes state at each event.', (frame, data) => process(frame, data.title, data.steps)),
  dashboard: define(dashboardSchema, 'Legacy metrics become sequential readouts, never simultaneous tiles.', (frame, data) => {
    const metric = data.metrics[state(frame, data.metrics.length)]!;
    command(frame, metric.label, metric.value.toLocaleString('en-US') + (metric.suffix ?? ''), true);
  }),
  benchmark: define(benchmarkSchema, 'Replace baseline with result in the same panel.', (frame, data) => bars(frame, data.title, data.items, data.unit)),
  log: define(logSchema, 'One meaningful log message without synthetic timestamps.', (frame, data) => rows(frame, data.events.map(event => ({ label: event.message })), data.title)),
  network: define(networkSchema, 'A packet arrives before the next actor lights up; topology remains validated.', (frame, data) => {
    const segment = Math.min(data.path.length - 2, state(frame, data.path.length - 1));
    const arrived = frame.t >= beat(frame, segment) + .42;
    const identifier = data.path[segment + (arrived ? 1 : 0)];
    command(frame, data.nodes.find(node => node.id === identifier)?.label ?? '', undefined, arrived);
  }),
};
