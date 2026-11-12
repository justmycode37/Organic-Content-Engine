import type { StyleDef } from '../style.ts';
import { clamp, type AccentName, type Mode, type Theme } from '../../core.ts';
import { copy } from './draw.ts';
import { proofScenes } from './scenes.ts';
import { proofSpecials } from './specials.ts';

const markers: Record<AccentName, string> = { yellow: '#FFF500', red: '#E64235', lime: '#BDDE41', orange: '#F29B38', blue: '#649BC8', magenta: '#DD6D9C' };

function theme(mode: Mode, accent: AccentName): Theme {
  return mode === 'dark'
    ? { mode, bg: '#171717', fg: '#F4F2EC', panel: '#242424', panelAlt: '#333333', line: '#515151', muted: '#A2A2A2', dim: '#C0C0C0', accent: markers[accent] ?? markers.yellow, onAccent: '#111111' }
    : { mode, bg: '#F2F1EB', fg: '#171717', panel: '#FFFEF9', panelAlt: '#E5E4DD', line: '#CECEC5', muted: '#71716C', dim: '#565650', accent: markers[accent] ?? markers.yellow, onAccent: '#111111' };
}

export const proofStyle: StyleDef = {
  name: 'proof',
  description: 'PROOF ROOM: paper, black type, one marker. Real evidence pixels, clause-tracked camera travel and scoped verdicts.',
  defaultMode: 'light', defaultAccent: 'yellow', theme,
  fonts: [
    { family: 'Proof Grotesk', file: 'fonts/SpaceGrotesk.ttf', weight: '300 700' },
    { family: 'Proof Mono', file: 'fonts/IBMPlexMono-Regular.ttf', weight: '400' },
  ],
  background({ ctx, theme: palette }) {
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 1080, 1920);
  },
  chrome() {},
  caption(frame, caption, time) {
    frame.ctx.save();
    copy(frame, caption.text, 120, 1036, 800, { size: 90, maxLines: 2, weight: 700, progress: caption.start <= 0 ? 1 : clamp((time - caption.start) / .18) });
    frame.ctx.restore();
  },
  transition(ctx, name, phase, palette) {
    if (name === 'cut') return;
    // A single marker stroke crosses the cut; it never covers the content, so no frame goes blank.
    const x = 1080 * (phase <= 0 ? clamp(phase + 1) / 2 : .5 + clamp(phase) / 2);
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .7; ctx.fillStyle = palette.accent;
    ctx.fillRect(x - 70, 0, 70, 1920); ctx.restore();
  },
  camera(frame) { frame.ctx.save(); },
  impact() {},
  scenes: proofScenes, specials: proofSpecials,
};
