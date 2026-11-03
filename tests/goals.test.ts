import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { DAY_TICKS } from '../src/sim/economy';
import { createGuest } from '../src/sim/guest';
import {
  BANKRUPT_DAYS, DEADLINE_TICK, GOAL, goalProgress, trackDebt, updateGoals,
} from '../src/sim/goals';
import { stepWorld } from '../src/sim/sim';
import { World } from '../src/sim/world';

function makePark(): World {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0);
  return w;
}

function fillGuests(w: World, n: number): void {
  while (w.guests.length < n) w.guests.push(createGuest(w));
}

describe('goal', () => {
  it('reports progress toward guests, rating, hold and remaining days', () => {
    const w = new World();
    w.rating = 700;
    fillGuests(w, 40);
    expect(goalProgress(w)).toMatchObject({ guests: 40, rating: 700, guestsMet: false, ratingMet: true, hold: 0 });
    expect(goalProgress(w).remainingDays).toBe(Math.ceil(DEADLINE_TICK / DAY_TICKS));
  });

  it('is won only after the conditions hold continuously for the hold period', () => {
    const w = new World();
    w.rating = GOAL.rating;
    fillGuests(w, GOAL.guests);
    for (let i = 0; i < GOAL.holdTicks - 1; i++) { w.tick++; updateGoals(w); }
    expect(w.status).toBe('playing');
    expect(goalProgress(w).hold).toBeGreaterThan(0.99);
    w.tick++; updateGoals(w);
    expect(w.status).toBe('won');
    expect(w.endReason).not.toBe('');
  });

  it('resets the hold counter when a condition breaks', () => {
    const w = new World();
    w.rating = GOAL.rating;
    fillGuests(w, GOAL.guests);
    for (let i = 0; i < 300; i++) { w.tick++; updateGoals(w); }
    expect(w.goalHold).toBe(300);
    w.rating = GOAL.rating - 1;
    w.tick++; updateGoals(w);
    expect(w.goalHold).toBe(0);
    expect(w.status).toBe('playing');
  });

  it('is lost when the deadline passes', () => {
    const w = new World();
    w.tick = DEADLINE_TICK - 1;
    updateGoals(w);
    expect(w.status).toBe('playing');
    w.tick = DEADLINE_TICK;
    updateGoals(w);
    expect(w.status).toBe('lost');
    expect(w.endReason).toContain(String(GOAL.months));
  });

  it('a win that would complete after the deadline does not count', () => {
    const w = new World();
    w.rating = GOAL.rating;
    fillGuests(w, GOAL.guests);
    w.tick = DEADLINE_TICK - 10;
    w.goalHold = 0;
    for (let i = 0; i < 20; i++) { w.tick++; updateGoals(w); }
    expect(w.status).toBe('lost');
  });
});

describe('bankruptcy', () => {
  it('needs consecutive negative days, and recovering resets the count', () => {
    const w = new World();
    w.money = -1;
    for (let i = 0; i < BANKRUPT_DAYS - 1; i++) trackDebt(w);
    expect(w.status).toBe('playing');
    w.money = 50;
    trackDebt(w);
    expect(w.debtDays).toBe(0);
    w.money = -1;
    for (let i = 0; i < BANKRUPT_DAYS; i++) trackDebt(w);
    expect(w.status).toBe('lost');
    expect(w.endReason).toContain('파산');
  });
});

describe('ended games', () => {
  it('stop simulating once won or lost, and sandbox keeps running without goals', () => {
    const w = makePark();
    for (let i = 0; i < 100; i++) stepWorld(w);
    const t = w.tick;

    w.status = 'lost';
    for (let i = 0; i < 50; i++) stepWorld(w);
    expect(w.tick).toBe(t); // 정지

    w.status = 'sandbox';
    w.tick = DEADLINE_TICK + 5000; // 기한이 한참 지나도
    for (let i = 0; i < 50; i++) stepWorld(w);
    expect(w.tick).toBe(DEADLINE_TICK + 5050); // 계속 진행
    expect(w.status).toBe('sandbox'); // 목표 판정 없음
  });

  it('an empty park loses at the deadline through the real loop', () => {
    const w = new World();
    for (let i = 0; i < DEADLINE_TICK + 10 && w.status === 'playing'; i++) stepWorld(w);
    expect(w.status).toBe('lost');
    expect(w.tick).toBe(DEADLINE_TICK);
  });

  it('tracks the peak number of guests', () => {
    const w = makePark();
    for (let i = 0; i < 2000; i++) stepWorld(w);
    expect(w.stats.peakGuests).toBeGreaterThanOrEqual(w.guests.length);
    expect(w.stats.peakGuests).toBeGreaterThan(0);
  });
});
