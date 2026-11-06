import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import {
  DAY_TICKS, DAYS_PER_MONTH, dailyUpkeep, dateOf, fairPrice, feeFactor, MAX_FEE, MAX_PRICE,
  setEntranceFee, setPrice, settleDay,
} from '../src/sim/economy';
import { createGuest } from '../src/sim/guest';
import { computeRating, updateRating } from '../src/sim/rating';
import { stepGuests, stepWorld } from '../src/sim/sim';
import { START_MONEY, World } from '../src/sim/world';

function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!;
  return { w, g, ride, shop };
}

describe('calendar', () => {
  it('maps ticks to year/month/day (10 days per month, 12 months per year)', () => {
    expect(dateOf(0)).toEqual({ year: 1, month: 1, day: 1 });
    expect(dateOf(DAY_TICKS - 1)).toEqual({ year: 1, month: 1, day: 1 });
    expect(dateOf(DAY_TICKS)).toEqual({ year: 1, month: 1, day: 2 });
    expect(dateOf(DAY_TICKS * DAYS_PER_MONTH)).toEqual({ year: 1, month: 2, day: 1 });
    expect(dateOf(DAY_TICKS * DAYS_PER_MONTH * 12)).toEqual({ year: 2, month: 1, day: 1 });
  });
});

describe('ledger and upkeep', () => {
  it('records every cash movement by category and keeps money in sync', () => {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 2 })); // 2칸 신규(입구는 이미 길)
    expect(w.ledger.construction).toBe(-20);
    placeBuilding(w, getDef('carousel'), 5, 5, 0);
    expect(w.ledger.construction).toBe(-20 - 1500);
    expect(w.money).toBe(START_MONEY - 1520);
    w.transact('rides', 50);
    expect(w.money).toBe(START_MONEY - 1470);
    expect(w.ledger.rides).toBe(50);
  });

  it('charges the sum of building upkeep when a day ends', () => {
    const { w } = makePark();
    const up = getDef('carousel').upkeep + getDef('burger').upkeep;
    expect(dailyUpkeep(w)).toBe(up);
    const before = w.money;
    w.resetLedger();
    w.tick = DAY_TICKS; // 첫날이 끝난 시점
    settleDay(w);
    expect(w.money).toBe(before - up);
    expect(w.ledger.upkeep).toBe(-up);
    expect(w.reports).toHaveLength(0); // 달이 끝난 것은 아님
  });

  it('produces a monthly report after DAYS_PER_MONTH days and resets the ledger', () => {
    const { w } = makePark();
    w.resetLedger();
    const days = DAYS_PER_MONTH;
    for (let i = 0; i < days * DAY_TICKS; i++) stepWorld(w);
    expect(w.reports).toHaveLength(1);
    const r = w.reports[0];
    expect(r).toMatchObject({ year: 1, month: 1 });
    expect(r.ledger.upkeep).toBe(-dailyUpkeep(w) * days);
    expect(r.net).toBe(Object.values(r.ledger).reduce((a, b) => a + b, 0));
    expect(r.money).toBe(w.money);
    expect(r.entered).toBe(w.stats.entered);
    expect(w.ledger.upkeep).toBe(0); // 새 달 장부는 비어 있음 (달 경계 틱 직후)
    expect(w.monthStartEntered).toBe(w.stats.entered);
  });
});

describe('prices', () => {
  it('clamps and rounds player-set prices and fees', () => {
    const { ride, w } = makePark();
    setPrice(ride, 12.6); expect(ride.price).toBe(13);
    setPrice(ride, -5); expect(ride.price).toBe(0);
    setPrice(ride, 9999); expect(ride.price).toBe(MAX_PRICE);
    setEntranceFee(w, 999); expect(w.entranceFee).toBe(MAX_FEE);
    setEntranceFee(w, -1); expect(w.entranceFee).toBe(0);
  });

  it('guests pay the adjusted price, not the default', () => {
    const { w, ride } = makePark();
    setPrice(ride, 5);
    const g = createGuest(w);
    g.needs.hunger = 0; g.needs.thirst = 0; g.needs.toilet = 0;
    g.money = 100;
    w.guests.push(g);
    const before = w.money;
    let guard = 0;
    while (g.state !== 'visiting' && guard++ < 600) stepGuests(w);
    expect(g.money).toBe(95);
    expect(w.money).toBe(before + 5);
    expect(ride.income).toBe(5);
  });

  it('guests avoid an overpriced attraction in favour of a fair one', () => {
    const { w, g: gate, ride } = makePark();
    placePaths(w, lineTiles({ x: gate.x + 1, y: 38 }, { x: gate.x + 1, y: 34 }));
    placePaths(w, [{ x: gate.x, y: 34 }]);
    const other = placeBuilding(w, getDef('carousel'), gate.x - 1, 32, 0)!;
    setPrice(ride, 60); // 적정가(10)의 6배
    expect(ride.price).toBeGreaterThan(fairPrice(getDef('carousel')) * 3);
    const guest = createGuest(w);
    guest.money = 120;
    guest.needs.hunger = 0; guest.needs.thirst = 0; guest.needs.toilet = 0;
    w.guests.push(guest);
    for (let i = 0; i < 20; i++) stepGuests(w);
    expect(guest.target).toBe(other.id);
  });
});

describe('entrance fee', () => {
  const run = (fee: number): { entered: number; income: number } => {
    const { w } = makePark();
    setEntranceFee(w, fee);
    w.resetLedger();
    for (let i = 0; i < 3000; i++) stepWorld(w);
    return { entered: w.stats.entered, income: w.ledger.entrance };
  };

  it('is collected from each arriving guest', () => {
    const r = run(10);
    expect(r.entered).toBeGreaterThan(0);
    expect(r.income).toBe(r.entered * 10);
  });

  it('scales down arrivals as it rises, and is free at 0', () => {
    expect(feeFactor(0)).toBe(1);
    expect(feeFactor(MAX_FEE)).toBeCloseTo(0.05);
    const cheap = run(0), pricey = run(40);
    expect(cheap.income).toBe(0);
    expect(pricey.entered).toBeLessThan(cheap.entered);
  });
});

describe('rating', () => {
  it('is 0 without any operating attraction and stays within 0..1000', () => {
    const w = new World();
    expect(computeRating(w).total).toBe(0);
    const { w: park } = makePark();
    const t = computeRating(park).total;
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(1000);
  });

  it('rewards variety', () => {
    const { w } = makePark(); // 놀이기구 1 + 매점 1
    const base = computeRating(w).parts.variety;
    expect(base).toBe(20 + 15);
    placePaths(w, lineTiles({ x: w.map.gate.x + 1, y: 38 }, { x: w.map.gate.x + 1, y: 34 }));
    placePaths(w, [{ x: w.map.gate.x, y: 34 }]);
    placeBuilding(w, getDef('drop'), w.map.gate.x - 1, 32, 0);
    expect(computeRating(w).parts.variety).toBe(40 + 15);
  });

  it('punishes unmet needs and long queues, and moves gradually toward the target', () => {
    const { w, ride } = makePark();
    const calm = computeRating(w).total;
    for (let i = 0; i < 10; i++) {
      const g = createGuest(w);
      g.needs.hunger = 95;
      w.guests.push(g);
    }
    expect(computeRating(w).parts.complaints).toBeGreaterThan(100);
    expect(computeRating(w).total).toBeLessThan(calm);

    ride.queue = Array.from({ length: 10 }, (_, i) => 1000 + i);
    expect(computeRating(w).parts.flow).toBeLessThan(120); // 운영 중 2곳 중 1곳이 긴 줄

    w.rating = 100;
    const target = computeRating(w).total;
    updateRating(w);
    expect(w.rating).toBeGreaterThan(100);
    expect(w.rating).toBeLessThan(target);
  });

  it('a higher rating brings more guests', () => {
    const arrive = (rating: number): number => {
      const { w } = makePark();
      for (let i = 0; i < 3000; i++) {
        w.rating = rating; // 평점 고정
        stepWorld(w);
      }
      return w.stats.entered;
    };
    expect(arrive(900)).toBeGreaterThan(arrive(100));
  });
});
