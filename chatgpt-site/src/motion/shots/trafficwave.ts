import type { ShotDef } from './index.ts';
import { beats, cue, cuesIn, num, pick } from './common.ts';
import { drawStage } from '../kit/stage.ts';
import { clamp } from '../kit/motion.ts';
import { circuitPosition, drawCircuitCar, drawRingRoad } from '../props/traffic.ts';

const cx = 360, cy = 530;
const tau = Math.PI * 2;

// Integrate a smooth brake-and-release pulse. All cars keep moving clockwise.
// Each follower starts the same pulse one reaction interval later, so the
// compact group of tail lights and the shrinking gaps travel counterclockwise.
function brakePulse(age: number, length: number) {
  const p = clamp(age, 0, length), ramp = length / 4;
  if (p < ramp) return { loss: p * p / (2 * ramp), lamp: p / ramp };
  if (p <= length - ramp) return { loss: p - ramp / 2, lamp: 1 };
  const tail = length - p;
  return { loss: length - ramp - tail * tail / (2 * ramp), lamp: tail / ramp };
}

export const trafficwaveShot: ShotDef = {
  name: 'trafficwave', stage: 'clean', defaultWorld: () => 'testtrack',
  describe: 'Overhead ring-road traffic experiment. Cars move clockwise around an unobstructed single lane. Circulate shows equal spacing, brake isolates one brief tap, wave passes braking and bunching backward from driver to driver. params: mode (circulate|brake|wave, default wave), cars (6–12, default 9). Event 1 starts the brake tap; use world testtrack and a wide camera for the whole circuit.',
  render({ ctx, t, dur }, props) {
    const mode = pick(props.params, 'mode', ['circulate', 'brake', 'wave'], 'wave');
    const count = Math.round(num(props.params, 'cars', 9, 6, 12));
    const [tap] = beats(props, dur, [.15]);
    const interval = clamp(dur * .10, .20, .42);
    const spacing = tau / count, cruise = spacing * .54 / interval;
    // The seed driver always taps near the top of the circuit.
    const elapsed = (t - tap!) / interval;
    drawStage(ctx);
    const framing = .90;
    drawRingRoad(ctx, { x: cx, y: cy, scale: framing });
    for (let i = 0; i < count; i++) {
      let loss = 0, lamp = 0;
      if (mode === 'wave' && elapsed >= i) {
        const age = elapsed - i, length = 2.9;
        const pulse = brakePulse(age % count, length);
        loss = Math.floor(age / count) * length * .75 + pulse.loss;
        lamp = pulse.lamp;
      } else if (mode === 'brake' && i === 0) {
        const pulse = brakePulse(elapsed, 1);
        loss = pulse.loss;
        lamp = pulse.lamp;
      }
      const angle = -Math.PI / 2 - i * spacing + cruise * (t - tap! - interval * loss);
      const pos = circuitPosition(angle);
      drawCircuitCar(ctx, cx + pos.x * framing, cy + pos.y * framing, pos.heading, framing * Math.min(.70, 5 / count), i, Math.min(1, lamp * 2.8));
    }
  },
  cues(props, dur) {
    const mode = pick(props.params, 'mode', ['circulate', 'brake', 'wave'], 'wave');
    if (mode === 'circulate') return [];
    const [tap] = beats(props, dur, [.15]);
    return cuesIn(dur, [cue(tap!, 'squeak', .44)]);
  },
};
