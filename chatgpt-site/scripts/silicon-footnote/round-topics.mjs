import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';

const roundNumber = name => Number(/^r(\d+)$/i.exec(name)?.[1]);
const read = path => JSON.parse(readFileSync(path, 'utf8'));

export function earlierTopics(directory) {
  const dir = resolve(directory);
  const parent = dirname(dir);
  const current = roundNumber(basename(dir));
  if (basename(parent) !== 'evaluation' || !current) return [];

  const prior = readdirSync(parent)
    .filter(name => roundNumber(name) > 0 && roundNumber(name) < current)
    .sort((a, b) => roundNumber(a) - roundNumber(b));
  return prior.flatMap(round => {
    const sourceFile = join(parent, round, 'sources.json');
    const planFile = join(parent, round, 'episode.json');
    const topic = existsSync(sourceFile) ? read(sourceFile).topic : '';
    const title = existsSync(planFile) ? read(planFile).title : '';
    return topic || title ? [{round, topic, title}] : [];
  });
}

const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function overlappingRound(material, prior, compare) {
  if (!prior.length) return null;
  const duplicate = prior.find(p => [p.topic, p.title].some(value => value && normalize(value) === normalize(material.topic)));
  if (duplicate) return duplicate.round;
  const {round} = await compare(material, prior);
  if (round === null || prior.some(p => p.round === round)) return round;
  throw Error('Topic comparison returned an unknown round');
}
