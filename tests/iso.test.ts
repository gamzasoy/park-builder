import { describe, expect, it } from 'vitest';
import { tileToWorld, worldToTile } from '../src/render/iso';
import { Camera } from '../src/render/camera';

describe('iso', () => {
  it('maps tile origin and axes', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToWorld(1, 0)).toEqual({ x: 32, y: 16 });
    expect(tileToWorld(0, 1)).toEqual({ x: -32, y: 16 });
  });
  it('round-trips tile -> world -> tile', () => {
    for (const [x, y] of [[0, 0], [5, 3], [47, 47], [12.5, 7.25]]) {
      const w = tileToWorld(x, y);
      const t = worldToTile(w.x, w.y);
      expect(t.x).toBeCloseTo(x);
      expect(t.y).toBeCloseTo(y);
    }
  });
  it('picks the tile for a point inside its diamond', () => {
    // 타일 (3,2)의 마름모 중심 = 위쪽 꼭짓점 + (0, TILE_H/2)
    const top = tileToWorld(3, 2);
    const t = worldToTile(top.x, top.y + 16);
    expect([Math.floor(t.x), Math.floor(t.y)]).toEqual([3, 2]);
  });
});

describe('Camera', () => {
  it('screen/world round-trip', () => {
    const c = new Camera(800, 600);
    c.x = 100; c.y = -50; c.zoom = 1.7;
    const s = c.worldToScreen(240, 30);
    const w = c.screenToWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(240);
    expect(w.y).toBeCloseTo(30);
  });
  it('zoomAt keeps the world point under the cursor fixed', () => {
    const c = new Camera(800, 600);
    const before = c.screenToWorld(123, 456);
    c.zoomAt(123, 456, 1.5);
    const after = c.screenToWorld(123, 456);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(c.zoom).toBeCloseTo(1.5);
  });
  it('clamps zoom', () => {
    const c = new Camera();
    c.zoomAt(0, 0, 1000);
    expect(c.zoom).toBe(2.5);
    c.zoomAt(0, 0, 1e-6);
    expect(c.zoom).toBe(0.4);
  });
});
