import { describe, expect, it } from 'vitest';
import { placeTip, TIP, type Rect } from './place-tip';

const phone = { width: 360, height: 640 };
/** A 24 px ⓘ with its top-left corner at (x, y). */
const icon = (x: number, y: number): Rect => ({ left: x, right: x + 24, top: y, bottom: y + 24 });

describe('placeTip', () => {
  it('sits centred under an ⓘ in the middle of the screen', () => {
    const p = placeTip(icon(168, 200), phone);
    expect(p.side).toBe('below');
    expect(p.width).toBe(TIP.maxWidth);
    expect(p.top).toBe(224 + TIP.gap);
    expect(p.bottom).toBeNull();
    expect(p.left + p.width / 2).toBe(180);
    expect(p.caretX).toBe(p.width / 2);
  });

  it('stays 16 px inside either side of the screen', () => {
    for (const x of [0, 4, 30, 300, 336]) {
      const p = placeTip(icon(x, 200), phone);
      expect(p.left).toBeGreaterThanOrEqual(TIP.edge);
      expect(p.left + p.width).toBeLessThanOrEqual(phone.width - TIP.edge);
    }
  });

  it('narrows on a narrow screen rather than running off it', () => {
    const p = placeTip(icon(140, 200), { width: 280, height: 640 });
    expect(p.width).toBe(280 - 2 * TIP.edge);
    expect(p.left).toBe(TIP.edge);
  });

  it('keeps the caret on the tip, and under the ⓘ where it can', () => {
    // Near the right edge the tip is held in, so the caret moves along it to
    // stay under the ⓘ's centre.
    const near = placeTip(icon(300, 200), phone);
    expect(near.left + near.caretX).toBe(312);
    // Right at the edge it stops short of the tip's corner, still over the ⓘ.
    const atEdge = placeTip(icon(330, 200), phone);
    expect(atEdge.caretX).toBe(atEdge.width - TIP.caret);
    expect(atEdge.left + atEdge.caretX).toBeGreaterThanOrEqual(330);
    expect(atEdge.left + atEdge.caretX).toBeLessThanOrEqual(354);
    const farLeft = placeTip(icon(0, 200), phone);
    expect(farLeft.caretX).toBe(TIP.caret);
  });

  it('opens above an ⓘ near the bottom, measured from the bottom edge', () => {
    const p = placeTip(icon(168, 580), phone);
    expect(p.side).toBe('above');
    expect(p.top).toBeNull();
    expect(p.bottom).toBe(640 - 580 + TIP.gap);
    expect(p.maxHeight).toBe(580 - TIP.gap - TIP.edgeY);
  });

  it('takes enough room below even when there is more above', () => {
    // 640 - 8 - (424 + 8) = 200 below, 392 above: below still wins.
    expect(placeTip(icon(168, 400), phone).side).toBe('below');
  });

  it('keeps the side it opened on while it follows a scroll', () => {
    expect(placeTip(icon(168, 580), phone, undefined, 'below').side).toBe('below');
    expect(placeTip(icon(168, 20), phone, undefined, 'above').side).toBe('above');
  });

  it('is never taller than the room it has, notch and home bar included', () => {
    const insets = { top: 47, bottom: 34 };
    for (const y of [60, 200, 400, 560]) {
      const p = placeTip(icon(168, y), phone, insets);
      if (p.side === 'below') {
        expect(p.top! + p.maxHeight).toBeLessThanOrEqual(phone.height - insets.bottom - TIP.edgeY);
      } else {
        const topEdge = phone.height - p.bottom! - p.maxHeight;
        expect(topEdge).toBeGreaterThanOrEqual(insets.top + TIP.edgeY);
      }
      expect(p.maxHeight).toBeGreaterThanOrEqual(0);
    }
  });

  it('never gives a negative height when the ⓘ is off the screen', () => {
    expect(placeTip(icon(168, 700), phone, undefined, 'below').maxHeight).toBe(0);
  });
});
