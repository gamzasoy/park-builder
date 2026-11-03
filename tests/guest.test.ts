import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { getDef } from '../src/data';
import { demolishAt, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { createGuest, GUEST_SPEED, type Guest } from '../src/sim/guest';
import { stepGuests, stepWorld } from '../src/sim/sim';
import { MAX_GUESTS } from '../src/sim/spawner';
import { World } from '../src/sim/world';

/** 입구에서 위로 뻗은 길 + 회전목마(입구 연결) + 햄버거 가게(길 옆) */
function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 })); // y 47..39
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!; // 입구 (g.x, 38)
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!; // 입구 (g.x, 43)
  return { w, g, ride, shop };
}

function addGuest(w: World, tweak?: (g: Guest) => void): Guest {
  const guest = createGuest(w);
  tweak?.(guest);
  w.guests.push(guest);
  return guest;
}

function runUntil(w: World, cond: () => boolean, max = 600): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    stepGuests(w);
  }
  throw new Error('condition not reached');
}

describe('Rng', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = new Rng(7), b = new Rng(7), c = new Rng(8);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe('spawner', () => {
  it('spawns nobody without an operational attraction', () => {
    const w = new World();
    for (let i = 0; i < 500; i++) stepWorld(w);
    expect(w.guests).toHaveLength(0);
    // 길과 이어지지 않은 건물도 운영 중이 아님
    placeBuilding(w, getDef('carousel'), 10, 10, 0);
    for (let i = 0; i < 500; i++) stepWorld(w);
    expect(w.stats.entered).toBe(0);
  });

  it('spawns guests at the gate once something operates, respecting the cap', () => {
    const { w } = makePark();
    for (let i = 0; i < 300; i++) stepWorld(w);
    expect(w.stats.entered).toBeGreaterThan(0);
    expect(w.guests.length).toBeLessThanOrEqual(MAX_GUESTS);
  });
});

describe('guest behaviour', () => {
  it('walks to a ride at bounded speed, pays, and is happier afterwards', () => {
    const { w, ride } = makePark();
    const guest = addGuest(w, (g) => { g.needs.hunger = 0; g.needs.thirst = 0; g.needs.toilet = 0; });
    const startMoney = guest.money;
    const baseMoney = w.money;
    const happy0 = guest.needs.happiness;

    let maxStep = 0;
    runUntil(w, () => {
      maxStep = Math.max(maxStep, Math.hypot(guest.x - guest.px, guest.y - guest.py));
      return guest.state === 'visiting';
    });
    expect(guest.target).toBe(ride.id);
    expect(maxStep).toBeLessThanOrEqual(GUEST_SPEED + 1e-9);
    expect(maxStep).toBeGreaterThan(0);
    expect(guest.tile).toEqual(ride.entrance);
    const price = getDef('carousel').price;
    expect(guest.money).toBe(startMoney - price);
    expect(w.money).toBe(baseMoney + price);

    runUntil(w, () => guest.state === 'idle');
    expect(guest.needs.happiness).toBeGreaterThan(happy0);
    expect(guest.visited).toContain(ride.id);
  });

  it('a hungry guest goes to the burger shop instead of the ride, and eats', () => {
    const { w, shop } = makePark();
    const guest = addGuest(w, (g) => { g.needs.hunger = 90; });
    runUntil(w, () => guest.state === 'visiting');
    expect(guest.target).toBe(shop.id);
    runUntil(w, () => guest.state === 'idle');
    expect(guest.needs.hunger).toBeLessThan(40);
  });

  it('an unhappy guest walks back to the gate and leaves the park', () => {
    const { w, g } = makePark();
    const guest = addGuest(w, (x) => {
      x.needs.happiness = 5;
      x.x = g.x + 0.5; x.y = 40.5; x.px = x.x; x.py = x.y;
      x.tile = { x: g.x, y: 40 };
    });
    runUntil(w, () => w.guests.length === 0, 300);
    expect(guest.state).toBe('gone');
    expect(w.stats.left).toBe(1);
  });

  it('gives up on a target when the road ahead is demolished, and resumes when repaired', () => {
    const { w, g } = makePark();
    const guest = addGuest(w, (x) => { x.needs.hunger = 0; x.needs.thirst = 0; x.needs.toilet = 0; });
    runUntil(w, () => guest.state === 'walking');
    for (let i = 0; i < 15; i++) stepGuests(w);
    expect(guest.state).toBe('walking');

    demolishAt(w, g.x, 41); // 앞쪽 길 철거
    stepGuests(w);
    expect(guest.state).toBe('idle');
    expect(guest.target).toBeNull();

    placePaths(w, [{ x: g.x, y: 41 }]);
    runUntil(w, () => guest.state === 'visiting', 400);
    expect(guest.tile).toEqual({ x: g.x, y: 38 });
  });

  it('vanishes if the road tile it stands on is demolished', () => {
    const { w, g } = makePark();
    const guest = addGuest(w, (x) => {
      x.x = g.x + 0.5; x.y = 44.5; x.px = x.x; x.py = x.y; x.tile = { x: g.x, y: 44 };
    });
    demolishAt(w, g.x, 44);
    runUntil(w, () => guest.state === 'gone', 400);
    expect(w.guests).not.toContain(guest);
  });

  it('is fully deterministic for the same seed', () => {
    const run = () => {
      const { w } = makePark();
      for (let i = 0; i < 800; i++) stepWorld(w);
      return { n: w.guests.length, money: w.money, ...w.stats, tick: w.tick };
    };
    expect(run()).toEqual(run());
  });
});
