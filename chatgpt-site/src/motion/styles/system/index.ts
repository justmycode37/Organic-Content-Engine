import type { StyleDef } from '../style.ts';
import { type AccentName, type Theme } from '../../core.ts';
import { camera, CAPTION_TOP, CAPTION_WIDTH, LEFT, prose } from './draw.ts';
import { scenes } from './scenes.ts';
import { specials } from './specials.ts';

const accents: Record<AccentName, string> = { blue: '#438DFF', lime: '#C5FF30', red: '#FF525E', orange: '#FF9A3D', magenta: '#FF53CB', yellow: '#F5F749' };
// Light mode: the same roles on a paper-white console; accents deepened to keep text contrast on white.
const lightAccents: Record<AccentName, string> = { blue: '#1663F0', lime: '#3F8A00', red: '#D92035', orange: '#C85A00', magenta: '#C2178F', yellow: '#8F7A00' };

export function systemTheme(mode: Theme['mode'], accent: AccentName): Theme {
  if (mode === 'light') return { mode, bg: '#F2F4F7', panel: '#FFFFFF', panelAlt: '#E4E8EE', fg: '#0B0E12', line: '#CDD3DC', muted: '#8A93A0', dim: '#4F5966', accent: lightAccents[accent] ?? lightAccents.blue, onAccent: '#FFFFFF' };
  return { mode, bg: '#080A0D', panel: '#101318', panelAlt: '#191D23', fg: '#F4F6F8', line: '#2A3039', muted: '#7B8592', dim: '#AAB4C2', accent: accents[accent] ?? accents.blue, onAccent: '#080A0D' };
}


export const systemStyle: StyleDef = {
  name: 'system', description: 'SYSTEM ONLINE: one living command, one state, one consequence.',
  defaultMode: 'dark', defaultAccent: 'blue', theme: systemTheme,
  fonts: [{ family: 'System Geist', file: 'fonts/Geist.ttf', weight: '100 900' }, { family: 'System Geist Mono', file: 'fonts/GeistMono.ttf', weight: '100 900' }],
  scenes, specials,
  background(frame) { frame.ctx.fillStyle = frame.theme.bg; frame.ctx.fillRect(0, 0, 1080, 1920); },
  chrome() {},
  caption(frame, caption, time) {
    if (time < caption.start || time >= caption.end) return;
    prose(frame, caption.text, LEFT, CAPTION_TOP, CAPTION_WIDTH, 88, 2, frame.theme.fg, 84);
  },
  transition() {},
  camera,
  impact() {},
};
