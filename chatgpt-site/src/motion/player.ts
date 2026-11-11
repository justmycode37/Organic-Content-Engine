// Renders one frame of a reel. Layer order: background, camera + scene, impact,
// transition, chrome, caption. Pure function of (spec, time).
import { H, W, placeScenes, reelDuration, type Ctx, type Frame, type PlacedScene, type ReelSpec, type SceneDef } from './core.ts';
import { drawCaption, type ActiveCaption } from './captions.ts';
import { frameTheme } from './pix.ts';
import { drawChrome } from './chrome.ts';
import { drawBackground } from './fx/background.ts';
import { applyCamera, drawImpact } from './fx/camera.ts';
import { TRANSITION_IN, TRANSITION_OUT, drawTransition } from './fx/transitions.ts';
import { SCENES } from './scenes/index.ts';

/** Per-scene captions laid on the reel timeline; explicit `spec.captions` win when present. */
export function reelCaptions(spec: ReelSpec, placed: PlacedScene[] = placeScenes(spec)): ActiveCaption[] {
  if (spec.captions?.length) return [...spec.captions].sort((a, b) => a.start - b.start);
  return placed.flatMap(scene => {
    const lines = (Array.isArray(scene.spec.caption) ? scene.spec.caption : scene.spec.caption ? [scene.spec.caption] : []).filter(line => line.trim());
    const span = (scene.end - scene.start) / Math.max(1, lines.length);
    return lines.map((text, index) => ({ text, start: scene.start + index * span, end: scene.start + (index + 1) * span }));
  });
}

export function renderReel(ctx: Ctx, spec: ReelSpec, time: number) {
  const placed = placeScenes(spec);
  const duration = reelDuration(spec);
  const hedgy=spec.series?.startsWith('HEDGY');
  const theme = frameTheme(ctx, spec.mode, hedgy?'mono':spec.accent, time);
  if(hedgy){theme.accent=theme.fg;theme.accentSolid=theme.fg;theme.onAccent=theme.bg;theme.spectrum=[theme.bg,theme.fg];}
  const scene = placed.find(item => time < item.end) ?? placed.at(-1);
  ctx.save();
  ctx.globalAlpha = 1;
  if (!scene) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
  const frame: Frame = { ctx, t: Math.max(0, time - scene.start), dur: scene.end - scene.start, theme, seed: (scene.index + 1) * 7919, index: scene.index, time };
  const hits = scene.spec.hits ?? [];

  if(hedgy){ctx.fillStyle=theme.bg;ctx.fillRect(0,0,W,H);}else drawBackground(frame,time);
  applyCamera(frame, hits,hedgy?1260:undefined,!!hedgy,placed[scene.index+1]?.spec.transition==='zoom');
  const def = SCENES[scene.spec.type] as SceneDef<unknown>;
  ctx.save();
  if(hedgy){ctx.beginPath();ctx.rect(96,240,888,1020);ctx.clip();}
  def.render(frame, scene.spec);
  ctx.restore();
  ctx.restore(); // camera
  drawImpact(frame, hits);

  // The incoming scene's transition hides the cut from both sides.
  ctx.save();if(hedgy){ctx.beginPath();ctx.rect(0,0,W,1260);ctx.clip();}
  const next = placed[scene.index + 1];
  if (next && (next.spec.transition ?? 'cut') !== 'cut' && time >= scene.end - TRANSITION_OUT)
    drawTransition(ctx, next.spec.transition!, (time - scene.end) / TRANSITION_OUT, theme, next.index + 1);
  else if (scene.index > 0 && (scene.spec.transition ?? 'cut') !== 'cut' && frame.t < TRANSITION_IN)
    drawTransition(ctx, scene.spec.transition!, frame.t / TRANSITION_IN, theme, scene.index + 1);

  ctx.restore();
  drawChrome(frame, spec, time, duration);
  const caption = reelCaptions(spec, placed).find(item => time >= item.start && time < item.end);
  if(caption){
    ctx.save();
    drawCaption(frame,caption,time,hedgy?{top:1320,bottom:1650}:undefined);ctx.restore();
  }
  ctx.restore();
}
