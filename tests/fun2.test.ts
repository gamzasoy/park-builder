import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { demolishAt, lineTiles, placeBuilding, placePaths, REFUND_RATE, upgradeRide } from '../src/sim/building';
import { buildingDef, MAX_LEVEL, UPGRADE_FUN, upgradeCost } from '../src/sim/coaster';
import { DAY_TICKS, fairPrice } from '../src/sim/economy';
import { updateEvents } from '../src/sim/events';
import { createGuest } from '../src/sim/guest';
import { cleanParkName, MAX_PARK_NAME } from '../src/sim/park';
import { RAINBOW_TICKS, rainbowAt, weatherKindOf } from '../src/sim/weather';
import { World } from '../src/sim/world';
import { withObj, withRo } from '../src/ui/josa';

function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!;
  return { w, g, ride, shop };
}

describe('ride upgrades', () => {
  it('raise fun, fair price and upkeep up to MAX_LEVEL', () => {
    const { w, ride } = makePark();
    const base = buildingDef(ride);
    const cost = upgradeCost(ride)!;
    const money = w.money;
    expect(upgradeRide(w, ride)).toBeNull();
    expect(ride.level).toBe(2);
    expect(w.money).toBe(money - cost);
    const up = buildingDef(ride);
    expect(up.fun).toBe((base.fun ?? 0) + UPGRADE_FUN);
    expect(up.upkeep).toBeGreaterThan(base.upkeep);
    expect(fairPrice(up)).toBeGreaterThan(fairPrice(base));
    for (let lv = 3; lv <= MAX_LEVEL; lv++) expect(upgradeRide(w, ride)).toBeNull();
    expect(upgradeCost(ride)).toBeNull();
    expect(upgradeRide(w, ride)).not.toBeNull();
    expect(ride.level).toBe(MAX_LEVEL);
  });

  it('are only for rides, need money, and refund part of the upgrade on demolish', () => {
    const { w, ride, shop } = makePark();
    expect(upgradeCost(shop)).toBeNull();
    expect(upgradeRide(w, shop)).not.toBeNull();
    w.money = upgradeCost(ride)! - 1;
    expect(upgradeRide(w, ride)).not.toBeNull();
    w.money = 100000;
    upgradeRide(w, ride);
    const money = w.money;
    const refund = Math.floor(buildingDef(ride).cost * REFUND_RATE);
    demolishAt(w, ride.x, ride.y);
    expect(w.money - money).toBe(refund);
    expect(refund).toBeGreaterThan(Math.floor(getDef('carousel').cost * REFUND_RATE));
  });

  it('survive save/load (old saves are level 1)', () => {
    const { w, ride } = makePark();
    upgradeRide(w, ride);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.buildings.get(ride.id)!.level).toBe(2);
    const data = serializeWorld(w);
    for (const b of data.buildings) delete b.level;
    expect(buildingDef(deserializeWorld(data).buildings.get(ride.id)!).fun).toBe(getDef('carousel').fun);
  });
});

describe('park name', () => {
  it('is trimmed and limited in length', () => {
    expect(cleanParkName('  행복   랜드 \n')).toBe('행복 랜드');
    expect([...cleanParkName('가나다라마바사아자차카')].length).toBe(MAX_PARK_NAME);
  });

  it('is saved, and old saves have none', () => {
    const w = new World();
    w.parkName = '감자랜드';
    expect(deserializeWorld(serializeWorld(w)).parkName).toBe('감자랜드');
    const data = serializeWorld(w);
    delete data.parkName;
    expect(deserializeWorld(data).parkName).toBe('');
  });
});

describe('rainbow', () => {
  const SEED = 98765;
  const rainThenDry = (): number => {
    for (let d = 1; d < 500; d++) {
      if (weatherKindOf(SEED, d - 1) === 'rain' && weatherKindOf(SEED, d) !== 'rain') return d;
    }
    throw new Error('none');
  };

  it('appears on the morning after rain only', () => {
    const d = rainThenDry();
    expect(rainbowAt(SEED, d * DAY_TICKS)).toBe(true);
    expect(rainbowAt(SEED, d * DAY_TICKS + RAINBOW_TICKS - 1)).toBe(true);
    expect(rainbowAt(SEED, d * DAY_TICKS + RAINBOW_TICKS)).toBe(false);
    for (let day = 1; day < 300; day++) {
      if (rainbowAt(SEED, day * DAY_TICKS)) {
        expect(weatherKindOf(SEED, day - 1)).toBe('rain');
        expect(weatherKindOf(SEED, day)).not.toBe('rain');
      }
    }
  });

  it('cheers guests up while it lasts', () => {
    const w = new World();
    w.weatherSeed = SEED;
    w.tick = rainThenDry() * DAY_TICKS;
    const g = createGuest(w);
    g.needs.happiness = 50;
    w.guests.push(g);
    updateEvents(w);
    expect(g.needs.happiness).toBe(51);
  });
});

describe('korean particles', () => {
  it('picks 을/를 and 으로/로 by the final consonant', () => {
    expect(withObj('회전목마')).toBe('회전목마를');
    expect(withObj('정비공')).toBe('정비공을');
    expect(withRo('행복랜드')).toBe('행복랜드로');
    expect(withRo('감자공원')).toBe('감자공원으로');
    expect(withRo('서울')).toBe('서울로');
    expect(withRo('PARK')).toBe('PARK로');
  });
});
