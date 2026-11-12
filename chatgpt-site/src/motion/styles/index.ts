// Style registry. One folder per style; the key is the spec `style`.
import type { StyleName } from '../core.ts';
import type { StyleDef } from './style.ts';
import { breakingStyle } from './breaking/index.ts';
import { proofStyle } from './proof/index.ts';
import { systemStyle } from './system/index.ts';
import { bigideaStyle } from './bigidea/index.ts';
import { miniworldStyle } from './miniworld/index.ts';

/** The original look: everything comes from the shared defaults. */
const patchStyle: StyleDef = {
  name: 'patch',
  description: 'PATCH NOTES: black, white and grey, one aggressive accent, pixel titles, bold sans captions, code-animated explainers.',
};

export const STYLE_DEFS: Record<StyleName, StyleDef> = {
  patch: patchStyle,
  breaking: breakingStyle,
  proof: proofStyle,
  system: systemStyle,
  bigidea: bigideaStyle,
  miniworld: miniworldStyle,
};
export const styleOf = (name: StyleName | undefined): StyleDef => STYLE_DEFS[name ?? 'patch'] ?? patchStyle;
export type { StyleDef, SpecialScene, StyleFont } from './style.ts';
