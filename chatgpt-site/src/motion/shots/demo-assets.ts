import { clamp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { pixelText } from '../prim.ts';
import { ASSETS, ASSET_NAMES } from '../assets/index.ts';
import { render3d } from '../three.ts';
import type { ShotDef } from './index.ts';

const PAGE_SIZE = 9;
const pageNumber = (props: ShotProps) => Math.max(0, Math.floor(Number(props.params?.page ?? 0) || 0));
const cameraZoom = (name: string) => {
  if (name === 'city-block') return 62;
  if (name === 'vault') return 50;
  if (name === 'skyscraper' || name === 'apartment-tower') return 66;
  if (name === 'factory' || name === 'rocket' || name === 'parachute' || name === 'umbrella') return 60;
  if (name === 'printing-press' || name === 'money-printer') return 62;
  if (name === 'ladder') return 70;
  if (name === 'bomb') return 82;
  if (name === 'airplane' || name === 'cargo-ship' || name === 'truck') return 74;
  if (name === 'shopping-cart') return 116;
  if (name === 'gear' || name === 'key' || name === 'laptop') return 124;
  if (name === 'domino-row') return 128;
  if (name === 'coin') return 152;
  if (name === 'coin-stack' || name === 'coin-pile') return 118;
  if (name === 'credit-card' || name === 'banknote') return 126;
  if (name === 'ingot' || name === 'banknote-bundle' || name === 'wallet') return 118;
  return 104;
};

export const demoAssetsShot: ShotDef = {
  name: 'demo-assets',
  describe: 'Contact sheet of detailed finance storytelling models. params.page selects a 3x3 page of the deterministic asset library.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, t } = frame;
    const pages = Math.ceil(ASSET_NAMES.length / PAGE_SIZE);
    const page = pageNumber(props) % pages;
    const names = ASSET_NAMES.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    pixelText(ctx, 'FINANCE ASSET LIBRARY', 540, 230, 9, { color: theme.fg, align: 'center', reveal: clamp(t / 0.18) });
    pixelText(ctx, 'HEDGY / MONOCHROME 3D MODELS', 540, 326, 4, { color: theme.dim, align: 'center' });
    ctx.fillStyle = theme.line;
    ctx.fillRect(156, 365, 768, 4);

    names.forEach((name, localIndex) => {
      const col = localIndex % 3, row = Math.floor(localIndex / 3);
      const x = 38 + col * 334, y = 390 + row * 270, viewW = 316, viewH = 228;
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, viewW - 4, viewH - 4);
      const opts = { detail: 0.78, count: name === 'coin-pile' ? 13 : 8, seed: frame.seed + page * PAGE_SIZE + localIndex, floors: 7, values: [2, 4, 3, 6, 5, 8, 7] };
      const model = ASSETS[name]!(opts);
      const yaw = 0.48 + Math.sin(t * 0.55 + localIndex * 0.31) * 0.19;
      const pitch = 0.43 + Math.sin(t * 0.8 + localIndex) * 0.025;
      const pulse = 1 + Math.sin(t * 2.4 + localIndex * 0.7) * 0.018;
      render3d(ctx, theme, {
        x: x + 6, y: y + 6, w: viewW - 12, h: viewH - 12,
        zoom: cameraZoom(name), yaw, pitch, distance: 7.5, cell: 4, outline: true,
      }, [{ mesh: model.mesh, materials: model.materials, scale: pulse, rot: [0, t * 0.07 + localIndex * 0.05, 0] }]);
      pixelText(ctx, name.replaceAll('-', ' ').toUpperCase(), x + viewW / 2, y + viewH + 13, 2, { color: theme.fg, align: 'center' });
    });

    ctx.fillStyle = theme.line;
    ctx.fillRect(156, 1228, 768, 4);
    pixelText(ctx, 'PAGE ' + String(page + 1).padStart(2, '0') + ' / ' + String(pages).padStart(2, '0'), 540, 1247, 3, { color: theme.dim, align: 'center' });
  },
  cues(_props: ShotProps, dur: number): Cue[] {
    return Array.from({ length: PAGE_SIZE }, (_, i) => 0.1 + i * 0.09)
      .filter(t => t < dur * 0.72)
      .map((t, i) => ({ t, kind: 'pop', gain: 0.3, step: i / Math.max(1, PAGE_SIZE - 1) }));
  },
};

