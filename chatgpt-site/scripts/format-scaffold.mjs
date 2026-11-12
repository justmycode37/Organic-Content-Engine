#!/usr/bin/env node
// Scaffold a parseable ReelSpec from a format preset and story brief.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describeStyles, lintReel, parseReelSpec } from '../src/motion/spec.ts';

const sharedSceneTypes = new Set([
  'title', 'code', 'diff', 'terminal', 'flow', 'stat', 'bars', 'compare', 'list',
  'tokens', 'chat', 'layers', 'grid', 'kinetic', 'changelog', 'outro'
]);
const transitionCycle = ['blocks', 'wipe', 'glitch', 'zoom', 'flash', 'shutter', 'cut'];
const knownStyles = new Set(describeStyles().split('\n').map(line => line.slice(0, line.indexOf(':'))));

const clean = value => typeof value === 'string' ? value.replace(/\*([^*]+)\*/g, '$1').replaceAll('*', '').trim() : '';
const fit = (value, max) => clean(value).slice(0, max).trim();
const words = value => clean(value).split(/\s+/).filter(Boolean);
const claimsFor = (...values) => {
  if (values.some(value => value !== undefined && (!Array.isArray(value) || value.some(id => typeof id !== 'string')))) {
    throw new Error('Claim references must be arrays of string IDs.');
  }
  const claims = values.flatMap(value => Array.isArray(value) ? value : []);
  if (claims.some(value => typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value))) {
    throw new Error('Claim references must be valid string IDs.');
  }
  const unique = [...new Set(claims)];
  return unique.length ? unique : undefined;
};
const shortCaption = (value, duration) => words(value).slice(0, Math.max(1, Math.min(12, Math.floor(duration / 0.18)))).join(' ');
const draftCaption = duration => shortCaption('DRAFT: add verified detail.', duration);
const clip = (value, max = 70) => fit(value, max) || 'ADD VERIFIED DETAIL'.slice(0, max);
const textList = (value, fallback, maxCount, maxChars) => {
  const items = Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  return (items.length ? items : fallback).slice(0, maxCount).map(item => clip(item, maxChars));
};

function assertInputs(preset, brief) {
  if (!preset || typeof preset !== 'object' || typeof preset.id !== 'string' || !Array.isArray(preset.beatStructure) || !preset.beatStructure.length) {
    throw new Error('Preset must have an id and a non-empty beatStructure.');
  }
  if (!brief || typeof brief !== 'object' || !clean(brief.story)) {
    throw new Error('Story brief must contain a non-empty "story" string.');
  }
  if (brief.format && brief.format !== preset.id) throw new Error(`Brief format '${brief.format}' does not match preset '${preset.id}'.`);
  if (brief.beats !== undefined && !Array.isArray(brief.beats)) throw new Error('Story brief beats must be an array.');
  const checkClaimIds = (source, label) => {
    for (const field of ['claims', 'claimIds']) {
      const value = source?.[field];
      if (value !== undefined && (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)))) {
        throw new Error(`${label}.${field} must be an array of valid claim IDs.`);
      }
    }
  };
  checkClaimIds(brief, 'brief');
  checkClaimIds(brief.hook, 'hook');
  (brief.beats ?? []).forEach((beat, index) => checkClaimIds(beat, `beats[${index}]`));
  const ranges = preset.beatStructure.map(beat => beat.timeRangeSeconds);
  if (ranges.some(range => !range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start)) {
    throw new Error('Every preset beat needs a valid timeRangeSeconds { start, end }.');
  }
}

function candidatesFor(preset, beat, style, part) {
  const perStyle = preset.sceneRecommendationsByStyle?.[style]?.sceneTypes ?? [];
  const perBeat = beat.recommendedSceneTypes ?? [];
  const preferred = perBeat.filter(type => perStyle.includes(type));
  const candidates = [...new Set([...preferred, ...perBeat, ...perStyle])].filter(type => sharedSceneTypes.has(type) && type !== 'outro');
  return candidates[part % candidates.length] ?? 'title';
}

function makeScene(type, duration, beat, beatBrief, part, index) {
  const authoredTitle = beatBrief?.sceneTitles?.[part] ?? beatBrief?.title ?? beatBrief?.headline;
  const title = clip(authoredTitle ?? beat.purpose, 90);
  // Placeholder diagrams already carry their own labels and caption. Keep a
  // generic title short so the v2 hard on-screen word cap remains enforceable.
  const scaffoldTitle = (fallback) => clean(authoredTitle) ? title : fallback;
  const spoken = clean(beatBrief?.spokenLines?.[part] ?? (part === 0 ? beatBrief?.spokenLine : ''));
  const caption = shortCaption(beatBrief?.captionLines?.[part] ?? (part === 0 ? beatBrief?.caption : ''), duration) || draftCaption(duration);
  const common = {
    duration: Math.round(duration * 100) / 100,
    ...(index ? { transition: transitionCycle[(index - 1) % transitionCycle.length] } : {}),
    ...(claimsFor(beatBrief?.claims, beatBrief?.claimIds) ? { claims: claimsFor(beatBrief?.claims, beatBrief?.claimIds) } : {}),
    ...(spoken ? { say: spoken.slice(0, 220) } : {}),
    caption
  };

  if (type === 'flow') {
    const nodeLabels = textList(beatBrief?.nodes, ['QUESTION', 'MECHANISM'], 5, 60);
    while (nodeLabels.length < 2) nodeLabels.push('MECHANISM');
    return { type, ...common, direction: 'right', packet: 'STEP', nodes: nodeLabels.map((label, node) => ({ label, accent: node === nodeLabels.length - 1 })) };
  }
  if (type === 'list') {
    const items = textList(beatBrief?.items, ['ADD VERIFIED POINTS'], 5, 60);
    return { type, ...common, title: scaffoldTitle('Key points').slice(0, 60), items, style: 'arrow' };
  }
  if (type === 'layers') {
    const layers = textList(beatBrief?.layers, ['ADD VERIFIED LAYER', 'ADD VERIFIED LAYER'], 6, 60);
    while (layers.length < 2) layers.push('ADD VERIFIED LAYER');
    return { type, ...common, title: scaffoldTitle('Key layers').slice(0, 60), layers: layers.map((label, layer) => ({ label, accent: layer === layers.length - 1 })) };
  }
  if (type === 'kinetic') {
    const phrases = textList(beatBrief?.words, ['ADD', 'PAYOFF'], 8, 24);
    return { type, ...common, words: phrases };
  }
  if (type === 'grid') return { type, ...common, title: title.slice(0, 60), rows: 2, cols: 2, pattern: 'scan' };
  if (type === 'code') return { type, ...common, filename: 'DRAFT / REPLACE WITH SOURCE', code: '// Replace with verified code or label this as an illustration.' };
  if (type === 'diff') return { type, ...common, filename: 'DRAFT / VERIFY CHANGE', removed: ['Replace with sourced prior state'], added: ['Replace with verified new state'] };
  if (type === 'terminal') return { type, ...common, title: 'ILLUSTRATIVE PLACEHOLDER', lines: [{ cmd: 'replace with verified command', out: 'replace with observed output', status: 'info' }] };
  if (type === 'stat') {
    if (Number.isFinite(beatBrief?.value) && typeof beatBrief?.label === 'string') {
      return { type, ...common, value: beatBrief.value, label: clip(beatBrief.label, 60), ...(beatBrief.prefix ? { prefix: clip(beatBrief.prefix, 8) } : {}), ...(beatBrief.suffix ? { suffix: clip(beatBrief.suffix, 12) } : {}) };
    }
    return { type: 'title', ...common, text: 'ADD VERIFIED VALUE', kicker: 'DRAFT' };
  }
  if (type === 'bars') {
    const items = Array.isArray(beatBrief?.items) ? beatBrief.items.filter(item => item && typeof item.label === 'string' && Number.isFinite(item.value)) : [];
    if (items.length >= 2) return { type, ...common, title: title.slice(0, 60), items: items.slice(0, 6).map(item => ({ label: clip(item.label, 60), value: item.value, ...(item.accent ? { accent: true } : {}) })) };
    return { type: 'title', ...common, text: title, kicker: 'DRAFT' };
  }
  if (type === 'compare') return { type, ...common, title: scaffoldTitle('Compare options').slice(0, 60), left: { label: 'CONDITION A', points: ['Add sourced result'] }, right: { label: 'CONDITION B', points: ['Add matched result'] } };
  if (type === 'tokens') return { type, ...common, title: title.slice(0, 60), text: 'Replace with a sourced example.' };
  if (type === 'chat') return { type, ...common, messages: [{ role: 'user', text: 'Add the exact task shown.' }, { role: 'ai', text: 'Add a captured, verified output.' }] };
  if (type === 'changelog') return { type, ...common, version: 'VERIFY', product: title.slice(0, 40), items: [{ tag: 'CHG', text: 'ADD VERIFIED CHANGE' }] };
  return { type: 'title', ...common, text: title, kicker: 'DRAFT' };
}

/** Build and validate a complete, explicitly unfinished ReelSpec skeleton. */
export function buildReelSkeleton(preset, brief) {
  assertInputs(preset, brief);
  const requestedStyle = clean(brief.style);
  if (requestedStyle && !knownStyles.has(requestedStyle)) throw new Error(`Unknown style '${requestedStyle}'.`);
  const style = requestedStyle || preset.recommendedStyles?.[0] || 'patch';
  if (!knownStyles.has(style)) throw new Error(`Preset chooses unknown style '${style}'.`);
  const beatBriefs = new Map((brief.beats ?? []).filter(beat => beat && typeof beat.id === 'string').map(beat => [beat.id, beat]));
  const scenes = [];

  for (const [beatIndex, beat] of preset.beatStructure.entries()) {
    const beatBrief = beatBriefs.get(beat.id) ?? brief.beats?.[beatIndex] ?? {};
    const span = beat.timeRangeSeconds.end - beat.timeRangeSeconds.start;
    const requestedCount = Math.max(1, Number(beat.sceneCount) || 1);
    const count = Math.max(requestedCount, Math.ceil(span / 8));
    const duration = span / count;
    const hook = beatIndex === 0;
    const finalBeat = beatIndex === preset.beatStructure.length - 1;
    const hookData = brief.hook ?? {};

    for (let part = 0; part < count; part++) {
      const sceneDuration = Math.round(duration * 100) / 100;
      let scene;
      if (hook) {
        const rawHook = clean(hookData.frameZeroText ?? hookData.text ?? brief.title ?? brief.angle);
        const text = (rawHook || 'ADD FRAME-ZERO HOOK').replace(/\s+/g, ' ');
        if (text.length > 24) throw new Error(`Frame-zero hook is ${text.length} characters; use 24 or fewer for a complete shared kinetic opener.`);
        const audio = clean(hookData.audio);
        scene = {
          type: 'kinetic', duration: sceneDuration, words: [text],
          ...(claimsFor(hookData.claims, hookData.claimIds, brief.claims, brief.claimIds) ? { claims: claimsFor(hookData.claims, hookData.claimIds, brief.claims, brief.claimIds) } : {}),
          ...(audio ? { say: audio.slice(0, 220) } : {}),
          caption: shortCaption(hookData.caption ?? text, sceneDuration) || draftCaption(sceneDuration),
          hits: [Math.min(1, Math.max(0, sceneDuration - 0.1))]
        };
      } else if (finalBeat && part === count - 1) {
        const cta = fit(brief.cta ?? 'Follow PATCH NOTES for the next update.', 90);
        scene = {
          type: 'outro', duration: sceneDuration,
          transition: transitionCycle[(scenes.length - 1) % transitionCycle.length],
          ...(claimsFor(beatBrief?.claims, beatBrief?.claimIds) ? { claims: claimsFor(beatBrief?.claims, beatBrief?.claimIds) } : {}),
          cta, ...(fit(brief.sourceAttribution ?? '', 90) ? { sub: fit(brief.sourceAttribution, 90) } : {}),
          ...(clean(beatBrief?.spokenLines?.[part] ?? beatBrief?.spokenLine) ? { say: clean(beatBrief.spokenLines?.[part] ?? beatBrief.spokenLine).slice(0, 220) } : {}),
          caption: shortCaption(beatBrief?.captionLines?.[part] ?? beatBrief?.caption ?? cta, sceneDuration) || draftCaption(sceneDuration)
        };
      } else {
        const type = candidatesFor(preset, beat, style, part);
        scene = makeScene(type, sceneDuration, beat, beatBrief, part, scenes.length);
      }
      scenes.push(scene);
    }
  }

  if (scenes.length > 40) throw new Error(`Preset expands to ${scenes.length} scenes; maximum is 40.`);
  const spec = {
    version: 1,
    title: fit(brief.title ?? brief.angle ?? brief.story, 90),
    style,
    ...(brief.accent ? { accent: clean(brief.accent) } : {}),
    ...(fit(brief.series ?? 'PATCH NOTES', 60) ? { series: fit(brief.series ?? 'PATCH NOTES', 60) } : {}),
    scenes
  };
  const parsed = parseReelSpec(spec);
  if (!parsed.ok) throw new Error(`Generated ReelSpec failed parseReelSpec:\n${parsed.errors.join('\n')}`);
  const lint = lintReel(parsed.spec);
  const errors = lint.filter(item => item.level === 'error');
  if (errors.length) throw new Error(`Generated ReelSpec has lint errors:\n${errors.map(item => item.message).join('\n')}`);
  return { spec: parsed.spec, lint };
}

async function main() {
  const [presetPath, briefPath, outputPath] = process.argv.slice(2);
  if (!presetPath || !briefPath) {
    throw new Error('Usage: node chatgpt-site/scripts/format-scaffold.mjs <preset.json> <story-brief.json> [output.spec.json]');
  }
  const [preset, brief] = await Promise.all([
    readFile(presetPath, 'utf8').then(JSON.parse),
    readFile(briefPath, 'utf8').then(JSON.parse)
  ]);
  const { spec, lint } = buildReelSkeleton(preset, brief);
  const json = `${JSON.stringify(spec, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, json);
    process.stderr.write(`Wrote ${outputPath}\n`);
  } else process.stdout.write(json);
  const warnings = lint.filter(item => item.level === 'warn');
  if (warnings.length) process.stderr.write(`Lint warnings (${warnings.length}); inspect before rendering:\n${warnings.map(item => `- ${item.message}`).join('\n')}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
