import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { buildingAt, canMoveBuilding, moveBuilding, placeBuilding, placePaths } from '../src/sim/building';
import { trackTiles, type TrackType } from '../src/sim/coaster';
import { appendPiece, trackOccupancy } from '../src/sim/trackedit';
import { World } from '../src/sim/world';
import { ToolController } from '../src/input/tools';

const carousel = getDef('carousel'); // 2x2

describe('moveBuilding', () => {
  it('relocates for free, frees old tiles and updates the entrance', () => {
    const w = new World();
    const b = placeBuilding(w, carousel, 5, 5, 0)!;
    const money = w.money;
    expect(moveBuilding(w, b, 10, 10, 1)).toBe(true);
    expect(w.money).toBe(money);
    expect(buildingAt(w, 5, 5)).toBeNull();
    expect(buildingAt(w, 11, 11)?.id).toBe(b.id);
    expect(b.rot).toBe(1);
    expect(b.entrance).toEqual({ x: 12, y: 11 });
  });

  it('can shift onto tiles it already covers', () => {
    const w = new World();
    const b = placeBuilding(w, carousel, 5, 5, 0)!;
    expect(canMoveBuilding(w, b, 6, 5, 0).ok).toBe(true);
    expect(moveBuilding(w, b, 6, 5, 0)).toBe(true);
    expect(buildingAt(w, 5, 5)).toBeNull();
    expect(buildingAt(w, 7, 6)?.id).toBe(b.id);
  });

  it('refuses spots blocked by another building and works even when broke', () => {
    const w = new World();
    const a = placeBuilding(w, carousel, 5, 5, 0)!;
    placeBuilding(w, carousel, 10, 5, 0);
    expect(canMoveBuilding(w, a, 9, 5, 0)).toEqual({ ok: false, reason: 'occupied' });
    w.money = 0;
    expect(moveBuilding(w, a, 5, 10, 0)).toBe(true);
  });

  it('move tool picks up and drops a building', () => {
    const w = new World();
    const b = placeBuilding(w, carousel, 5, 5, 0)!;
    const t = new ToolController(w);
    t.beginMove(b.id);
    expect(t.tool.kind).toBe('move');
    expect(t.preview({ x: 15, y: 15 })?.ghost?.defId).toBe('carousel');
    t.onDown({ x: 15, y: 15 });
    expect(t.tool.kind).toBe('none');
    expect(buildingAt(w, 15, 15)?.id).toBe(b.id);
    expect(t.selectedId).toBe(b.id);
  });
});

const CODE: Record<string, TrackType> = { S: 'straight', L: 'left', R: 'right', C: 'lift', D: 'down' };
function coaster(w: World, x: number, y: number, rot: number, code = 'SLSLSSSSSLSLS') {
  w.money = 50_000;
  const b = placeBuilding(w, getDef('coaster'), x, y, rot)!;
  for (const ch of code) expect(appendPiece(w, b, CODE[ch]).ok).toBe(true);
  expect(b.track!.ok).toBe(true);
  return b;
}

describe('moving a roller coaster', () => {
  it('carries the whole track along, freeing the old tiles', () => {
    const w = new World();
    const b = coaster(w, 10, 10, 0);
    const old = trackTiles(b);
    const stats = b.track!.stats;
    expect(moveBuilding(w, b, 30, 30, 0)).toBe(true);
    for (const t of old) expect(buildingAt(w, t.x, t.y)).toBeNull();
    expect(trackTiles(b)).toEqual(old.map((t) => ({ x: t.x + 20, y: t.y + 20 })));
    for (const t of trackTiles(b)) expect(buildingAt(w, t.x, t.y)?.id).toBe(b.id);
    expect(b.track!.ok).toBe(true);
    expect(b.track!.stats).toEqual(stats);
  });

  it('rotates the track with the station', () => {
    const w = new World();
    const b = coaster(w, 10, 10, 0, 'CCCLDDDLSSSSSSSLSSSLS');
    expect(moveBuilding(w, b, 30, 30, 1)).toBe(true);
    expect(b.track!.ok).toBe(true);
    expect(trackOccupancy(w).size).toBe(trackTiles(b).length);
  });

  it('refuses when the moved track would hit a building or a path', () => {
    const w = new World();
    const b = coaster(w, 10, 10, 0);
    const shifted = trackTiles(b).map((t) => ({ x: t.x + 20, y: t.y + 20 }));
    const toilet = placeBuilding(w, getDef('toilet'), shifted[4].x, shifted[4].y, 0)!;
    expect(canMoveBuilding(w, b, 30, 30, 0).ok).toBe(false);
    expect(moveBuilding(w, b, 30, 30, 0)).toBe(false);
    expect(buildingAt(w, 11, 10)?.id).toBe(b.id); // 실패하면 제자리 그대로
    moveBuilding(w, toilet, 2, 2, 0);
    expect(canMoveBuilding(w, b, 30, 30, 0).ok).toBe(true);
    placePaths(w, [shifted[0]]);
    expect(canMoveBuilding(w, b, 30, 30, 0)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('can shift over its own old track', () => {
    const w = new World();
    const b = coaster(w, 10, 10, 0);
    expect(moveBuilding(w, b, 11, 10, 0)).toBe(true);
    expect(b.track!.ok).toBe(true);
  });
});
