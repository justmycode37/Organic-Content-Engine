import type { Cue, Frame, ShotProps } from '../core.ts';
import { drawHedgy, hedgyCues, HEDGY_POSES, SPECIES_IDS, type HedgyExpression, type HedgyLook, type HedgyPose } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const EXPRESSIONS: HedgyExpression[] = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'];
const LOOKS: HedgyLook[] = ['camera', 'forward', 'up', 'down'];
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => typeof value === 'string' && values.includes(value as T) ? value as T : fallback;

/** Actor test card. params: pose ('sheet' | 'faces' | a pose name), expression, look, facing, scale. */
export const hedgyDemoShot: ShotDef = {
  name: 'demo-hedgy',
  describe: 'Hedgy actor test card; params: pose (sheet | faces | pose name), expression, look, facing, scale.',
  render(frame: Frame, props: ShotProps) {
    const p = props.params ?? {}, ctx = frame.ctx;
    ctx.fillStyle = '#0B0B0D'; ctx.fillRect(0, 0, 1080, 1920);
    const label = (text: string, x: number, y: number) => { ctx.fillStyle = '#8A8A92'; ctx.font = '700 18px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillText(text, x, y); };
    if (p.pose === 'sheet') {
      const page = typeof p.page === 'number' ? p.page : 0, poses = HEDGY_POSES.slice(page * 15, page * 15 + 15);
      poses.forEach((pose, index) => {
        const x = 130 + (index % 5) * 205, y = 400 + Math.floor(index / 5) * 400;
        drawHedgy(ctx, { x, y, scale: 0.5, t: frame.t, pose, shadow: true });
        label(pose, x, y + 44);
      });
      return;
    }
    if (p.pose === 'cast') {
      const acc = ['none', 'none', 'visor', 'none', 'tie+glasses', 'cap', 'none', 'scarf', 'none', 'none', 'none'] as const;
      SPECIES_IDS.forEach((species, index) => {
        const x = 150 + (index % 4) * 262, y = 420 + Math.floor(index / 4) * 410;
        drawHedgy(ctx, { x, y, scale: 0.8, t: frame.t, pose: typeof p.as === 'string' ? p.as as HedgyPose : 'idle', species, accessory: acc[index], shadow: true });
        label(species, x, y + 44);
      });
      return;
    }
    if (p.pose === 'faces') {
      EXPRESSIONS.forEach((expression, index) => {
        const x = 190 + (index % 3) * 350, y = 470 + Math.floor(index / 3) * 420;
        drawHedgy(ctx, { x, y, t: frame.t, pose: 'idle', expression, look: LOOKS[index % 4], shadow: true });
        label(expression, x, y + 50);
      });
      return;
    }
    const pose = choice(p.pose, HEDGY_POSES, 'idle');
    const expression = typeof p.expression === 'string' && EXPRESSIONS.includes(p.expression as HedgyExpression) ? p.expression as HedgyExpression : undefined;
    drawHedgy(ctx, { x: typeof p.x === 'number' ? p.x : 540, y: typeof p.y === 'number' ? p.y : 1000, scale: typeof p.scale === 'number' ? p.scale : 2, t: frame.t, pose, facing: p.facing === -1 ? -1 : 1, look: choice(p.look, LOOKS, 'forward'), expression, shadow: true });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    return hedgyCues(choice((props.params ?? {}).pose, HEDGY_POSES, 'idle') as HedgyPose, dur);
  },
};
