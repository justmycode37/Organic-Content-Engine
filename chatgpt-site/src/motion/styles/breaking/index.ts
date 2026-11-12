import type { StyleDef } from '../style.ts';
import { makeTheme, type AccentName } from '../../core.ts';
import { background, caption } from './draw.ts';
import { scenes } from './scenes.ts';
import { specials } from './specials.ts';

const signals: Record<AccentName, string> = { red: '#D91616', yellow: '#FFE500', lime: '#C6FF00', orange: '#FF5700', blue: '#2455FF', magenta: '#FF1684' };

export const breakingStyle: StyleDef = {
  name: 'breaking',
  description: 'BREAKING INTERNET: stripped digital tabloid, condensed headline replacements, cut-outs and spoken-word number slams. No simulated newsroom UI.',
  defaultMode: 'light',
  defaultAccent: 'red',
  theme(mode, accent) {
    const theme = makeTheme(mode, accent);
    const bg = mode === 'light' ? '#FFFFFF' : '#111110';
    const fg = mode === 'light' ? '#111110' : '#FFFFFF';
    return { ...theme, bg, fg, dim: fg, muted: fg, panel: bg, panelAlt: bg, line: fg, accent: signals[accent], onAccent: ['yellow', 'lime', 'orange', 'red'].includes(accent) ? '#111110' : '#FFFFFF' };
  },
  fonts: [
    { family: 'Breaking Anton', file: 'fonts/Anton-Regular.ttf', weight: '400' },
    { family: 'Breaking Archivo', file: 'fonts/ArchivoNarrow-Variable.ttf', weight: '400 700' },
  ],
  background,
  chrome() {},
  caption(frame, active) { caption(frame, active.text); },
  camera(frame) { frame.ctx.save(); },
  impact() {},
  scenes,
  specials,
};
