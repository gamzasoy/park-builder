import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { OAK } from '../src/data/scenery';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { DAY_TICKS, WAGE } from '../src/sim/economy';
import { createGuest, pickTarget, updateGuest, type Guest } from '../src/sim/guest';
import { stepGuests, stepWorld } from '../src/sim/sim';
import { hireStaff, STAFF_KINDS, updateStaff } from '../src/sim/staff';
import { applyStormDamage, updateStorm } from '../src/sim/storm';
import {
  catchThief, isSpotted, maybeThief, SHOPLIFT_LOSS, THIEF_BOUNTY, THIEF_MIN_GUESTS, updateThief,
} from '../src/sim/thief';
import { stormAt, stormOfDay, weatherKindOf } from '../src/sim/weather';
import { World } from '../src/sim/world';

/** 폭풍이 있는 (시드, 날짜) */
function findStorm(): { seed: number; day: number } {
  for (let seed = 1; seed < 500; seed++) {
    for (let day = 2; day < 40; day++) if (stormOfDay(seed, day)) return { seed, day };
  }
  throw new Error('no storm');
}

function onPath(g: Guest, x: number, y: number): Guest {
  g.x = g.px = x + 0.5;
  g.y = g.py = y + 0.5;
  g.tile = { x, y };
  return g;
}

describe('storm', () => {
  it('only comes on rainy days, is deterministic, and is quiet in the default seed for 12 days', () => {
    const { seed, day } = findStorm();
    expect(weatherKindOf(seed, day)).toBe('rain');
    const s = stormOfDay(seed, day)!;
    expect(stormAt(seed, s.start)).toEqual(s);
    expect(stormAt(seed, s.end)).toBeNull();
    let storms = 0;
    for (let d = 0; d < 300; d++) {
      const st = stormOfDay(seed, d);
      if (st) {
        storms++;
        expect(weatherKindOf(seed, d)).toBe('rain');
      }
    }
    expect(storms).toBeGreaterThan(0);
    for (let d = 0; d < 12; d++) expect(stormOfDay(new World().weatherSeed, d)).toBeNull();
  });

  it('stops outdoor rides, sends their queue away and keeps indoor rides running', () => {
    const { seed, day } = findStorm();
    const w = new World();
    w.weatherSeed = seed;
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 10 }));
    const out = placeBuilding(w, getDef('carousel'), g.x + 1, g.y - 4, 3)!;
    const inside = placeBuilding(w, getDef('drop'), g.x - 2, g.y - 8, 1)!;
    expect(w.network.isOperational(out) && w.network.isOperational(inside)).toBe(true);
    const q = onPath(createGuest(w), out.entrance.x, out.entrance.y);
    q.state = 'queueing';
    q.target = out.id;
    out.queue.push(q.id);
    w.guests = [q];
    w.guestById = new Map([[q.id, q]]);
    const s = stormOfDay(seed, day)!;
    w.tick = s.start;
    w.weather = { kind: 'rain', untilTick: (day + 1) * DAY_TICKS };
    updateStorm(w);
    expect(w.storm).toEqual(s);
    expect(out.queue).toHaveLength(0);
    expect(q.state).toBe('idle');
    expect(q.thought).toBe('storm');
    // 손님은 실외 기구를 고르지 않고, 실내 기구는 고른다
    onPath(q, g.x, g.y - 2);
    q.needs.happiness = 90;
    const pick = pickTarget(w, q);
    expect(pick?.b.id).toBe(inside.id);
  });

  it('soaks guests even with an umbrella', () => {
    const { seed, day } = findStorm();
    const w = new World();
    w.weatherSeed = seed;
    const g = onPath(createGuest(w), w.map.gate.x, w.map.gate.y);
    g.umbrella = true;
    g.state = 'queueing';
    w.guests = [g];
    w.weather = { kind: 'rain', untilTick: (day + 1) * DAY_TICKS };
    w.storm = stormOfDay(seed, day);
    g.needs.happiness = 80;
    for (let i = 0; i < 90; i++) {
      w.tick++;
      g.timer = 0;
      updateGuest(w, g);
    }
    expect(g.needs.happiness).toBeLessThan(80);
  });

  it('leaves damage behind: fallen roadside trees, debris on paths, worn outdoor rides', () => {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 30 }));
    for (let y = g.y - 30; y < g.y; y++) {
      w.map.scenery[w.map.index(g.x + 1, y)] = OAK;
      w.map.scenery[w.map.index(g.x - 1, y)] = OAK;
    }
    const ride = placeBuilding(w, getDef('carousel'), g.x + 2, g.y - 4, 3)!;
    const before = w.map.scenery.filter((k) => k === OAK).length;
    const d = applyStormDamage(w, 5);
    expect(d.trees).toBeGreaterThan(0);
    expect(d.debris).toBeGreaterThan(0);
    expect(d.rides).toBe(1);
    expect(w.map.scenery.filter((k) => k === OAK).length).toBe(before - d.trees);
    expect(w.map.litter.reduce((a, v) => a + v, 0)).toBe(d.debris);
    expect(ride.reliability).toBeLessThan(100);
  });

  it('is recomputed on load', () => {
    const { seed, day } = findStorm();
    const w = new World();
    w.weatherSeed = seed;
    w.tick = stormOfDay(seed, day)!.start + 5;
    expect(deserializeWorld(serializeWorld(w)).storm).toEqual(stormOfDay(seed, day));
  });
});

describe('thieves and security guards', () => {
  /** 손님이 많은 공원: 입구에서 위로 12칸 길, 기념품 가게 */
  function busyPark() {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 12 }));
    const shop = placeBuilding(w, getDef('souvenir'), g.x + 1, g.y - 6, 3)!;
    for (let i = 0; i < THIEF_MIN_GUESTS; i++) {
      const o = onPath(createGuest(w), g.x, g.y - 1 - (i % 10));
      o.money = 100;
      o.state = 'queueing'; // 제자리에 서 있게
      w.guests.push(o);
    }
    return { w, gate: g, shop };
  }

  function makeThief(w: World, x: number, y: number): Guest {
    const t = onPath(createGuest(w), x, y);
    t.thief = true;
    t.loot = 0;
    t.thefts = 0;
    w.guests.push(t);
    w.guestById = new Map(w.guests.map((g) => [g.id, g]));
    return t;
  }

  it('only appear in busy parks, a few at a time', () => {
    const w = new World();
    let made = 0;
    for (let i = 0; i < 200; i++) if (maybeThief(w, createGuest(w))) made++;
    expect(made).toBe(0); // 손님이 적으면 없다
    const { w: busy } = busyPark();
    for (let i = 0; i < 400; i++) {
      const g = createGuest(busy);
      if (maybeThief(busy, g)) busy.guests.push(g);
    }
    expect(busy.guests.filter((g) => g.thief).length).toBe(2);
  });

  it('pick pockets nearby guests and get spotted', () => {
    const { w, gate } = busyPark();
    const t = makeThief(w, gate.x, gate.y - 3);
    const money = w.guests.filter((g) => !g.thief).reduce((a, g) => a + g.money, 0);
    for (let i = 0; i < 300 && !t.thefts; i++) {
      w.tick++;
      updateThief(w, t);
    }
    expect(t.thefts).toBeGreaterThan(0);
    expect(t.loot).toBeGreaterThan(0);
    expect(w.guests.filter((g) => !g.thief).reduce((a, g) => a + g.money, 0)).toBe(money - t.loot!);
    expect(w.guests.some((g) => g.thought === 'robbed')).toBe(true);
    expect(isSpotted(w, t)).toBe(true);
    expect(w.stats.thefts).toBe(t.thefts);
  });

  it('shoplift from souvenir shops, costing the park money', () => {
    const { w, shop } = busyPark();
    w.guests = [];
    const t = makeThief(w, shop.entrance.x, shop.entrance.y);
    const money = w.money;
    for (let i = 0; i < 300 && !t.shoplifted; i++) {
      w.tick++;
      t.state = 'queueing'; // 가게 앞에 머물게
      updateThief(w, t);
    }
    expect(t.shoplifted).toBe(SHOPLIFT_LOSS);
    expect(w.money).toBe(money - SHOPLIFT_LOSS);
    expect(w.ledger.theft).toBe(-SHOPLIFT_LOSS);
  });

  it('can be caught for a bounty, which also gives back stolen goods', () => {
    const { w, gate } = busyPark();
    const t = makeThief(w, gate.x, gate.y - 3);
    t.shoplifted = SHOPLIFT_LOSS;
    const money = w.money;
    expect(catchThief(w, t)).toBe(true);
    expect(w.money).toBe(money + THIEF_BOUNTY + SHOPLIFT_LOSS);
    expect(t.state).toBe('gone');
    expect(w.stats.caught).toBe(1);
    expect(catchThief(w, t)).toBe(false);
    expect(w.guests.some((g) => g.thought === 'caught')).toBe(true);
    stepGuests(w);
    expect(w.guests.includes(t)).toBe(false);
    expect(w.reviews).toHaveLength(0); // 도둑은 리뷰를 남기지 않는다
  });

  it('are deterred and caught by security guards', () => {
    expect(STAFF_KINDS).toContain('security');
    expect(WAGE.security).toBeGreaterThan(0);
    const { w, gate } = busyPark();
    const s = hireStaff(w, 'security')!;
    s.x = gate.x + 0.5;
    s.y = gate.y - 7 + 0.5;
    s.tile = { x: gate.x, y: gate.y - 7 };
    // 경비원 가까이(4칸 안)에서는 훔치지 않는다
    const t = makeThief(w, gate.x, gate.y - 4);
    t.state = 'queueing';
    for (let i = 0; i < 200; i++) {
      w.tick++;
      t.state = 'queueing';
      updateThief(w, t);
    }
    expect(t.thefts).toBe(0);
    // 붙어 있으면 잡는다
    const money = w.money;
    onPath(t, gate.x, gate.y - 7);
    updateStaff(w, s);
    expect(t.state).toBe('gone');
    expect(w.money).toBe(money + THIEF_BOUNTY);
  });

  it('are chased down by a guard once spotted', () => {
    const { w, gate } = busyPark();
    w.guests = [];
    const s = hireStaff(w, 'security')!; // 입구에서 출발
    const t = makeThief(w, gate.x, gate.y - 11);
    t.spotted = 10_000;
    t.state = 'queueing';
    for (let i = 0; i < 400 && (t.state as string) !== 'gone'; i++) {
      w.tick++;
      updateStaff(w, s);
    }
    expect(t.state).toBe('gone');
  });

  it('keep their state through save/load', () => {
    const { w, gate } = busyPark();
    const t = makeThief(w, gate.x, gate.y - 3);
    t.loot = 30;
    t.thefts = 2;
    t.spotted = 999;
    const back = deserializeWorld(serializeWorld(w)).guests.find((g) => g.id === t.id)!;
    expect(back).toMatchObject({ thief: true, loot: 30, thefts: 2, spotted: 999 });
  });

  it('run in a full simulation without breaking anything', () => {
    const { w } = busyPark();
    w.guests = [];
    hireStaff(w, 'security');
    for (let i = 0; i < 6000; i++) stepWorld(w);
    expect(w.guests.length).toBeGreaterThan(0);
    expect(w.staff.find((s) => s.kind === 'security')).toBeDefined();
  });
});
