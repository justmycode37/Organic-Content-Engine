import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst, drawMotionStreak, drawSpeedLines } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const ink = '#08090B', deep = '#15171B', steel = '#6D7076', bright = '#D5D7DA', paper = '#EDEDED';
const mix = (a: number, b: number, p: number) => a + (b - a) * clamp(p);

function eventAt(props: ShotProps, names: string[], fallback: number, dur: number) {
  const wanted = names.map(name => name.toLowerCase());
  const found = props.events?.find(event => wanted.includes(String(event.kind).toLowerCase()));
  return clamp(found?.at ?? fallback * dur, 0, dur);
}

function line(ctx: Frame['ctx'], x1: number, y1: number, x2: number, y2: number, color: string, width = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function polygon(ctx: Frame['ctx'], pts: [number, number][], fill: string, stroke?: string, width = 5) {
  ctx.beginPath(); ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

/** Deep lending hall; the two windows stay separated by open air so each transaction reads. */
function drawHall(frame: Frame, t: number) {
  const { ctx, theme, seed } = frame;
  drawEnv(ctx, { type: 'stage', t, seed: seed + 220, theme, width: W, height: H,
    camera: { x: Math.sin(t * .4) * 18, y: -t * 13, zoom: 1.01, yaw: Math.sin(t * .25) * .04, pitch: .06 } });
  const vpX = 540 + Math.sin(t * .32) * 12, vpY = 270 + Math.sin(t * .7) * 9;
  polygon(ctx, [[0, 0], [260, 0], [vpX - 142, vpY], [345, 1110], [0, 1290]], '#34373C', '#96999E', 7);
  polygon(ctx, [[1080, 0], [820, 0], [vpX + 142, vpY], [735, 1110], [1080, 1290]], '#303237', '#85888D', 7);
  polygon(ctx, [[260, 0], [820, 0], [vpX + 142, vpY], [vpX - 142, vpY]], '#45484E', '#B8BABF', 7);
  // Stacked balconies establish height; wide gaps leave room for the ticket and tether.
  for (let row = 0; row < 5; row++) {
    const p = row / 4, y = 170 + row * 116, half = 510 - p * 228, thick = 15 - p * 3;
    const left = vpX - half, right = vpX + half;
    polygon(ctx, [[left - 18, y], [right + 18, y], [right + 10, y + thick], [left - 10, y + thick]], row % 2 ? '#70737A' : '#575A60', '#AEB1B5', 4);
    ctx.fillStyle = '#C5C7CB'; ctx.fillRect(left, y + thick, right - left, 5);
    for (let x = left + 28; x < right - 16; x += 106 - p * 26) {
      ctx.fillStyle = '#85888E'; ctx.fillRect(x, y - 34, 6, 32);
    }
  }
  // Floor paths and passing edge beams add foreground parallax without crossing the exchange.
  polygon(ctx, [[vpX - 145, vpY], [vpX + 145, vpY], [1080, 1290], [0, 1290]], '#191B1F', '#66696F', 5);
  for (let i = 1; i <= 10; i++) {
    const q = i / 10, y = vpY + q * (1290 - vpY);
    ctx.fillStyle = i % 2 ? '#41444A' : '#65686E'; ctx.fillRect(0, Math.round(y / 4) * 4, W, i % 2 ? 3 : 5);
  }
  for (let i = -5; i <= 5; i++) {
    ctx.strokeStyle = i % 2 ? '#4A4D53' : '#777A80'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(vpX, vpY); ctx.lineTo(540 + i * 164, 1290); ctx.stroke();
  }
  const edgeTravel = (t * 330) % 360;
  for (const x of [32, 1004]) {
    for (let i = -1; i < 5; i++) {
      const y = Math.round((160 + i * 300 + edgeTravel) / 4) * 4;
      ctx.fillStyle = '#B9BBC0'; ctx.fillRect(x, y, 44, 10);
      ctx.fillStyle = '#4A4D53'; ctx.fillRect(x + 10, y + 10, 9, 74);
    }
  }
  ctx.fillStyle = '#BFC1C5'; ctx.fillRect(0, 1258, W, 8);
  ctx.fillStyle = '#34363B'; ctx.fillRect(0, 1266, W, 24);
}

function drawWindow(ctx: Frame['ctx'], x: number, y: number, w: number, h: number, opening = .8) {
  ctx.fillStyle = '#101215'; ctx.fillRect(x - w / 2 - 22, y - h / 2 - 20, w + 44, h + 40);
  ctx.fillStyle = '#62656B'; ctx.fillRect(x - w / 2 - 32, y - h / 2 - 24, w + 64, 17);
  ctx.fillStyle = '#9DA0A5'; ctx.fillRect(x - w / 2 - 32, y + h / 2 + 8, w + 64, 14);
  ctx.fillStyle = '#C8CACE'; ctx.fillRect(x - w / 2 - 32, y - h / 2 - 24, 14, h + 46);
  ctx.fillRect(x + w / 2 + 18, y - h / 2 - 24, 14, h + 46);
  ctx.fillStyle = '#08090B'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#2E3035'; ctx.fillRect(x - w / 2 + 12, y - h / 2 + 12, w - 24, h - 24);
  const shutterY = y - h / 2 - 2 + (1 - opening) * (h - 18);
  ctx.fillStyle = '#B8BABF'; ctx.fillRect(x - w / 2 + 8, shutterY, w - 16, 16);
  ctx.fillStyle = '#70737A';
  for (let i = 0; i < 9; i++) ctx.fillRect(x - w / 2 + 18 + i * ((w - 42) / 8), shutterY + 4, 4, 8);
  ctx.fillStyle = '#D8DADD'; ctx.fillRect(x - w / 2 - 34, y - h / 2 - 32, w + 68, 7);
}

function drawMechanicalPaw(ctx: Frame['ctx'], x: number, y: number, reach: number, t: number) {
  const elbowX = x + reach * .58, elbowY = y + 16 + Math.sin(t * 8) * 2;
  line(ctx, x, y, elbowX, elbowY, '#1B1D21', 38);
  line(ctx, x, y - 5, elbowX, elbowY - 5, '#AEB1B5', 25);
  ctx.fillStyle = '#3C3F44'; ctx.fillRect(elbowX - 24, elbowY - 18, 48, 34);
  ctx.fillStyle = '#D6D8DB'; ctx.fillRect(elbowX - 24, elbowY - 18, 48, 7);
  ctx.fillStyle = '#BFC2C6'; ctx.fillRect(elbowX + 8, elbowY - 23, 32, 16);
  ctx.fillRect(elbowX + 12, elbowY + 8, 34, 13);
  ctx.fillStyle = '#55585E'; ctx.fillRect(elbowX + 27, elbowY - 6, 20, 17);
}

function drawTicket(ctx: Frame['ctx'], x: number, y: number, width: number, rot: number, tear = 0) {
  drawTicket2D(ctx, x, y, width, { rot, tear });
}

function drawCash(ctx: Frame['ctx'], x: number, y: number, p: number, t: number) {
  if (p <= 0) return;
  const wobble = Math.sin(t * 18) * 5 * (1 - p);
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round((y + wobble) / 4) * 4);
  const reveal = ease.outBack(clamp(p));
  ctx.translate((1 - reveal) * 132, (1 - reveal) * 42);
  // A banded cash stack and a perforated receipt come out together, then settle in Hedgy's paw.
  ctx.fillStyle = '#090A0C'; ctx.fillRect(-104, -34, 160, 75);
  ctx.fillStyle = '#D5D7DA'; ctx.fillRect(-98, -30, 148, 64);
  ctx.fillStyle = '#8B8E94'; ctx.fillRect(-98, -30, 148, 8);
  ctx.fillStyle = '#55585E'; ctx.fillRect(-74, -6, 104, 25);
  ctx.strokeStyle = '#3C3F44'; ctx.lineWidth = 4; ctx.strokeRect(-88, -22, 128, 46);
  ctx.fillStyle = '#F1F2F3'; ctx.fillRect(-26, -18, 22, 23);
  pixelText(ctx, '$', -15, -17, 2, { color: '#292B30', align: 'center' });
  ctx.fillStyle = '#E9EAEC'; ctx.fillRect(62, -48, 98, 94);
  ctx.fillStyle = '#777A80'; ctx.fillRect(74, -34, 72, 7);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#96999F' : '#5C5F65'; ctx.fillRect(76, -14 + i * 14, 66 - i * 7, 4);
  }
  for (let i = 0; i < 7; i++) ctx.fillRect(62 + i * 16, 39, 8, 4);
  ctx.restore();
}

function drawReturnStub(ctx: Frame['ctx'], x: number, y: number, width: number, t: number, progress: number, pinned: number) {
  if (progress <= 0) return;
  const w = width, h = 62, rot = -.06 + Math.sin(t * 7) * .025 * (1 - pinned);
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4); ctx.rotate(rot);
  ctx.fillStyle = '#08090B'; ctx.fillRect(-w / 2 - 7, -h / 2 - 7, w + 14, h + 14);
  ctx.fillStyle = '#E7E8EA'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#676A70'; ctx.fillRect(-w / 2 + 7, -h / 2 + 6, w - 14, 6);
  ctx.fillStyle = '#1A1C20'; ctx.fillRect(-w / 2 + 7, -h / 2 + 16, w - 14, 38);
  pixelText(ctx, 'RETURN 1', 0, -h / 2 + 27, 2, { color: '#FFFFFF', align: 'center' });
  ctx.fillStyle = '#C5C7CB';
  for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 - 30 + i * 4, -h * .33, 2, h * .66);
  ctx.fillStyle = '#0C0D0F'; ctx.fillRect(w / 2 - 22, h / 2 - 11, 34, 19);
  ctx.fillStyle = '#D3D5D8'; ctx.fillRect(w / 2 - 18, h / 2 - 7, 26, 11);
  if (pinned > .05) {
    ctx.fillStyle = '#27292D'; ctx.fillRect(w / 2 - 18, h / 2 - 5, 27, 6);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(w / 2 - 7, h / 2 - 12, 6, 25);
  }
  ctx.restore();
}

export const shortSaleHandoffShot: ShotDef = {
  name: 'shortsalehandoff',
  describe: 'A lender hands Hedgy a ticket and clips on its tether; he feeds the ticket through a separate sale slot, catches the cash and receipt, then wears the RETURN 1 stub pinned to his wrist. The camera follows each exchange. Params: asset, salePortal, proceedsContainer, returnReceipt, syncEvents, cameraPath, depthLayers.',
  render(frame: Frame, props: ShotProps) {
    const dur = Math.max(.1, frame.dur), t = Math.max(0, frame.t), activeT = clamp(t, 0, dur), ctx = frame.ctx;
    const borrows = eventAt(props, ['borrows', 'borrow', 'loan'], .34, dur);
    const sells = eventAt(props, ['sells', 'sell', 'sale'], .46, dur);
    const owes = eventAt(props, ['owes', 'owe', 'return'], .61, dur);
    const portalT = ease.outCubic(clamp(activeT / .25));
    const handoffStart = Math.max(0, borrows - .38);
    const beforeLoan = activeT < handoffStart;
    const handoff = ease.outCubic(clamp((activeT - handoffStart) / .44));
    const saleOpen = ease.outCubic(clamp((activeT - sells + .13) / .19));
    const cashP = ease.outCubic(clamp((activeT - sells) / .42));
    const stubP = ease.outCubic(clamp((activeT - (owes - .32)) / .32));
    const pinned = ease.outBack(clamp((activeT - (owes - .035)) / .09));
    const tetherPulse = .68 + .32 * (0.5 + .5 * Math.sin((activeT - owes) * 15));

    const borrowToSale = Math.max(.08, sells - borrows);
    const saleToOwes = Math.max(.08, owes - sells);
    const afterBorrow = borrows + Math.min(.1, borrowToSale * .22);
    const beforeSale = sells - Math.min(.08, borrowToSale * .18);
    const afterSale = sells + Math.min(.1, saleToOwes * .18);
    const beforeOwes = Math.max(afterSale + .04, owes - Math.min(.12, saleToOwes * .25));

    const rig = createCameraRig({
      width: W, height: H, seed: frame.seed + 203, handheld: 1.1, punch: .045, shake: 4,
      hits: [borrows, sells, owes],
      keyframes: [
        { t: 0, x: 22, y: 4, zoom: .99, rot: -.001 },
        { t: Math.max(.02, borrows - .14), x: 42, y: -5, zoom: 1.01, rot: 0, ease: 'inOut' },
        { t: afterBorrow, x: 112, y: -12, zoom: 1.035, rot: -.002, ease: 'out' },
        { t: Math.max(afterBorrow + .035, beforeSale), x: -180, y: -16, zoom: 1.045, rot: .002, ease: 'inOut' },
        { t: afterSale, x: -188, y: -18, zoom: 1.05, rot: -.002, ease: 'out' },
        { t: beforeOwes, x: 14, y: -22, zoom: 1.05, rot: .002, ease: 'inOut' },
        { t: owes + .14, x: 18, y: -18, zoom: 1.05, rot: -.001, ease: 'out' },
        { t: Math.max(owes + .15, dur - .22), x: 8, y: -12, zoom: 1.045, rot: .001, ease: 'inOut' },
        { t: dur + .2, x: 8, y: -12, zoom: 1.045, rot: 0, ease: 'out' },
      ],
      whip: [
        { at: borrows, direction: 'left', duration: .14, amount: .035 },
        { at: sells, direction: 'left', duration: .16, amount: .055 },
        { at: owes, direction: 'right', duration: .14, amount: .04 },
      ],
    });
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); rig.apply(ctx, t);
    drawHall(frame, t);

    // Monumental mechanism with distinct lending and sale apertures.
    polygon(ctx, [[122, 342], [950, 342], [926, 963], [154, 963]], '#282A2F', '#A6A9AE', 9);
    polygon(ctx, [[162, 374], [910, 374], [886, 916], [190, 916]], '#3C3F45', '#686B71', 5);
    ctx.fillStyle = '#C2C4C8'; ctx.fillRect(140, 352, 804, 12);
    ctx.fillStyle = '#15171A'; ctx.fillRect(174, 390, 8, 516); ctx.fillRect(900, 390, 8, 516);
    // Lender counter at upper left.
    const lenderX = 330, lenderY = 548;
    drawWindow(ctx, lenderX, lenderY, 286, 144, beforeLoan ? .64 : .94);
    ctx.fillStyle = '#D0D2D5'; ctx.fillRect(lenderX - 192, lenderY + 98, 384, 10);
    ctx.fillStyle = '#5B5E64'; ctx.fillRect(lenderX - 168, lenderY + 108, 336, 20);
    // Sale counter and lower cash drawer at right.
    const saleX = 744, saleY = 690;
    drawWindow(ctx, saleX, saleY, 318, 128, saleOpen);
    ctx.fillStyle = '#C9CBCF'; ctx.fillRect(saleX - 194, saleY + 88, 388, 13);
    ctx.fillStyle = '#46494F'; ctx.fillRect(saleX - 160, saleY + 113, 320, 74);
    ctx.fillStyle = '#111316'; ctx.fillRect(saleX - 132, saleY + 121, 264, 48);
    ctx.fillStyle = '#B8BBC0'; ctx.fillRect(saleX - 152, saleY + 105, 304, 10);
    ctx.fillStyle = '#777A80'; ctx.fillRect(saleX - 122, saleY + 170, 244, 9);
    for (let i = 0; i < 11; i++) {
      ctx.fillStyle = i % 2 ? '#4A4D52' : '#999CA2'; ctx.fillRect(saleX - 118 + i * 23, saleY + 129, 4, 32);
    }

    const wristX = 520 + Math.sin(t * 2.2) * 2, wristY = 1040 + Math.sin(t * 5.2) * 2;
    const stubX = mix(saleX + 68, wristX, stubP), stubY = mix(saleY + 12, wristY, stubP);
    const pawTicketX = 518, pawTicketY = 1110;
    const loanTicketX = mix(lenderX + 22, pawTicketX, handoff);
    const loanTicketY = mix(lenderY - 8, pawTicketY, handoff);
    const saleTravel = ease.inOutCubic(clamp((activeT - afterBorrow) / Math.max(.1, beforeSale - afterBorrow)));
    let ticketX: number, ticketY: number, ticketRot: number, ticketSize: number;
    if (beforeLoan) {
      ticketX = lenderX + 4 + Math.sin(t * 6) * 2; ticketY = lenderY - 9; ticketRot = -.02; ticketSize = 252;
    } else if (activeT < afterBorrow) {
      ticketX = loanTicketX; ticketY = loanTicketY; ticketRot = mix(-.02, -.055, handoff); ticketSize = 252;
    } else if (activeT < sells) {
      ticketX = mix(pawTicketX, saleX - 8, saleTravel);
      ticketY = mix(pawTicketY, saleY - 6, saleTravel);
      ticketRot = mix(-.055, -.11, saleTravel) + Math.sin(t * 13) * .012; ticketSize = mix(252, 280, saleTravel);
    } else {
      const feed = ease.inOutCubic(clamp((activeT - sells) / .16));
      ticketX = mix(saleX - 8, saleX + 20, feed); ticketY = mix(saleY - 6, saleY + 6, feed);
      ticketRot = mix(-.11, .06, feed); ticketSize = mix(286, 54, feed);
    }

    // Loan origin, continuous tether, and perforation clip are drawn behind the ticket.
    const tetherSourceX = lenderX - 104, tetherSourceY = lenderY + 9;
    let tetherEndX = beforeLoan ? ticketX + ticketSize * .34 : activeT < sells ? ticketX + ticketSize * .34 : stubX - 116;
    let tetherEndY = beforeLoan ? ticketY : activeT < sells ? ticketY : stubY;
    ctx.save(); ctx.globalAlpha *= activeT < borrows ? .26 : 1;
    ctx.strokeStyle = '#F0F2F4'; ctx.lineWidth = activeT >= owes ? 14 : 9; ctx.beginPath();
    ctx.moveTo(tetherSourceX, tetherSourceY);
    if (activeT < sells) ctx.bezierCurveTo(lenderX + 90, lenderY + 74, ticketX - 130, ticketY - 70, tetherEndX, tetherEndY);
    else {
      ctx.bezierCurveTo(lenderX + 154, lenderY + 88, saleX - 200, saleY - 114, saleX - 16, saleY - 8);
      ctx.bezierCurveTo(saleX + 132, saleY + 94, stubX - 154, stubY - 130, tetherEndX, tetherEndY);
    }
    ctx.stroke(); ctx.restore();
    ctx.strokeStyle = activeT >= owes ? '#FFFFFF' : '#C8CACE'; ctx.lineWidth = activeT >= owes ? 4 + tetherPulse * 2 : 3;
    ctx.beginPath(); ctx.moveTo(tetherSourceX, tetherSourceY);
    if (activeT < sells) ctx.bezierCurveTo(lenderX + 90, lenderY + 74, ticketX - 130, ticketY - 70, tetherEndX, tetherEndY);
    else {
      ctx.bezierCurveTo(lenderX + 154, lenderY + 88, saleX - 200, saleY - 114, saleX - 16, saleY - 8);
      ctx.bezierCurveTo(saleX + 132, saleY + 94, stubX - 154, stubY - 130, tetherEndX, tetherEndY);
    }
    ctx.stroke();
    ctx.fillStyle = '#E8EAEC'; ctx.fillRect(tetherSourceX - 5, tetherSourceY - 6, 12, 12);

    // Lender's mechanical hand extends with the paper, then retracts as Hedgy takes it.
    const lenderReach = beforeLoan ? 64 : mix(64, -8, handoff);
    drawMechanicalPaw(ctx, lenderX - 142, lenderY - 10, lenderReach, t);
    if (beforeLoan) {
      ctx.save(); ctx.beginPath(); ctx.rect(lenderX - 140, lenderY - 58, 280, 118); ctx.clip();
      drawTicket(ctx, ticketX, ticketY, ticketSize, ticketRot);
      ctx.restore();
    }

    const hedgyX = 690 + Math.sin(t * 1.6) * 3, hedgyY = 1175 + Math.sin(t * 5.3) * 2;
    const heroPose = activeT < handoffStart ? 'think' : activeT < handoffStart + .35 ? 'jump' : activeT < sells - .04 ? 'carry' : activeT < sells + .18 ? 'push' : activeT < owes - .05 ? 'carry' : 'shock';
    const facing: 1 | -1 = activeT < sells - .08 ? -1 : 1;
    const expression = activeT < borrows ? 'worried' : activeT < sells ? 'determined' : activeT < owes ? 'smug' : 'shocked';
    ctx.fillStyle = '#0B0C0E'; ctx.fillRect(hedgyX - 206, hedgyY + 6, 412, 18);
    ctx.fillStyle = '#4C4F55'; ctx.fillRect(hedgyX - 151, hedgyY + 10, 302, 7);
    drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 6, t: Math.max(0, activeT - handoffStart), pose: heroPose, facing,
      look: activeT < borrows ? 'up' : activeT < owes ? 'forward' : 'down', expression });

    if (!beforeLoan && activeT < sells + .17) {
      const tear = clamp((activeT - sells + .07) / .19);
      drawTicket(ctx, ticketX, ticketY, ticketSize, ticketRot, tear);
      if (activeT < sells) {
        const clipX = ticketX + ticketSize * .34, clipY = ticketY;
        ctx.fillStyle = '#101215'; ctx.fillRect(clipX - 9, clipY - 12, 19, 25);
        ctx.fillStyle = '#F1F2F3'; ctx.fillRect(clipX - 4, clipY - 8, 8, 17);
        if (activeT >= borrows - .04 && activeT <= borrows + .13) {
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4; ctx.beginPath();
          ctx.moveTo(clipX - 26, clipY - 28); ctx.lineTo(clipX, clipY - 44); ctx.lineTo(clipX + 25, clipY - 25); ctx.stroke();
        }
      }
    }
    if (!beforeLoan && activeT < borrows + .12) {
      // The near paw crosses the tether clip, completing the lender-to-Hedgy handoff.
      drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 6, t: Math.max(0, activeT - handoffStart), pose: heroPose,
        facing, look: activeT < borrows ? 'up' : 'forward', expression });
    }
    // The payout exits its own drawer and reaches Hedgy's open paw on the sale beat.
    const cashX = mix(saleX + 22, 590, cashP), cashY = mix(saleY + 164, 917, cashP);
    drawCash(ctx, cashX, cashY, cashP, t);
    if (activeT >= sells + .18 && activeT < owes - .05) {
      drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 6, t: Math.max(0, activeT - handoffStart), pose: 'carry',
        facing: 1, look: 'forward', expression: 'smug' });
    }

    // The perforated RETURN 1 half travels back from the sale slot and pins to Hedgy's wrist on “owes”.
    if (activeT >= owes - .22) {
      drawReturnStub(ctx, stubX, stubY, 162, t, stubP, pinned);
      if (pinned > .5) {
        ctx.fillStyle = '#F5F6F7'; ctx.fillRect(wristX - 8, wristY - 12, 8, 30);
        ctx.fillStyle = '#4F5258'; ctx.fillRect(wristX, wristY - 12, 9, 30);
      }
    }

    // Action accents are brief; the continuing camera path and cable pulse carry the final beat.
    if (!beforeLoan && activeT < borrows + .18) {
      drawSpeedLines(ctx, t, { center: { x: loanTicketX, y: loanTicketY }, count: 12, reach: 230,
        start: borrows, duration: .18, color: '#E2E4E7', seed: frame.seed + 44, strength: .45 });
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(lenderX + 145, lenderY - 24); ctx.lineTo(lenderX + 170, lenderY - 48); ctx.lineTo(lenderX + 192, lenderY - 20); ctx.stroke();
    }
    drawBurst(ctx, t, { center: [saleX, saleY, 0], projector: point => ({ x: point[0], y: point[1], scale: 1 }),
      seed: frame.seed + 61, count: 12, kind: 'confetti', start: sells, life: .48, speed: 148, gravity: 260,
      drag: .48, floor: 1230, bounce: .08, spin: 3, size: 2, color: '#D5D7DA' });
    drawMotionStreak(ctx, { x: cashX - 86, y: cashY - 16, dx: -1, dy: .2, length: 112, width: 4,
      alpha: .38 * (1 - clamp(cashP)), color: '#D9DBDE' });
    if (activeT < .25) {
      const portalWidth = mix(1740, 0, portalT);
      drawTicket(ctx, 510, 820 - activeT * 46, portalWidth, -.01 + activeT * .12);
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const borrows = eventAt(props, ['borrows', 'borrow', 'loan'], .34, dur);
    const sells = eventAt(props, ['sells', 'sell', 'sale'], .46, dur);
    const owes = eventAt(props, ['owes', 'owe', 'return'], .61, dur);
    const cues: Cue[] = [
      { t: borrows, kind: 'paper', gain: 1.2, pan: -.38, len: .12 },
      { t: sells, kind: 'paper', gain: 1.5, pan: .4, len: .16 },
      { t: owes, kind: 'clack', gain: 1.3, pan: -.12, len: .11 },
    ];
    return cues.filter(cue => Number.isFinite(cue.t) && cue.t <= dur);
  },
};
