import { describe, expect, it } from 'vitest';
import { getDef, RIDES } from '../src/data';
import { canPlaceBuilding, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { createGuest, pickTarget, thrillTolerance, type Guest } from '../src/sim/guest';
import { drawRideSprite } from '../src/render/sprites';
import { World } from '../src/sim/world';

/** 캔버스 호출을 모두 받아 주는 가짜 2D 컨텍스트 */
function fakeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

/** 입구 위 길 왼쪽에 회전목마, 오른쪽에 드롭타워 */
function thrillPark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 10 }));
  const gentle = placeBuilding(w, getDef('carousel'), g.x - 2, g.y - 6, 1)!;
  const scary = placeBuilding(w, getDef('drop'), g.x + 1, g.y - 6, 3)!;
  return { w, gentle, scary };
}

function guestWithTolerance(w: World, pred: (t: number) => boolean): Guest {
  for (;;) {
    const g = createGuest(w);
    if (pred(thrillTolerance(g))) return g;
  }
}

describe('ride roster', () => {
  it('has many distinct rides, each with its own sprite and thrill stats', () => {
    expect(RIDES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(RIDES.map((d) => d.id)).size).toBe(RIDES.length);
    const ctx = fakeCtx();
    for (const d of RIDES) {
      for (const running of [false, true]) {
        const q = { top: { x: 0, y: 0 }, right: { x: 64, y: 32 }, bottom: { x: 0, y: 64 }, left: { x: -64, y: 32 } };
        expect(drawRideSprite(ctx, d.id, q, { z: 1, time: 123, running, color: d.color, rot: 0 }, d.w, d.h)).toBe(true);
      }
      if (!d.coaster) {
        expect(d.intensity, d.id).toBeTypeOf('number');
        expect(d.nausea, d.id).toBeTypeOf('number');
      }
    }
  });

  it('places every new ride in all rotations', () => {
    for (const id of ['teacups', 'swing', 'viking', 'haunted', 'slide']) {
      for (let rot = 0; rot < 4; rot++) {
        const w = new World();
        const g = w.map.gate;
        placePaths(w, lineTiles(g, { x: g.x, y: g.y - 10 }));
        expect(canPlaceBuilding(w, getDef(id), g.x + 1, g.y - 7, rot).ok, `${id} rot ${rot}`).toBe(true);
      }
    }
  });

  it('only the haunted house and drop tower stay pleasant in the rain', () => {
    const indoor = RIDES.filter((d) => !d.outdoor).map((d) => d.id).sort();
    expect(indoor).toEqual(['drop', 'haunted']);
  });
});

describe('thrill tolerance', () => {
  it('is fixed per guest and spread across 35~90', () => {
    const w = new World();
    const ts = Array.from({ length: 300 }, () => thrillTolerance(createGuest(w)));
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(35);
    expect(Math.max(...ts)).toBeLessThanOrEqual(90);
    expect(new Set(ts).size).toBeGreaterThan(30);
    const g = createGuest(w);
    expect(thrillTolerance(g)).toBe(thrillTolerance(g));
  });

  it('timid guests pick the gentle ride, brave guests the scary one', () => {
    const { w, gentle, scary } = thrillPark();
    const count = (pred: (t: number) => boolean) => {
      let g = 0, s = 0;
      for (let i = 0; i < 60; i++) {
        const guest = guestWithTolerance(w, pred);
        guest.money = 200;
        guest.tile = { ...w.map.gate };
        const pick = pickTarget(w, guest)?.b.id;
        if (pick === gentle.id) g++;
        if (pick === scary.id) s++;
      }
      return { g, s };
    };
    const timid = count((t) => t < 45);
    const brave = count((t) => t >= 80);
    expect(timid.g).toBeGreaterThan(timid.s);
    expect(brave.s).toBeGreaterThan(brave.g);
  });

  it('tired guests avoid the spinning teacups', () => {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 10 }));
    const cups = placeBuilding(w, getDef('teacups'), g.x + 1, g.y - 6, 3)!;
    const carousel = placeBuilding(w, getDef('carousel'), g.x - 2, g.y - 6, 1)!;
    let cupsFresh = 0, cupsTired = 0;
    for (let i = 0; i < 80; i++) {
      for (const energy of [100, 30]) {
        const guest = guestWithTolerance(w, (t) => t > 60);
        guest.money = 200;
        guest.needs.energy = energy;
        const pick = pickTarget(w, guest)?.b.id;
        if (pick === cups.id) energy === 100 ? cupsFresh++ : cupsTired++;
      }
    }
    expect(carousel.id).toBeDefined();
    expect(cupsTired).toBeLessThan(cupsFresh);
  });
});
