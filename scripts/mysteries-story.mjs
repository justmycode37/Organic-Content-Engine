#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { interviewPlan } from './mysteries-presenter.mjs';

// Matches the verified Silicon Footnote Titan preset (39b666e).
const titan = {voiceId: 'dtSEyYGNJqjrtBArPCVZ', model: 'eleven_flash_v2_5', settings: {stability: 0.2, similarity_boost: 0.2}};
const onCamera = beat => beat.shot.representation === 'presenter';
const speaker = beat => onCamera(beat) ? 'Rowan on camera' : 'Titan voiceover';

const schema = JSON.parse(await readFile(new URL('../docs/mysteries-of-the-sky/story.schema.json', import.meta.url), 'utf8'));
export const reviewStages = ['factual-accuracy', 'story-clarity', 'visual-science', 'readability-timing'];

// Only the JSON Schema keywords used by the bundled contract are needed here.
// This is deliberately a local validator, not a general JSON Schema implementation.
function checkShape(value, rule, path, errors) {
  if (rule.$ref) {
    const target = rule.$ref.split('/').slice(1).reduce((node, key) => node[key], schema);
    return checkShape(value, target, path, errors);
  }
  const error = message => errors.push(`${path}: ${message}`);
  if ('const' in rule && value !== rule.const) error(`must equal ${JSON.stringify(rule.const)}`);
  if (rule.enum && !rule.enum.includes(value)) error(`must be one of ${rule.enum.join(', ')}`);
  if (rule.type) {
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (actual !== rule.type || (actual === 'number' && !Number.isFinite(value))) {
      error(`must be ${rule.type}`);
      return;
    }
  }
  if (typeof value === 'string') {
    if (rule.minLength && [...value].length < rule.minLength) error(`must contain at least ${rule.minLength} character(s)`);
    if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) error(`must match ${rule.pattern}`);
    if (rule.format === 'date') {
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) error('must be a real YYYY-MM-DD date');
    }
    if (rule.format === 'uri') {
      try { new URL(value); } catch { error('must be an absolute URL'); }
    }
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) error(`must be at least ${rule.minimum}`);
    if (rule.maximum !== undefined && value > rule.maximum) error(`must be at most ${rule.maximum}`);
    if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) error(`must be greater than ${rule.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) error(`needs at least ${rule.minItems} item(s)`);
    if (rule.maxItems !== undefined && value.length > rule.maxItems) error(`allows at most ${rule.maxItems} item(s)`);
    if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) error('items must be unique');
    if (rule.items) value.forEach((item, index) => checkShape(item, rule.items, `${path}[${index}]`, errors));
  } else if (value !== null && typeof value === 'object') {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) error(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (rule.properties && Object.hasOwn(rule.properties, key)) checkShape(item, rule.properties[key], `${path}.${key}`, errors);
      else if (rule.additionalProperties === false) error(`unknown property ${key}`);
    }
  }
}

function checkPlaceholders(value, path, errors) {
  if (typeof value === 'string' && /\b(?:TODO|TBD|REPLACE_ME)\b/u.test(value)) errors.push(`${path}: replace the drafting placeholder`);
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) checkPlaceholders(item, `${path}.${key}`, errors);
  }
}

export function validateStory(story) {
  const errors = [];
  const warnings = [];
  checkShape(story, schema, '$', errors);
  checkPlaceholders(story, '$', errors);
  // Semantic checks may assume the contract's shape only after it passes.
  if (errors.length) return { valid: false, errors, warnings, summary: null };

  const indexed = (items, label, key = 'id') => {
    const map = new Map();
    items.forEach(item => {
      if (map.has(item[key])) errors.push(`${label}: duplicate ${key} ${item[key]}`);
      map.set(item[key], item);
    });
    return map;
  };
  const sources = indexed(story.sources, 'sources');
  const claims = indexed(story.claims, 'claims');
  indexed(story.beats, 'beats');
  const reviews = indexed(story.reviews, 'reviews', 'stage');
  for (const stage of reviewStages) if (!reviews.has(stage)) errors.push(`reviews: missing ${stage}`);
  const usedSources = new Set();
  const usedClaims = new Set();
  for (const claim of story.claims) {
    for (const support of claim.support) {
      if (!sources.has(support.sourceId)) errors.push(`claims.${claim.id}: unknown source ${support.sourceId}`);
      usedSources.add(support.sourceId);
    }
    if (claim.kind === 'illustrative-calculation' && !claim.calculation) errors.push(`claims.${claim.id}: illustrative-calculation needs inputs, formula, result and assumptions`);
    if (claim.kind !== 'illustrative-calculation' && claim.calculation) errors.push(`claims.${claim.id}: calculation requires kind illustrative-calculation`);
  }
  if (story.beats[0].role !== 'hook') errors.push('beats: first beat must be the hook');
  if (story.beats.at(-1).role !== 'payoff') errors.push('beats: last beat must be the payoff');
  if (!story.beats.some(beat => beat.role === 'caveat')) errors.push('beats: include a caveat that communicates limits to the viewer');
  for (const beat of story.beats) {
    for (const id of beat.claimIds) {
      if (!claims.has(id)) errors.push(`beats.${beat.id}: unknown claim ${id}`);
      usedClaims.add(id);
    }
    const shotSources = new Set(beat.shot.sourceIds);
    for (const id of beat.shot.claimIds) {
      if (!beat.claimIds.includes(id)) errors.push(`beats.${beat.id}.shot: claim ${id} must be in this beat's claimIds`);
      const claim = claims.get(id);
      if (claim && !claim.support.some(support => shotSources.has(support.sourceId))) errors.push(`beats.${beat.id}.shot: claim ${id} needs at least one of its supporting sources`);
    }
    for (const id of shotSources) if (!sources.has(id)) errors.push(`beats.${beat.id}.shot: unknown source ${id}`);
    const labelTerms = { presenter: /\b(?:Rowan|presenter)\b/iu, schematic: /\b(?:schematic|illustrative)\b/iu, 'replotted-data': /\bdata\b/iu, 'source-image': /\bimage\b/iu };
    if (!labelTerms[beat.shot.representation].test(beat.shot.provenanceLabel)) errors.push(`beats.${beat.id}.shot: provenanceLabel must identify ${beat.shot.representation}`);
    const calculated = beat.claimIds.some(id => claims.get(id)?.kind === 'illustrative-calculation');
    if (calculated && !/\b(?:illustrative|example)\b/iu.test([beat.shot.provenanceLabel, ...beat.shot.onScreenText].join(' '))) errors.push(`beats.${beat.id}: label the numerical example as illustrative`);
  }
  for (const id of claims.keys()) if (!usedClaims.has(id)) errors.push(`claims.${id}: unused claim; connect it to a beat or remove it`);
  for (const id of sources.keys()) if (!usedSources.has(id)) warnings.push(`sources.${id}: no claim currently cites this source`);
  for (const review of story.reviews) {
    if (review.status === 'pass' && (/^(unassigned|pending)$/iu.test(review.reviewer.trim()) || /^(none|pending)$/iu.test(review.evidence.trim()))) errors.push(`reviews.${review.stage}: a pass needs a named reviewer and review evidence`);
    if (review.status === 'changes-requested' && !review.findings.length) errors.push(`reviews.${review.stage}: record the requested changes`);
  }
  const durationSeconds = Number(story.beats.reduce((total, beat) => total + beat.durationSeconds, 0).toFixed(3));
  const rowanSeconds = story.beats.filter(onCamera).reduce((total, beat) => total + beat.durationSeconds, 0);
  if (rowanSeconds * 2 >= durationSeconds) errors.push('beats: Titan must carry the majority of the narration; use Rowan for brief expert cutaways');
  for (const [index, beat] of story.beats.entries()) {
    if (!onCamera(beat)) continue;
    if (beat.durationSeconds > 7 || (index > 0 && onCamera(story.beats[index - 1]))) warnings.push(`beats.${beat.id}: review the interview cut for brevity; aim for a single short thought before returning to Titan`);
  }
  const narrationWords = story.beats.reduce((total, beat) => total + beat.narration.trim().split(/\s+/u).length, 0);
  if (Math.abs(durationSeconds - story.brief.targetDurationSeconds) > 3) warnings.push(`Planned beats total ${durationSeconds}s; brief target is ${story.brief.targetDurationSeconds}s. Review timing; do not compress narration to fit.`);
  const pendingReviews = story.reviews.filter(review => review.status !== 'pass').map(review => review.stage);
  if (pendingReviews.length) warnings.push(`Review not passed: ${pendingReviews.join(', ')}`);
  return { valid: errors.length === 0, errors, warnings, summary: { storyId: story.storyId, sources: sources.size, claims: claims.size, beats: story.beats.length, durationSeconds, rowanSeconds, narrationWords, pendingReviews } };
}

export function voicePlan(story) {
  const result = validateStory(story);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return story.beats.map((beat, i, beats) => {
    const cue = {beatId: beat.id, speaker: speaker(beat), plannedSeconds: beat.durationSeconds};
    if (onCamera(beat)) {
      return {...cue, ...interviewPlan(beat.narration)};
    }
    return {...cue, provider: 'elevenlabs', endpoint: `/v1/text-to-speech/${titan.voiceId}/with-timestamps?output_format=mp3_44100_128`,
      body: {text: beat.narration, model_id: titan.model, voice_settings: {...titan.settings},
        previous_text: i > 0 && !onCamera(beats[i - 1]) ? beats[i - 1].narration : undefined,
        next_text: i + 1 < beats.length && !onCamera(beats[i + 1]) ? beats[i + 1].narration : undefined}};
  });
}

export function createDraft() {
  return {
    version: 1, brand: 'Mysteries of the Sky', storyId: 'new-story', status: 'preproduction', updatedAt: new Date().toISOString().slice(0, 10),
    brief: { title: 'TODO', centralQuestion: 'TODO', audience: 'Curious viewers without an astronomy background', oneSentenceAnswer: 'TODO', hook: 'TODO', payoff: 'TODO', targetDurationSeconds: 720, scope: 'One astrophysics mechanism grounded in primary evidence', exclusions: ['No unsupported discoveries or claims about habitability'] },
    sources: [], claims: [], beats: [],
    reviews: reviewStages.map(stage => ({ stage, status: 'pending', reviewer: 'unassigned', evidence: 'pending', findings: [] }))
  };
}

// Keep authored text literal in the handoff, even when it contains Markdown.
const md = value => String(value).replaceAll('\\', '\\\\').replace(/([`*_[\]<>#|])/gu, '\\$1').replace(/\r?\n/gu, '  \n');
const number = value => String(Number(value.toFixed(3)));
export function renderHandoff(story) {
  const result = validateStory(story);
  if (!result.valid) throw new Error(`Invalid story:\n${result.errors.join('\n')}`);
  const lines = [`# ${md(story.brief.title)}`, '', 'Local preproduction handoff. Structure checked; this does not certify facts, assets, delivery or a finished video.', '',
    `Story: ${story.storyId} · Updated: ${story.updatedAt} · Planned duration: ${number(result.summary.durationSeconds)}s · Narration: ${result.summary.narrationWords} words`, '',
    `Review: ${result.summary.pendingReviews.length ? `not approved (${result.summary.pendingReviews.join(', ')})` : 'all preproduction reviews recorded as passed; production review remains separate'}`, '', '## Brief', ''];
  for (const key of ['centralQuestion', 'audience', 'oneSentenceAnswer', 'hook', 'payoff', 'scope']) lines.push(`- **${key}:** ${md(story.brief[key])}`);
  lines.push(`- **Exclusions:** ${story.brief.exclusions.map(md).join('; ')}`, '', '## Narration', '', `Planned voice time · Titan ${number(result.summary.durationSeconds - result.summary.rowanSeconds)}s · Rowan ${number(result.summary.rowanSeconds)}s`, '', ...story.beats.flatMap(beat => [`**${speaker(beat)}** · ${md(beat.narration)}`, '']), '## Beat and shot handoff', '');
  let cursor = 0;
  for (const beat of story.beats) {
    const end = cursor + beat.durationSeconds;
    lines.push(`### ${beat.id} · ${number(cursor)}–${number(end)}s · ${beat.role}`, '',
      `**${speaker(beat)} / verbatim captions:** ${md(beat.narration)}`, '',
      `**Shot (${beat.shot.representation}):** ${md(beat.shot.direction)}`, '',
      `**On-screen text:** ${beat.shot.onScreenText.map(md).join(' / ')}`, '',
      `**Visible provenance label:** ${md(beat.shot.provenanceLabel)}`, '',
      `**Beat claims:** ${beat.claimIds.join(', ')} · **Shot claims:** ${beat.shot.claimIds.join(', ')} · **Shot sources:** ${beat.shot.sourceIds.join(', ')}`, '',
      `**Visual caveats:** ${beat.shot.visualCaveats.map(md).join('; ')}`, '',
      `**Continuity:** ${md(beat.shot.continuity)} · **Transition:** ${beat.shot.transition}`, '');
    cursor = end;
  }
  lines.push('## Claim ledger', '');
  for (const claim of story.claims) {
    lines.push(`### ${claim.id} · ${claim.kind}`, '', md(claim.statement), '', `**Uncertainty:** ${md(claim.uncertainty)}`, '', `**Limits:** ${claim.limitations.map(md).join('; ')}`, '');
    for (const support of claim.support) lines.push(`- ${support.sourceId}, ${md(support.locator)}: ${md(support.supports)}`);
    if (claim.calculation) lines.push('', `**Inputs:** ${claim.calculation.inputs.map(md).join('; ')}`, '', `**Formula:** ${md(claim.calculation.formula)}`, '', `**Result:** ${md(claim.calculation.result)}`, '', `**Assumptions:** ${claim.calculation.assumptions.map(md).join('; ')}`);
    lines.push('');
  }
  lines.push('## Primary sources', '');
  for (const source of story.sources) lines.push(`### ${source.id}: ${md(source.title)}`, '', `${source.authors.map(md).join(', ')} · ${md(source.institution)} · ${md(source.published)}`, '',
    `<${source.url}>`, '', `**Kind / version:** ${source.kind} / ${md(source.version)} · Accessed: ${source.accessedAt}`, '',
    `**Why primary:** ${md(source.primaryReason)}`, '', `**Evidence read:** ${md(source.evidenceNote)}`, '');
  lines.push('## Review record', '');
  for (const review of story.reviews) lines.push(`- **${review.stage}: ${review.status}** · ${md(review.reviewer)} · ${md(review.evidence)}${review.findings.length ? ` · Findings: ${review.findings.map(md).join('; ')}` : ''}`);
  if (result.warnings.length) lines.push('', '## Validation notes', '', ...result.warnings.map(warning => `- ${md(warning)}`));
  return `${lines.join('\n')}\n`;
}

const help = `Local source-to-story preproduction (Node 20+, no dependencies or network):
  node scripts/mysteries-story.mjs init <draft.json>
  node scripts/mysteries-story.mjs validate <story.json> [--json]
  node scripts/mysteries-story.mjs handoff <story.json> <handoff.md>
  node scripts/mysteries-story.mjs voice-plan <story.json> <provider-requests.json>

init writes an incomplete draft. validate checks structure and traceability only.
handoff validates first and preserves existing output files. Exit 0: valid;
exit 1: invalid story or I/O failure; exit 2: invalid command/arguments.
`;

export async function main(args) {
  const [command, input, output, ...extra] = args;
  if (command === '--help' || command === '-h') { process.stdout.write(help); return 0; }
  if (extra.length || !input || (command === 'init' && output) || (command === 'validate' && output && output !== '--json') || (['handoff', 'voice-plan'].includes(command) && !output) || !['init', 'validate', 'handoff', 'voice-plan'].includes(command)) {
    process.stderr.write(help);
    return 2;
  }
  try {
    if (command === 'init') {
      await writeFile(input, `${JSON.stringify(createDraft(), null, 2)}\n`, { flag: 'wx' });
      process.stdout.write(`Draft created: ${resolve(input)} (incomplete; add sources, claims and beats before validation)\n`);
      return 0;
    }
    const story = JSON.parse(await readFile(input, 'utf8'));
    const result = validateStory(story);
    if (command === 'validate') {
      if (output === '--json') process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      else process.stdout.write([`${result.valid ? 'VALID STRUCTURE' : 'INVALID'}: ${resolve(input)}`, ...result.errors.map(error => `ERROR ${error}`), ...result.warnings.map(warning => `NOTE ${warning}`), ...(result.summary ? [`${result.summary.beats} beats · ${result.summary.durationSeconds}s planned · ${result.summary.narrationWords} words`] : []), 'Structure validation does not certify scientific or production approval.', ''].join('\n'));
      return result.valid ? 0 : 1;
    }
    if (!result.valid) throw new Error(`Invalid story:\n${result.errors.join('\n')}`);
    if (resolve(input) === resolve(output)) throw new Error('Input and output paths must differ');
    const contents = command === 'voice-plan' ? JSON.stringify(voicePlan(story), null, 2) + '\n' : renderHandoff(story);
    await writeFile(output, contents, { flag: 'wx' });
    process.stdout.write(`Preproduction handoff: ${resolve(output)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`mysteries-story: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  process.exitCode = await main(process.argv.slice(2));
}
