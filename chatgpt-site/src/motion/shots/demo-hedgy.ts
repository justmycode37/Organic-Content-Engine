import type { Cue, Frame, ShotProps } from '../core.ts';
import { drawHedgy, hedgyCues, type HedgyExpression, type HedgyLook, type HedgyPose, type HedgyProp } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const POSES: HedgyPose[] = ['idle', 'walk', 'run', 'jump', 'shock', 'celebrate', 'point', 'think', 'push', 'carry', 'fall', 'curl', 'roll', 'peek', 'sweat', 'sleep', 'wave-off'];
const POSE_SHEET = 'sheet';
const EXPRESSIONS: HedgyExpression[] = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'];
const LOOKS: HedgyLook[] = ['camera', 'forward', 'up', 'down'];
const PROPS: HedgyProp[] = ['coin', 'sign', 'phone', 'umbrella', 'briefcase', 'magnifier', 'none'];
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
const number = (value: unknown, fallback: number, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;

/** Large isolated actor render for checking pixel detail, expression, and the full pose clock. */
export const hedgyDemoShot: ShotDef = {
  name: 'demo-hedgy',
  describe: 'Large natural-brown Hedgy actor test; params: pose (or sheet), expression, look, prop, facing, scale, background (grey).',
  render(frame: Frame, props: ShotProps) {
    const p = props.params ?? {};
    const poseValue = p.pose;
    const isSheet = poseValue === POSE_SHEET;
    const pose = choice(poseValue, POSES, 'jump');
    const expression = typeof p.expression === 'string' && EXPRESSIONS.includes(p.expression as HedgyExpression)
      ? p.expression as HedgyExpression
      : undefined;
    const look = choice(p.look, LOOKS, 'forward');
    const prop = choice(p.prop, PROPS, 'none');
    const facing = p.facing === -1 ? -1 : 1;
    const scale = number(p.scale, 12, 2, 17);
    const x = number(p.x, 540, 260, 820);
    const y = number(p.y, 1140, 680, 1230);
    const ctx = frame.ctx;
    if (p.background === 'grey' || p.background === 'mid-grey') {
      ctx.fillStyle = '#777777';
      ctx.fillRect(0, 0, 1080, 1920);
    }
    if (isSheet) {
      const cellTimes: Record<HedgyPose, number> = {
        idle: 0.55, walk: 0.22, run: 0.12, jump: 0.56, shock: 0.16, celebrate: 0.24,
        point: 0.48, think: 0.72, push: 0.28, carry: 0.25, fall: 0.52, curl: 0.48,
        roll: 0.22, peek: 0.52, sweat: 0.36, sleep: 0.8, 'wave-off': 0.3,
      };
      POSES.forEach((sheetPose, index) => {
        const col = index % 5;
        const row = Math.floor(index / 5);
        const sx = 108 + col * 216 + (sheetPose === 'fall' ? 36 : 0);
        const sy = 390 + row * 232;
        const actorScale = 2.65;
        const shadowWidth = sheetPose === 'roll' || sheetPose === 'curl' ? 66 : 82;
        ctx.fillStyle = frame.theme.line;
        ctx.fillRect(sx - shadowWidth / 2, sy + 6, shadowWidth, 3);
        drawHedgy(ctx, { x: sx, y: sy, scale: actorScale, t: cellTimes[sheetPose], pose: sheetPose, look: 'forward', prop: sheetPose === 'carry' ? 'briefcase' : 'none' });
        ctx.fillStyle = p.background === 'grey' || p.background === 'mid-grey' ? '#2a1a12' : '#e6d1ac';
        ctx.font = '700 16px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(sheetPose.toUpperCase(), sx, sy + (sheetPose === 'fall' ? -68 : 30));
      });
      return;
    }
    const airtime = pose === 'jump' ? 1 - Math.min(1, Math.max(0, frame.t - 0.18) / 0.9) * 0.34 : 1;
    const shadowWidth = Math.max(24, Math.min(420, scale * 30)) * airtime;
    ctx.fillStyle = frame.theme.line;
    ctx.fillRect(x - shadowWidth / 2, y + 20, shadowWidth, 8);
    ctx.fillStyle = frame.theme.panelAlt;
    ctx.fillRect(x - shadowWidth * 0.36, y + 20, shadowWidth * 0.72, 4);
    drawHedgy(ctx, { x, y, scale, t: frame.t, pose, facing, look, expression, prop });
  },
  cues(_props: ShotProps, dur: number): Cue[] {
    const p = _props.params ?? {};
    return hedgyCues(choice(p.pose, POSES, 'jump'), dur);
  },
};
