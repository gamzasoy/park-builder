import { describe, expect, it } from 'vitest';
import { hash32 } from '../src/core/hash';
import { getDef } from '../src/data';
import { BIN, SCENERY } from '../src/data/scenery';
import {
  deserializeWorld, parseSave, SAVE_VERSION, serializeWorld, type SaveData,
} from '../src/save/save';
import { lineTiles, placeBuilding, placePaths, placeScenery } from '../src/sim/building';
import { DAY_TICKS, dailyUpkeep, settleDay, WAGE } from '../src/sim/economy';
import { createGuest, TRASH_MAX, TRASH_MIN, type Guest } from '../src/sim/guest';
import { cleanliness, computeRating } from '../src/sim/rating';
import { stepGuests, stepWorld } from '../src/sim/sim';
import { fireStaff, hireStaff, SWEEP_TICKS } from '../src/sim/staff';
import { release } from '../src/sim/venue';
import { World } from '../src/sim/world';

/** 입구에서 위로 뻗은 길 + 햄버거 가게(길 옆). 건물은 손님 없이 두고 직접 제어한다. */
function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 })); // y 47..39
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!; // 입구 (g.x, 43)
  return { w, g, shop };
}

function addGuest(w: World, tweak?: (g: Guest) => void): Guest {
  const guest = createGuest(w);
  tweak?.(guest);
  w.guests.push(guest);
  return guest;
}

/** 길 위에 가만히 서 있는 손님(이용을 마친 직후 상태) */
function standingGuest(w: World, x: number, y: number): Guest {
  return addGuest(w, (g) => {
    g.x = g.px = x + 0.5;
    g.y = g.py = y + 0.5;
    g.tile = { x, y };
    g.pathVersion = w.map.version;
    g.needs.hunger = 0; g.needs.thirst = 0; g.needs.toilet = 0; g.needs.energy = 100; g.needs.happiness = 90;
    g.money = 50; // 욕구가 없어 갈 곳을 고르지 않고 그냥 서 있다
    g.age = 0;
  });
}

function step(w: World, n = 1): void {
  for (let i = 0; i < n; i++) stepGuests(w);
}

const litterTotal = (w: World): number => w.map.litter.reduce((a, b) => a + b, 0);

describe('hash32', () => {
  it('is deterministic and spreads values', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(new Set(Array.from({ length: 100 }, (_, i) => hash32(i) % 51)).size).toBeGreaterThan(30);
  });
});

describe('litter', () => {
  it('guests who finish eating carry trash and drop it on the path after 30-80 ticks', () => {
    const { w, shop } = makePark();
    const g = standingGuest(w, w.map.gate.x, 41);
    g.state = 'visiting';
    g.target = shop.id;
    shop.inside.push(g.id);
    w.guestById = new Map(w.guests.map((x) => [x.id, x]));
    release(w, shop, getDef('burger'), g.id);
    expect(g.trash).toBeGreaterThanOrEqual(TRASH_MIN);
    expect(g.trash).toBeLessThanOrEqual(TRASH_MAX);
    const wait = g.trash;
    expect(litterTotal(w)).toBe(0);
    step(w, wait - 1);
    expect(litterTotal(w)).toBe(0);
    step(w, 1);
    expect(litterTotal(w)).toBe(1);
    expect(g.trash).toBe(0);
  });

  it('toilets do not make trash, and litter is capped at 3 per tile', () => {
    const { w } = makePark();
    const wc = placeBuilding(w, getDef('toilet'), 10, 10, 0)!;
    const g = standingGuest(w, w.map.gate.x, 41);
    g.state = 'visiting';
    wc.inside.push(g.id);
    w.guestById = new Map(w.guests.map((x) => [x.id, x]));
    release(w, wc, getDef('toilet'), g.id);
    expect(g.trash).toBe(0);

    const t = { x: w.map.gate.x, y: 41 };
    for (let i = 0; i < 5; i++) {
      g.trash = 1;
      step(w, 1);
    }
    expect(w.map.litterAt(t.x, t.y)).toBe(3);
  });

  it('a bin within 3 tiles takes the trash instead of the path', () => {
    const { w, g } = makePark();
    const bin = SCENERY.find((d) => d.kind === BIN)!;
    expect(bin.cost).toBe(50);
    const money = w.money;
    expect(placeScenery(w, [{ x: g.x + 2, y: 41 }], bin).placed).toBe(1);
    expect(w.money).toBe(money - 50);
    const near = standingGuest(w, g.x, 42);
    near.trash = 2;
    const far = standingGuest(w, g.x, 46); // 반경 3을 벗어남(y 41과 5칸)
    far.trash = 2;
    step(w, 2);
    expect(w.map.litterAt(g.x, 42)).toBe(0);
    expect(w.map.litterAt(g.x, 46)).toBe(1);
  });

  it('litter nearby sours guests, and removing the path clears it', () => {
    const { w, g } = makePark();
    for (let y = 40; y <= 42; y++) w.map.litter[w.map.index(g.x, y)] = 3;
    const guest = standingGuest(w, g.x, 41);
    const before = guest.needs.happiness;
    step(w, 30);
    expect(guest.needs.happiness).toBeLessThan(before);
    expect(guest.thought).toBe('litter');

    w.map.setPath(g.x, 42, false);
    expect(w.map.litterAt(g.x, 42)).toBe(0);
  });

  it('a dirty park lowers the cleanliness rating part, a clean one does not', () => {
    const { w, g } = makePark();
    expect(cleanliness(w)).toBe(100);
    const clean = computeRating(w).total;
    for (let y = 39; y <= 46; y++) w.map.litter[w.map.index(g.x, y)] = 3;
    expect(cleanliness(w)).toBeLessThan(100);
    const dirty = computeRating(w);
    expect(dirty.parts.cleanliness).toBeLessThan(100);
    expect(dirty.total).toBeLessThanOrEqual(clean);
  });
});

describe('janitor', () => {
  it('is hired at the gate, fired on demand and costs wages every day', () => {
    const { w } = makePark();
    const s = hireStaff(w, 'janitor')!;
    expect(s.tile).toEqual(w.map.gate);
    expect(w.staff).toHaveLength(1);
    hireStaff(w, 'janitor');
    w.tick = DAY_TICKS;
    const money = w.money;
    settleDay(w);
    expect(w.money).toBe(money - dailyUpkeep(w) - WAGE * 2);
    expect(w.ledger.wages).toBe(-WAGE * 2);
    expect(fireStaff(w, s.id)).toBe(true);
    expect(fireStaff(w, s.id)).toBe(false);
    expect(w.staff).toHaveLength(1);
  });

  it('walks to the nearest dirty tile, sweeps it for 20 ticks and clears it', () => {
    const { w, g } = makePark();
    const dirty = { x: g.x, y: 41 };
    const i = w.map.index(dirty.x, dirty.y);
    w.map.litter[i] = 2;
    const s = hireStaff(w, 'janitor')!;
    step(w, 200);
    expect(w.map.litter[i]).toBe(0);
    expect(s.tile.x).toBe(dirty.x);

    // 청소 중에는 아직 남아 있다
    w.map.litter[i] = 1;
    let sawWorking = false;
    let sweepTicks = 0;
    for (let n = 0; n < 200 && w.map.litter[i] > 0; n++) {
      step(w, 1);
      if (s.state === 'working') { sawWorking = true; sweepTicks++; }
    }
    expect(sawWorking).toBe(true);
    expect(sweepTicks).toBeLessThanOrEqual(SWEEP_TICKS);
    expect(w.map.litter[i]).toBe(0);
  });

  it('two janitors split two dirty tiles, and an idle one wanders on paths only', () => {
    const { w, g } = makePark();
    w.map.litter[w.map.index(g.x, 41)] = 1;
    w.map.litter[w.map.index(g.x, 40)] = 1;
    const a = hireStaff(w, 'janitor')!;
    const b = hireStaff(w, 'janitor')!;
    step(w, 5);
    step(w, 5);
    expect(a.target && b.target ? a.target.y !== b.target.y : true).toBe(true);
    step(w, 300);
    expect(litterTotal(w)).toBe(0);
    for (let n = 0; n < 200; n++) {
      step(w, 1);
      expect(w.map.isPath(a.tile.x, a.tile.y)).toBe(true);
      expect(w.map.isPath(b.tile.x, b.tile.y)).toBe(true);
    }
  });

  it('returns to the gate when its path is demolished under it', () => {
    const { w, g } = makePark();
    w.map.litter[w.map.index(g.x, 41)] = 1;
    const s = hireStaff(w, 'janitor')!;
    step(w, 60);
    w.map.setPath(s.tile.x, s.tile.y, false);
    if (!w.map.isGate(s.tile.x, s.tile.y)) {
      step(w, 1);
      expect(s.tile).toEqual(w.map.gate);
    }
  });
});

describe('staff saves', () => {
  /** 손님·쓰레기·청소부가 섞인 공원 */
  function busyPark(): World {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
    placePaths(w, [{ x: g.x, y: 38 }]);
    placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0);
    placeBuilding(w, getDef('burger'), g.x + 1, 43, 3);
    placeBuilding(w, getDef('drinks'), g.x - 2, 41, 1);
    hireStaff(w, 'janitor');
    hireStaff(w, 'janitor');
    for (let i = 0; i < 1500; i++) stepWorld(w);
    return w;
  }

  const snap = (w: World) => {
    const d = serializeWorld(w);
    return { ...d, savedAt: 0, guests: d.guests.map(({ pathVersion: _v, ...g }) => g), staff: d.staff!.map(({ pathVersion: _v, ...s }) => s) };
  };

  it('round-trips staff and litter, and continuing matches the original', () => {
    const w = busyPark();
    expect(w.staff).toHaveLength(2);
    expect(litterTotal(w) + w.staff.length).toBeGreaterThan(0);
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as SaveData);
    expect(snap(back)).toEqual(snap(w));
    expect(Array.from(back.map.litter)).toEqual(Array.from(w.map.litter));
    for (let i = 0; i < 800; i++) {
      stepWorld(w);
      stepWorld(back);
    }
    expect(snap(back)).toEqual(snap(w));
  });

  it('loads a v3 save with defaults for litter, staff and wages', () => {
    const w = busyPark();
    const d = JSON.parse(JSON.stringify(serializeWorld(w))) as SaveData & Record<string, unknown>;
    delete d.litter;
    delete d.staff;
    delete d.nextStaffId;
    for (const g of d.guests) delete (g as { trash?: number }).trash;
    delete (d.ledger as unknown as Record<string, unknown>).wages;
    for (const r of d.reports) delete (r.ledger as unknown as Record<string, unknown>).wages;
    delete (d.ratingParts as unknown as Record<string, unknown>).cleanliness;
    d.version = 3;
    expect(SAVE_VERSION).toBe(4);
    const r = parseSave(JSON.stringify(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.world.staff).toEqual([]);
    expect(r.world.nextStaffId).toBe(1);
    expect(litterTotal(r.world)).toBe(0);
    expect(r.world.ledger.wages).toBe(0);
    expect(r.world.ratingParts.cleanliness).toBe(100);
    expect(r.world.guests.every((g) => g.trash === 0)).toBe(true);
    for (let i = 0; i < 100; i++) stepWorld(r.world);
  });

  it('rejects a malformed litter layer', () => {
    const d = JSON.parse(JSON.stringify(serializeWorld(new World()))) as SaveData;
    d.litter = '012';
    expect(() => deserializeWorld(d)).toThrow();
  });
});
