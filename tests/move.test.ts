import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { buildingAt, canMoveBuilding, moveBuilding, placeBuilding } from '../src/sim/building';
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
