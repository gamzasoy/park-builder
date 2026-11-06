import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { dailyWages, settleDay, WAGE } from '../src/sim/economy';
import { createGuest, type Guest } from '../src/sim/guest';
import {
  CHEER_EVERY, CHEER_PATIENCE, hireStaff, SHOW_TICKS, STAFF_KINDS, updateStaff, VENDOR_PRICE, VENDOR_QUENCH, type Staff,
} from '../src/sim/staff';
import { World } from '../src/sim/world';

/** 입구에서 위로 뻗은 길(y 47..39) + 햄버거 가게(입구 (g.x, 43)) */
function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!;
  return { w, g, shop };
}

/** 길 위에 가만히 서 있는 손님. 손님은 스텝하지 않고 직원만 돌린다. */
function standingGuest(w: World, x: number, y: number, tweak?: (g: Guest) => void): Guest {
  const g = createGuest(w);
  g.x = g.px = x + 0.5;
  g.y = g.py = y + 0.5;
  g.tile = { x, y };
  g.needs = { happiness: 60, hunger: 0, thirst: 0, toilet: 0, energy: 100 };
  g.money = 50;
  tweak?.(g);
  w.guests.push(g);
  return g;
}

/** 직원만 n틱 진행 */
function run(w: World, s: Staff, n: number, until?: () => boolean): void {
  for (let i = 0; i < n && !until?.(); i++) {
    w.tick++;
    updateStaff(w, s);
  }
}

describe('entertainer', () => {
  it('walks to the longest queue and performs there', () => {
    const { w, shop } = makePark();
    shop.queue = [1001, 1002, 1003, 1004]; // 길이만 쓰인다
    const s = hireStaff(w, 'entertainer')!;
    run(w, s, 400, () => s.state === 'working');
    expect(s.state).toBe('working');
    expect(s.tile).toEqual(shop.entrance);
    run(w, s, SHOW_TICKS + 1);
    expect(s.state).not.toBe('working');
  });

  it('ignores short queues', () => {
    const { w, shop } = makePark();
    shop.queue = [1001];
    const s = hireStaff(w, 'entertainer')!;
    run(w, s, 200);
    expect(s.state).not.toBe('working');
  });

  it('cheers nearby guests and restores patience of those queueing; far guests are unaffected', () => {
    const { w, g } = makePark();
    const s = hireStaff(w, 'entertainer')!;
    s.state = 'working';
    s.timer = SHOW_TICKS;
    s.target = { ...s.tile };
    const near = standingGuest(w, g.x, g.y - 2, (x) => { x.state = 'queueing'; x.timer = 300; });
    const far = standingGuest(w, g.x, g.y - 8);
    run(w, s, CHEER_EVERY);
    expect(near.needs.happiness).toBe(61);
    expect(near.timer).toBe(300 - CHEER_PATIENCE);
    expect(near.thought).toBe('show');
    expect(far.needs.happiness).toBe(60);
    expect(far.thought).toBeNull();
  });
});

describe('drink vendor', () => {
  it('finds a thirsty guest and sells a drink', () => {
    const { w, g } = makePark();
    const thirsty = standingGuest(w, g.x, g.y - 7, (x) => { x.needs.thirst = 80; });
    const fine = standingGuest(w, g.x, g.y - 6);
    const s = hireStaff(w, 'vendor')!;
    run(w, s, 400, () => thirsty.needs.thirst < 80);
    expect(thirsty.needs.thirst).toBe(80 - VENDOR_QUENCH);
    expect(thirsty.money).toBe(50 - VENDOR_PRICE);
    expect(thirsty.trash).toBeGreaterThan(0);
    expect(w.ledger.shops).toBe(VENDOR_PRICE);
    expect(fine.money).toBe(50);
  });

  it('does not sell to guests who cannot pay', () => {
    const { w, g } = makePark();
    const broke = standingGuest(w, g.x, g.y - 1, (x) => { x.needs.thirst = 90; x.money = VENDOR_PRICE - 1; });
    const s = hireStaff(w, 'vendor')!;
    run(w, s, 100);
    expect(broke.needs.thirst).toBe(90);
    expect(w.ledger.shops).toBe(0);
  });
});

describe('wages and save', () => {
  it('pays each kind its own wage', () => {
    const { w } = makePark();
    for (const k of STAFF_KINDS) hireStaff(w, k);
    const total = STAFF_KINDS.reduce((a, k) => a + WAGE[k], 0);
    expect(dailyWages(w)).toBe(total);
    settleDay(w);
    expect(w.ledger.wages).toBe(-total);
  });

  it('keeps every staff kind through save/load', () => {
    const { w } = makePark();
    for (const k of STAFF_KINDS) hireStaff(w, k);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.staff.map((s) => s.kind)).toEqual([...STAFF_KINDS]);
  });
});
