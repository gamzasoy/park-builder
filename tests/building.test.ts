import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import {
  anchorFor, buildingAt, canPlaceBuilding, demolishAt, dims, entranceOf, footprintAt,
  lineTiles, PATH_COST, placeBuilding, placePaths,
} from '../src/sim/building';
import { START_MONEY, World } from '../src/sim/world';

const carousel = getDef('carousel'); // 2x2, 1500
const toilet = getDef('toilet'); // 2x1, 250

describe('geometry', () => {
  it('swaps dims on odd rotation', () => {
    expect(dims(toilet, 0)).toEqual({ w: 2, h: 1 });
    expect(dims(toilet, 1)).toEqual({ w: 1, h: 2 });
    expect(dims(toilet, 2)).toEqual({ w: 2, h: 1 });
  });
  it('puts the entrance on the rotated front edge', () => {
    const f = footprintAt(getDef('wheel'), 10, 10, 0); // 3x3
    expect(entranceOf(f, 0)).toEqual({ x: 11, y: 13 });
    expect(entranceOf(f, 1)).toEqual({ x: 13, y: 11 });
    expect(entranceOf(f, 2)).toEqual({ x: 11, y: 9 });
    expect(entranceOf(f, 3)).toEqual({ x: 9, y: 11 });
  });
  it('anchors so the cursor is near the footprint center', () => {
    expect(anchorFor(getDef('wheel'), 0, { x: 10, y: 10 })).toEqual({ x: 9, y: 9 });
    expect(anchorFor(carousel, 0, { x: 10, y: 10 })).toEqual({ x: 9, y: 9 });
  });
});

describe('placeBuilding', () => {
  it('places, occupies tiles and deducts cost', () => {
    const w = new World();
    const b = placeBuilding(w, carousel, 5, 5, 0)!;
    expect(b).not.toBeNull();
    expect(w.money).toBe(START_MONEY - 1500);
    expect(buildingAt(w, 6, 6)?.id).toBe(b.id);
    expect(buildingAt(w, 7, 5)).toBeNull();
    expect(b.entrance).toEqual({ x: 6, y: 7 });
  });
  it('rejects out of bounds, overlap, paths and insufficient money', () => {
    const w = new World();
    expect(canPlaceBuilding(w, carousel, -1, 0, 0)).toEqual({ ok: false, reason: 'bounds' });
    expect(canPlaceBuilding(w, carousel, 47, 47, 0)).toEqual({ ok: false, reason: 'bounds' });
    placeBuilding(w, carousel, 5, 5, 0);
    expect(canPlaceBuilding(w, carousel, 6, 6, 0)).toEqual({ ok: false, reason: 'occupied' });
    placePaths(w, [{ x: 20, y: 20 }]);
    expect(canPlaceBuilding(w, carousel, 19, 19, 0)).toEqual({ ok: false, reason: 'path' });
    w.money = 100;
    expect(canPlaceBuilding(w, carousel, 30, 30, 0)).toEqual({ ok: false, reason: 'money' });
    expect(placeBuilding(w, carousel, 30, 30, 0)).toBeNull();
    expect(w.money).toBe(100);
  });
});

describe('paths', () => {
  it('draws straight lines along the dominant axis, inclusive, either direction', () => {
    expect(lineTiles({ x: 2, y: 3 }, { x: 5, y: 4 })).toEqual([
      { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
    ]);
    expect(lineTiles({ x: 2, y: 5 }, { x: 3, y: 3 })).toEqual([
      { x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 },
    ]);
    expect(lineTiles({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
  });
  it('charges per new tile and skips existing paths', () => {
    const w = new World();
    const line = lineTiles(w.map.gate, { x: w.map.gate.x, y: w.map.gate.y - 4 }); // gate + 4
    const r = placePaths(w, line);
    expect(r).toEqual({ placed: 4, short: false });
    expect(w.money).toBe(START_MONEY - 4 * PATH_COST);
  });
  it('stops when money runs out', () => {
    const w = new World();
    w.money = PATH_COST * 2 + 3;
    const r = placePaths(w, lineTiles({ x: 0, y: 0 }, { x: 9, y: 0 }));
    expect(r).toEqual({ placed: 2, short: true });
    expect(w.money).toBe(3);
  });
  it('cannot place a path on a building', () => {
    const w = new World();
    placeBuilding(w, carousel, 5, 5, 0);
    expect(placePaths(w, [{ x: 5, y: 5 }]).placed).toBe(0);
  });
});

describe('demolishAt', () => {
  it('removes a building, frees tiles and refunds half', () => {
    const w = new World();
    placeBuilding(w, carousel, 5, 5, 0);
    const before = w.money;
    expect(demolishAt(w, 6, 6)).toBe(750);
    expect(w.money).toBe(before + 750);
    expect(w.buildings.size).toBe(0);
    expect(buildingAt(w, 5, 5)).toBeNull();
    expect(canPlaceBuilding(w, carousel, 5, 5, 0).ok).toBe(true);
  });
  it('removes a path but never the gate', () => {
    const w = new World();
    placePaths(w, [{ x: 3, y: 3 }]);
    expect(demolishAt(w, 3, 3)).toBe(5);
    expect(w.map.isPath(3, 3)).toBe(false);
    expect(demolishAt(w, w.map.gate.x, w.map.gate.y)).toBeNull();
    expect(w.map.isPath(w.map.gate.x, w.map.gate.y)).toBe(true);
  });
  it('returns null on empty ground', () => {
    expect(demolishAt(new World(), 1, 1)).toBeNull();
  });
});
