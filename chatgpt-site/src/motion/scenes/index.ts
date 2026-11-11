import {hedgyScene} from './hedgy.ts';
// Scene registry. One file per scene type; the key is the spec `type`.
import type { SceneDef, SceneProps, SceneType } from '../core.ts';
import { titleScene } from './title.ts';
import { codeScene } from './code.ts';
import { diffScene } from './diff.ts';
import { terminalScene } from './terminal.ts';
import { flowScene } from './flow.ts';
import { statScene } from './stat.ts';
import { barsScene } from './bars.ts';
import { compareScene } from './compare.ts';
import { listScene } from './list.ts';
import { tokensScene } from './tokens.ts';
import { chatScene } from './chat.ts';
import { layersScene } from './layers.ts';
import { gridScene } from './grid.ts';
import { kineticScene } from './kinetic.ts';
import { changelogScene } from './changelog.ts';
import { objectScene } from './object.ts';
import { outroScene } from './outro.ts';

export const SCENES: { [K in SceneType]: SceneDef<SceneProps[K]> } = {
  hedgy: hedgyScene,
  title: titleScene,
  code: codeScene,
  diff: diffScene,
  terminal: terminalScene,
  flow: flowScene,
  stat: statScene,
  bars: barsScene,
  compare: compareScene,
  list: listScene,
  tokens: tokensScene,
  chat: chatScene,
  layers: layersScene,
  grid: gridScene,
  kinetic: kineticScene,
  changelog: changelogScene,
  object: objectScene,
  outro: outroScene,
};
