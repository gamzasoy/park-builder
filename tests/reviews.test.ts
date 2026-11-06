import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { DAY_TICKS, DAYS_PER_MONTH } from '../src/sim/economy';
import { createGuest, think, type Guest } from '../src/sim/guest';
import { addReview, averageStars, guestName, makeReview, MAX_REVIEWS, starsFor } from '../src/sim/reviews';
import { seasonOf } from '../src/sim/season';
import { stepGuests } from '../src/sim/sim';
import { World } from '../src/sim/world';

function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
  return { w, g, ride };
}

function guest(w: World, tweak?: (g: Guest) => void): Guest {
  const g = createGuest(w);
  tweak?.(g);
  w.guests.push(g);
  return g;
}

describe('guest names', () => {
  it('are stable per id and varied', () => {
    expect(guestName(7)).toBe(guestName(7));
    const names = new Set(Array.from({ length: 200 }, (_, i) => guestName(i)));
    expect(names.size).toBeGreaterThan(100);
    for (const n of names) expect([...n].length).toBe(3);
  });
});

describe('reviews', () => {
  it('map happiness to 1..5 stars', () => {
    expect(starsFor(95)).toBe(5);
    expect(starsFor(70)).toBe(4);
    expect(starsFor(55)).toBe(3);
    expect(starsFor(35)).toBe(2);
    expect(starsFor(5)).toBe(1);
  });

  it('praise the favourite ride when happy', () => {
    const { w, ride } = makePark();
    const g = guest(w, (x) => { x.needs.happiness = 95; x.visited = [ride.id]; });
    const r = makeReview(w, g);
    expect(r.stars).toBe(5);
    expect(r.text).toContain('회전목마');
    expect(r.name).toBe(guestName(g.id));
  });

  it('complain about what went wrong when unhappy', () => {
    const { w } = makePark();
    const hungry = guest(w, (x) => { x.needs.happiness = 10; x.needs.hunger = 90; });
    expect(makeReview(w, hungry).text).toContain('먹을');
    const broke = guest(w, (x) => { x.needs.happiness = 10; x.leaveReason = 'broke'; });
    expect(makeReview(w, broke).text).toContain('돈');
    const dirty = guest(w, (x) => { x.needs.happiness = 10; think(x, 'litter'); x.thought = null; });
    expect(dirty.gripe).toBe('litter');
    expect(makeReview(w, dirty).text).toMatch(/쓰레기|청소/);
  });

  it('are written when a guest leaves, capped, and averaged', () => {
    const { w } = makePark();
    const g = guest(w, (x) => { x.needs.happiness = 5; }); // 기분이 바닥이라 곧 떠난다
    for (let i = 0; i < 500 && g.state !== 'gone'; i++) stepGuests(w);
    expect(g.state).toBe('gone');
    expect(w.reviews).toHaveLength(1);
    expect(w.reviews[0].guestId).toBe(g.id);
    expect(w.reviews[0].stars).toBe(1);
    for (let i = 0; i < MAX_REVIEWS + 5; i++) addReview(w, guest(w, (x) => { x.needs.happiness = 95; }));
    expect(w.reviews).toHaveLength(MAX_REVIEWS);
    expect(averageStars(w)).toBe(5);
  });

  it('survive save/load; old saves have none', () => {
    const { w } = makePark();
    addReview(w, guest(w, (x) => { x.needs.happiness = 60; }));
    expect(deserializeWorld(serializeWorld(w)).reviews).toEqual(w.reviews);
    const data = serializeWorld(w);
    delete data.reviews;
    expect(deserializeWorld(data).reviews).toEqual([]);
  });
});

describe('seasons', () => {
  const month = (m: number): number => (m - 1) * DAYS_PER_MONTH * DAY_TICKS;
  it('follow the calendar months', () => {
    expect(seasonOf(month(1))).toBe('winter');
    expect(seasonOf(month(3))).toBe('spring');
    expect(seasonOf(month(6))).toBe('summer');
    expect(seasonOf(month(9))).toBe('autumn');
    expect(seasonOf(month(12))).toBe('winter');
    expect(seasonOf(month(13))).toBe('winter'); // 2년차 1월
  });
});
