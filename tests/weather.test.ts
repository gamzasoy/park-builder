import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { getDef } from '../src/data';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { DAY_TICKS } from '../src/sim/economy';
import { createGuest, pickTarget, type Guest } from '../src/sim/guest';
import { stepGuests, stepWorld } from '../src/sim/sim';
import { updateSpawner } from '../src/sim/spawner';
import { updateWeather, weatherAtTick, weatherKindOf, type WeatherKind } from '../src/sim/weather';
import { World } from '../src/sim/world';
import { deserializeWorld, serializeWorld } from '../src/save/save';

const setWeather = (w: World, kind: WeatherKind): void => {
  w.weather = { kind, untilTick: Number.MAX_SAFE_INTEGER };
};

/** 입구에서 위로 뻗은 길과 지정한 시설(회전목마 등 크기 2x2는 (g.x-1,36), 1x1은 길 옆 (g.x+1,43)) */
function park(ride?: string, shop?: string) {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  if (ride) placeBuilding(w, getDef(ride), g.x - 1, 36, 0);
  if (shop) placeBuilding(w, getDef(shop), g.x + 1, 43, 3);
  return { w, g };
}

function calmGuest(w: World, tweak?: (g: Guest) => void): Guest {
  const g = createGuest(w);
  g.needs = { happiness: 80, hunger: 0, thirst: 0, toilet: 0, energy: 100 };
  g.money = 100;
  tweak?.(g);
  w.guests.push(g);
  w.guestById = new Map(w.guests.map((x) => [x.id, x]));
  return g;
}

describe('weather per day', () => {
  it('is deterministic for a seed and day, and day 0 is always sunny', () => {
    for (let seed = 1; seed < 200; seed += 7) {
      expect(weatherKindOf(seed, 0)).toBe('sunny');
      for (let d = 1; d < 30; d++) expect(weatherKindOf(seed, d)).toBe(weatherKindOf(seed, d));
    }
    const a = Array.from({ length: 40 }, (_, d) => weatherKindOf(12345, d));
    const b = Array.from({ length: 40 }, (_, d) => weatherKindOf(12345, d));
    expect(a).toEqual(b);
    expect(Array.from({ length: 40 }, (_, d) => weatherKindOf(999, d))).not.toEqual(a);
  });

  it('roughly follows 55 / 25 / 20 percent over many days', () => {
    const n = 20000;
    const c = { sunny: 0, cloudy: 0, rain: 0 };
    for (let d = 1; d <= n; d++) c[weatherKindOf(4242, d)]++;
    expect(c.sunny / n).toBeGreaterThan(0.52);
    expect(c.sunny / n).toBeLessThan(0.58);
    expect(c.cloudy / n).toBeGreaterThan(0.22);
    expect(c.cloudy / n).toBeLessThan(0.28);
    expect(c.rain / n).toBeGreaterThan(0.17);
    expect(c.rain / n).toBeLessThan(0.23);
  });

  it('updates at day boundaries without touching world.rng', () => {
    const w = new World();
    w.weatherSeed = 31337;
    const rngBefore = w.rng.state;
    expect(w.weather).toEqual({ kind: 'sunny', untilTick: DAY_TICKS });
    for (let day = 1; day < 12; day++) {
      w.tick = day * DAY_TICKS - 1;
      updateWeather(w);
      const prev = w.weather;
      w.tick = day * DAY_TICKS;
      updateWeather(w);
      expect(w.weather).toEqual(weatherAtTick(31337, w.tick));
      expect(w.weather.kind).toBe(weatherKindOf(31337, day));
      expect(w.weather.untilTick).toBe((day + 1) * DAY_TICKS);
      expect(prev.untilTick).toBe(day * DAY_TICKS);
    }
    expect(w.rng.state).toBe(rngBefore);
  });

  it('stepWorld switches to the new weather at the day boundary', () => {
    const w = new World();
    w.tick = DAY_TICKS;
    let seed = 1;
    while (weatherKindOf(seed, 1) !== 'rain') seed++;
    w.weatherSeed = seed;
    stepWorld(w);
    expect(w.weather.kind).toBe('rain');
  });
});

describe('rain effects', () => {
  it('lowers the spawn rate', () => {
    const count = (kind: WeatherKind): number => {
      const { w } = park('carousel');
      w.rng = new Rng(2024);
      setWeather(w, kind);
      for (let i = 0; i < 4000; i++) {
        w.guests = []; // 상한과 무관하게 입장 횟수만 센다
        updateSpawner(w);
      }
      return w.stats.entered;
    };
    const sunny = count('sunny');
    const rain = count('rain');
    expect(sunny).toBeGreaterThan(100);
    expect(rain).toBeLessThan(sunny * 0.85);
    expect(rain).toBeGreaterThan(sunny * 0.55);
  });

  it('makes guests without an umbrella shun outdoor rides, and an umbrella removes the penalty', () => {
    const results = { sunny: 0, rain: 0, rainUmbrella: 0 };
    const { w } = park('carousel');
    const g = calmGuest(w);
    for (let i = 0; i < 40; i++) { // pickTarget이 world.rng를 쓰므로 호출마다 다른 값이 나온다
      g.umbrella = false;
      setWeather(w, 'sunny');
      if (pickTarget(w, g)) results.sunny++;
      setWeather(w, 'rain');
      if (pickTarget(w, g)) results.rain++;
      g.umbrella = true;
      if (pickTarget(w, g)) results.rainUmbrella++;
    }
    expect(results.sunny).toBe(40);
    expect(results.rainUmbrella).toBe(40);
    expect(results.rain).toBeLessThan(40);
  });

  it('does not penalise indoor rides', () => {
    const { w } = park('drop');
    const g = calmGuest(w);
    setWeather(w, 'rain');
    expect(getDef('drop').outdoor).toBeUndefined();
    expect(pickTarget(w, g)).not.toBeNull();
  });

  it('marks the four outdoor rides', () => {
    for (const id of ['carousel', 'wheel', 'bumper', 'coaster']) expect(getDef(id).outdoor).toBe(true);
  });

  it('wears down happiness of guests without an umbrella, with a rain thought', () => {
    const { w } = park('carousel');
    setWeather(w, 'rain');
    const wet = calmGuest(w);
    const dry = calmGuest(w, (g) => { g.umbrella = true; });
    for (let i = 0; i < 90; i++) {
      wet.state = 'walking'; dry.state = 'walking';
      wet.target = dry.target = null;
      wet.path = dry.path = [];
      wet.pathIdx = dry.pathIdx = 0;
      stepGuests(w);
      wet.state = dry.state = 'idle';
    }
    expect(wet.needs.happiness).toBeLessThan(80);
    expect(dry.needs.happiness).toBe(80);
    expect(wet.thought).toBe('rain');
  });
});

describe('umbrella shop', () => {
  it('is only wanted in the rain by guests without an umbrella', () => {
    const { w } = park(undefined, 'umbrella');
    const g = calmGuest(w);
    setWeather(w, 'sunny');
    expect(pickTarget(w, g)).toBeNull();
    setWeather(w, 'cloudy');
    expect(pickTarget(w, g)).toBeNull();
    setWeather(w, 'rain');
    expect(pickTarget(w, g)?.b.defId).toBe('umbrella');
    g.umbrella = true;
    expect(pickTarget(w, g)).toBeNull();
  });

  it('sells an umbrella: the guest pays and keeps it', () => {
    const { w } = park(undefined, 'umbrella');
    setWeather(w, 'rain');
    const g = calmGuest(w);
    const money = g.money;
    for (let i = 0; i < 600 && !g.umbrella; i++) stepGuests(w);
    expect(g.umbrella).toBe(true);
    expect(g.money).toBe(money - getDef('umbrella').price);
    expect(w.ledger.shops).toBeGreaterThan(0);
  });
});

describe('save', () => {
  it('round-trips weather and umbrellas, and the loaded world continues identically', () => {
    let seed = 1;
    while (weatherKindOf(seed, 1) !== 'rain') seed++;
    const { w } = park('carousel', 'umbrella');
    w.weatherSeed = seed;
    for (let i = 0; i < DAY_TICKS + 400; i++) stepWorld(w);
    expect(w.weather.kind).toBe('rain');
    expect(w.guests.some((g) => g.umbrella)).toBe(true);

    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(back.weather).toEqual(w.weather);
    expect(back.weatherSeed).toBe(seed);
    expect(back.guests.map((g) => g.umbrella)).toEqual(w.guests.map((g) => g.umbrella));

    const target = new World();
    target.adopt(back);
    for (let i = 0; i < 1200; i++) { stepWorld(w); stepWorld(target); }
    const strip = (x: World) => {
      const d = serializeWorld(x);
      return { ...d, savedAt: 0, guests: d.guests.map(({ pathVersion: _v, ...g }) => g) };
    };
    expect(strip(target)).toEqual(strip(w));
  });

  it('reads older saves without weather fields (defaults, weather recomputed from the tick)', () => {
    const { w } = park('carousel');
    w.tick = DAY_TICKS * 3 + 5;
    const data = JSON.parse(JSON.stringify(serializeWorld(w)));
    delete data.weather;
    delete data.weatherSeed;
    for (const g of data.guests) delete g.umbrella;
    const back = deserializeWorld(data);
    expect(back.weather).toEqual(weatherAtTick(back.weatherSeed, back.tick));
    expect(back.guests.every((g) => g.umbrella === false)).toBe(true);
  });
});
