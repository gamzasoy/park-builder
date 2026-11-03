import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { FLOWERS, OAK, PINE, SCENERY } from '../src/data/scenery';
import {
  demolishAt, isSceneryPlaceable, lineTiles, placeBuilding, placePaths, placeScenery,
} from '../src/sim/building';
import { createGuest, nearScenery, SCENERY_EVERY, updateGuest } from '../src/sim/guest';
import { TileMap } from '../src/sim/map';
import { parseSave, serializeWorld } from '../src/save/save';
import { World } from '../src/sim/world';

const pine = SCENERY.find((d) => d.kind === PINE)!;
const flowers = SCENERY.find((d) => d.kind === FLOWERS)!;

describe('natural trees', () => {
  it('are placed deterministically along the back and side edges, never near the gate', () => {
    const a = new TileMap();
    const b = new TileMap();
    expect(Array.from(a.scenery)).toEqual(Array.from(b.scenery));
    let count = 0;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const k = a.sceneryAt(x, y);
        if (!k) continue;
        count++;
        expect([PINE, OAK]).toContain(k);
        expect(Math.min(x, y, a.width - 1 - x)).toBeLessThanOrEqual(2);
        expect(y).toBeLessThan(a.height - 8);
      }
    }
    expect(count).toBeGreaterThan(30);
    expect(a.sceneryAt(a.gate.x, a.gate.y)).toBe(0);
  });
});

describe('placing scenery', () => {
  it('plants a dragged line on empty grass and charges per tile', () => {
    const w = new World();
    const money = w.money;
    const r = placeScenery(w, lineTiles({ x: 10, y: 20 }, { x: 14, y: 20 }), flowers);
    expect(r).toEqual({ placed: 5, short: false });
    expect(w.money).toBe(money - 5 * flowers.cost);
    expect(w.ledger.construction).toBe(-5 * flowers.cost);
    for (let x = 10; x <= 14; x++) expect(w.map.sceneryAt(x, 20)).toBe(FLOWERS);
  });

  it('skips paths, buildings and existing scenery, and stops when money runs out', () => {
    const w = new World();
    placePaths(w, [{ x: 11, y: 20 }]);
    placeBuilding(w, getDef('burger'), 12, 20, 0);
    placeScenery(w, [{ x: 13, y: 20 }], pine);
    expect(isSceneryPlaceable(w, 11, 20)).toBe(false);
    expect(isSceneryPlaceable(w, 12, 20)).toBe(false);
    expect(isSceneryPlaceable(w, 13, 20)).toBe(false);
    expect(placeScenery(w, lineTiles({ x: 10, y: 20 }, { x: 14, y: 20 }), pine).placed).toBe(2);

    w.money = pine.cost;
    expect(placeScenery(w, lineTiles({ x: 10, y: 22 }, { x: 14, y: 22 }), pine)).toEqual({ placed: 1, short: true });
  });

  it('is cleared for free when a path, building or coaster track is built over it', () => {
    const w = new World();
    placeScenery(w, lineTiles({ x: 10, y: 20 }, { x: 14, y: 20 }), pine);
    placePaths(w, [{ x: 10, y: 20 }]);
    expect(w.map.sceneryAt(10, 20)).toBe(0);
    placeBuilding(w, getDef('carousel'), 12, 20, 0);
    expect(w.map.sceneryAt(12, 20)).toBe(0);
    expect(w.map.sceneryAt(13, 20)).toBe(0);
    expect(w.map.sceneryAt(14, 20)).toBe(PINE);
  });

  it('can be demolished without refund', () => {
    const w = new World();
    placeScenery(w, [{ x: 10, y: 20 }], pine);
    const money = w.money;
    expect(demolishAt(w, 10, 20)).toBe(0);
    expect(w.map.sceneryAt(10, 20)).toBe(0);
    expect(w.money).toBe(money);
    expect(demolishAt(w, 10, 20)).toBeNull();
  });
});

describe('scenery and guests', () => {
  it('walking next to scenery slowly raises happiness', () => {
    const run = (withTrees: boolean): number => {
      const w = new World();
      const g = w.map.gate;
      placePaths(w, lineTiles(g, { x: g.x, y: g.y - 10 }));
      if (withTrees) placeScenery(w, lineTiles({ x: g.x - 1, y: g.y - 10 }, { x: g.x - 1, y: g.y - 1 }), pine);
      const guest = createGuest(w);
      guest.state = 'walking';
      guest.tile = { x: g.x, y: g.y - 4 };
      guest.needs.happiness = 50;
      // 걷기 로직은 건너뛰고 경치 보너스만 보도록 목표 없이 상태를 고정한다
      for (let i = 0; i < SCENERY_EVERY * 4; i++) {
        w.tick++;
        updateGuest(w, guest);
        guest.state = 'walking';
        guest.tile = { x: g.x, y: g.y - 4 };
      }
      return guest.needs.happiness;
    };
    const w = new World();
    placeScenery(w, [{ x: 20, y: 20 }], pine);
    expect(nearScenery(w, { x: 21, y: 21 })).toBe(true);
    expect(nearScenery(w, { x: 22, y: 20 })).toBe(false);
    expect(run(true)).toBeGreaterThan(run(false));
  });
});

describe('saving scenery', () => {
  it('round-trips the scenery layer', () => {
    const w = new World();
    placeScenery(w, lineTiles({ x: 10, y: 20 }, { x: 14, y: 20 }), flowers);
    demolishAt(w, 0, 0); // 기본 숲 일부를 치워도 그대로 저장돼야 한다
    const r = parseSave(JSON.stringify(serializeWorld(w)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.world.map.scenery)).toEqual(Array.from(w.map.scenery));
  });

  it('loads a v2 save (no scenery) with the default forest, cleared under paths and buildings', () => {
    const w = new World();
    // 기본 숲이 있는 칸에 길과 건물을 놓은 v2 저장본을 흉내 낸다
    const tree = Array.from(w.map.scenery).findIndex((k) => k !== 0);
    const tx = tree % w.map.width;
    const ty = Math.floor(tree / w.map.width);
    placePaths(w, [{ x: tx, y: ty }]);
    const data = serializeWorld(w);
    const { scenery: _s, ...v2 } = { ...data, version: 2 };
    const r = parseSave(JSON.stringify(v2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.world.map.isPath(tx, ty)).toBe(true);
    expect(r.world.map.sceneryAt(tx, ty)).toBe(0);
    expect(Array.from(r.world.map.scenery).filter((k) => k).length).toBeGreaterThan(30);
  });

  it('rejects a scenery layer of the wrong size', () => {
    const data = serializeWorld(new World());
    expect(parseSave(JSON.stringify({ ...data, scenery: '0' }))).toEqual({ ok: false, reason: 'corrupt' });
  });
});
