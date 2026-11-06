import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { DAY_TICKS } from '../src/sim/economy';
import {
  BUS_GUESTS, EVENT_CHANCE, EVENT_KINDS, eventAtTick, eventOfDay, FIREWORKS_COST, FIREWORKS_TICKS, FIRST_EVENT_DAY,
  HEAT_THIRST, launchFireworks, updateEvents, type ParkEvent,
} from '../src/sim/events';
import { createGuest } from '../src/sim/guest';
import { stepGuests } from '../src/sim/sim';
import { updateSpawner } from '../src/sim/spawner';
import { DEFAULT_WEATHER_SEED, weatherKindOf } from '../src/sim/weather';
import { World } from '../src/sim/world';

function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
  return { w, g, ride };
}

/** seed에서 kind 이벤트가 있는 첫날의 이벤트 */
function findEvent(seed: number, kind: ParkEvent['kind']): ParkEvent {
  for (let d = FIRST_EVENT_DAY; d < 500; d++) {
    const e = eventOfDay(seed, d);
    if (e?.kind === kind) return e;
  }
  throw new Error(`no ${kind}`);
}

const SEED = 98765;

describe('random events schedule', () => {
  it('is deterministic, never on the first days, and roughly EVENT_CHANCE of days', () => {
    for (let d = 0; d < FIRST_EVENT_DAY; d++) expect(eventOfDay(SEED, d)).toBeNull();
    expect(eventOfDay(SEED, 40)).toEqual(eventOfDay(SEED, 40));
    const n = 5000;
    let count = 0;
    const kinds = new Set<string>();
    for (let d = FIRST_EVENT_DAY; d < FIRST_EVENT_DAY + n; d++) {
      const e = eventOfDay(SEED, d);
      if (!e) continue;
      count++;
      kinds.add(e.kind);
      // 하루 안에서 시작하고 끝난다
      expect(Math.floor(e.start / DAY_TICKS)).toBe(d);
      expect(e.end).toBeLessThanOrEqual((d + 1) * DAY_TICKS);
      if (e.kind === 'heatwave') expect(weatherKindOf(SEED, d)).toBe('sunny');
    }
    expect(count / n).toBeGreaterThan(EVENT_CHANCE - 0.03);
    expect(count / n).toBeLessThan(EVENT_CHANCE + 0.03);
    expect([...kinds].sort()).toEqual([...EVENT_KINDS].sort());
  });

  it('keeps the default (test) seed event-free for the first 12 days', () => {
    for (let d = 0; d < 12; d++) expect(eventOfDay(DEFAULT_WEATHER_SEED, d)).toBeNull();
  });

  it('is active only between start and end', () => {
    const e = findEvent(SEED, 'hype');
    expect(eventAtTick(SEED, e.start - 1)).toBeNull();
    expect(eventAtTick(SEED, e.start)).toEqual(e);
    expect(eventAtTick(SEED, e.end - 1)).toEqual(e);
    expect(eventAtTick(SEED, e.end)).toBeNull();
  });
});

describe('random event effects', () => {
  it('a tour bus brings a crowd once, who pay the entrance fee', () => {
    const { w } = makePark();
    w.weatherSeed = SEED;
    const e = findEvent(SEED, 'bus');
    w.tick = e.start;
    updateEvents(w);
    expect(w.guests.length).toBeGreaterThan(BUS_GUESTS / 2); // 입장료를 낼 돈이 없는 손님은 돌아간다
    expect(w.guests.length).toBeLessThanOrEqual(BUS_GUESTS);
    expect(w.stats.entered).toBe(w.guests.length);
    expect(w.ledger.entrance).toBe(w.guests.length * w.entranceFee);
    w.tick = e.start + 1;
    updateEvents(w);
    expect(w.stats.entered).toBe(w.guests.length); // 다시 오지 않는다
  });

  it('a heatwave makes guests thirsty faster', () => {
    const { w } = makePark();
    w.weatherSeed = SEED;
    const e = findEvent(SEED, 'heatwave');
    const g = createGuest(w);
    g.needs.thirst = 0;
    w.guests.push(g);
    w.event = e;
    stepGuests(w);
    const hot = g.needs.thirst;
    w.event = null;
    g.needs.thirst = 0;
    stepGuests(w);
    expect(hot - g.needs.thirst).toBeCloseTo(HEAT_THIRST, 5);
  });

  it('a blackout stops rides from boarding, then they resume', () => {
    const { w, ride } = makePark();
    w.weatherSeed = SEED;
    const g = createGuest(w);
    g.money = 100;
    w.guests.push(g);
    ride.queue.push(g.id);
    g.state = 'queueing';
    g.target = ride.id;
    w.event = findEvent(SEED, 'blackout');
    stepGuests(w);
    expect(ride.phase).toBe('idle');
    expect(ride.inside).toHaveLength(0);
    w.event = null;
    stepGuests(w);
    expect(ride.phase).toBe('loading');
  });

  it('hype and fireworks raise the chance of guests arriving', () => {
    const run = (setup: (w: World) => void): number => {
      const { w } = makePark();
      setup(w);
      for (let i = 0; i < 3000; i++) {
        updateSpawner(w);
        w.guests.length = 0; // 손님 상한에 닿지 않게
      }
      return w.stats.entered;
    };
    const normal = run(() => {});
    const hype = run((w) => { w.event = { kind: 'hype', start: 0, end: 1e9 }; });
    const show = run((w) => { w.fireworks = { start: 0, end: 1e9, x: 0, y: 0 }; });
    expect(hype).toBeGreaterThan(normal * 1.6);
    expect(show).toBeGreaterThan(normal * 1.25);
  });
});

describe('fireworks', () => {
  it('costs money, cheers everyone up and ends on time', () => {
    const { w } = makePark();
    const guests = Array.from({ length: 5 }, () => {
      const g = createGuest(w);
      g.needs.happiness = 50;
      w.guests.push(g);
      return g;
    });
    const money = w.money;
    expect(launchFireworks(w)).toBeNull();
    expect(w.money).toBe(money - FIREWORKS_COST);
    expect(w.ledger.fireworks).toBe(-FIREWORKS_COST);
    for (let i = 0; i < FIREWORKS_TICKS; i++) {
      updateEvents(w);
      w.tick++;
    }
    updateEvents(w);
    expect(w.fireworks).toBeNull();
    for (const g of guests) expect(g.needs.happiness).toBeGreaterThanOrEqual(50 + 14);
    expect(guests.some((g) => g.thought === 'fireworks')).toBe(true);
  });

  it('only once a day and only with enough money', () => {
    const { w } = makePark();
    expect(launchFireworks(w)).toBeNull();
    expect(launchFireworks(w)).not.toBeNull(); // 진행 중
    w.fireworks = null;
    expect(launchFireworks(w)).not.toBeNull(); // 같은 날
    w.tick += DAY_TICKS;
    w.money = FIREWORKS_COST - 1;
    expect(launchFireworks(w)).not.toBeNull();
    w.money = FIREWORKS_COST;
    expect(launchFireworks(w)).toBeNull();
  });

  it('survives save/load', () => {
    const { w } = makePark();
    launchFireworks(w);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.fireworks).toEqual(w.fireworks);
    expect(back.lastFireworksDay).toBe(w.lastFireworksDay);
    const data = serializeWorld(w);
    delete data.fireworks;
    delete data.lastFireworksDay;
    const old = deserializeWorld(data);
    expect(old.fireworks).toBeNull();
    expect(old.lastFireworksDay).toBe(-1);
  });
});
