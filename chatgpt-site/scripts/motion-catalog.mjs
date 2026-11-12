#!/usr/bin/env node
// Print the live motion scene/style catalog for editorial agents.
import { describeScenes, describeStyles } from '../src/motion/spec.ts';

const styles = describeStyles().split('\n');
const knownStyles = styles.map(line => line.slice(0, line.indexOf(':')));
const requested = process.argv[2];
if (requested && !knownStyles.includes(requested)) {
  throw new Error(`Unknown style '${requested}'. Choose one of: ${knownStyles.join(', ')}`);
}

const selected = requested ? [requested] : knownStyles;
const catalog = {
  styles,
  scenesByStyle: Object.fromEntries(selected.map(style => [style, describeScenes(style).split('\n')]))
};
process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
