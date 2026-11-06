import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { FOUNTAIN } from '../src/data/scenery';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { clockOf, darknessAt, isNight, MAX_DARK } from '../src/sim/daynight';
import { DAY_TICKS } from '../src/sim/economy';
import { launchFireworks, spawnVip, updateEvents } from '../src/sim/events';
import { createGuest, FOUNTAIN_GAIN, pickTarget, SCENERY_EVERY, SCENERY_GAIN, updateGuest, VIP_REWARD, VIP_TICKS } from '../src/sim/guest';
import { stepGuests } from '../src/sim/sim';
import { World } from '../src/sim/world';

/** 입구 위로 뻗은 길 + 회전목마(입구 (g.x, 38)) + 햄버거 가게 */
function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!;
  return { w, g, ride, shop };
}

describe('day and night', () => {
  it('runs from 9:00 to 23:00 each day', () => {
    expect(clockOf(0)).toEqual({ hour: 9, minute: 0 });
    expect(clockOf(DAY_TICKS / 2)).toEqual({ hour: 16, minute: 0 });
    expect(clockOf(DAY_TICKS - 1).hour).toBe(22);
    expect(clockOf(DAY_TICKS)).toEqual({ hour: 9, minute: 0 });
  });

  it('is bright in the afternoon, dark at night, and dawns at the start of a day', () => {
    expect(darknessAt(DAY_TICKS * 0.3)).toBe(0);
    expect(darknessAt(DAY_TICKS - 1)).toBeCloseTo(MAX_DARK, 5);
    expect(isNight(DAY_TICKS - 10)).toBe(true);
    expect(isNight(DAY_TICKS * 0.5)).toBe(false);
    expect(darknessAt(DAY_TICKS + 1)).toBeGreaterThan(0); // 동틀 무렵
    expect(isNight(DAY_TICKS + 1)).toBe(false);
    expect(darknessAt(1)).toBe(0); // 첫날 아침은 처음부터 밝다
    expect(darknessAt(DAY_TICKS + 40)).toBe(0);
  });

  it('doubles the fireworks cheer at night', () => {
    const gain = (tick: number): number => {
      const { w } = makePark();
      w.tick = tick;
      const g = createGuest(w);
      g.needs.happiness = 10;
      w.guests.push(g);
      launchFireworks(w);
      updateEvents(w);
      return g.needs.happiness - 10;
    };
    expect(gain(DAY_TICKS * 0.3)).toBe(1);
    expect(gain(DAY_TICKS - 100)).toBe(2);
  });
});

describe('fountain', () => {
  it('cheers up guests walking within 3 tiles more than ordinary scenery', () => {
    const { w, g } = makePark();
    const walker = () => {
      const guest = createGuest(w);
      guest.x = guest.px = g.x + 0.5;
      guest.y = guest.py = 44.5;
      guest.tile = { x: g.x, y: 44 };
      guest.state = 'walking';
      guest.path = [guest.tile, { x: g.x, y: 43 }];
      guest.pathIdx = 1;
      guest.pathVersion = w.map.version;
      guest.target = null;
      guest.needs.happiness = 50;
      guest.needs.hunger = guest.needs.thirst = guest.needs.toilet = 0;
      return guest;
    };
    // 다른 장식이 닿지 않는 3칸 떨어진 곳에 분수
    w.map.scenery[w.map.index(g.x - 3, 44)] = FOUNTAIN;
    const guest = walker();
    // 장식 판정 위상이 맞는 틱으로 맞춘다
    while ((w.tick + guest.id) % SCENERY_EVERY !== SCENERY_EVERY >> 1) w.tick++;
    const before = guest.needs.happiness;
    updateGuest(w, guest);
    expect(guest.needs.happiness - before).toBeCloseTo(SCENERY_GAIN + FOUNTAIN_GAIN, 1);
  });
});

describe('VIP guests', () => {
  it('arrive wishing for an operating ride, and prefer it strongly', () => {
    const { w, ride } = makePark();
    const vip = spawnVip(w)!;
    expect(vip).not.toBeNull();
    expect(vip.vip).toEqual({ wish: 'carousel', until: w.tick + VIP_TICKS, done: false });
    vip.needs.hunger = 90; // 배가 고파도 소원이 먼저
    expect(pickTarget(w, vip)?.b.id).toBe(ride.id);
  });

  it('do not come without an operating ride', () => {
    const w = new World();
    expect(spawnVip(w)).toBeNull();
    expect(w.guests).toHaveLength(0);
  });

  it('pay a reward when their wish comes true', () => {
    const { w } = makePark();
    const vip = spawnVip(w)!;
    const money = w.money;
    for (let i = 0; i < 800 && !vip.vip!.done; i++) stepGuests(w);
    expect(vip.vip!.done).toBe(true);
    expect(w.stats.vips).toBe(1);
    expect(w.ledger.missions).toBe(VIP_REWARD);
    expect(w.money).toBeGreaterThanOrEqual(money + VIP_REWARD);
    expect(vip.thought).toBe('vipHappy');
  });

  it('get disappointed after the deadline', () => {
    const { w } = makePark();
    const vip = spawnVip(w)!;
    const h = vip.needs.happiness;
    w.tick = vip.vip!.until;
    updateGuest(w, vip);
    expect(vip.vip).toBeUndefined();
    expect(vip.thought).toBe('vipSad');
    expect(vip.needs.happiness).toBeLessThan(h);
  });

  it('keep their wish through save/load; old saves have no VIP count', () => {
    const { w } = makePark();
    spawnVip(w);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.guests[0].vip).toEqual(w.guests[0].vip);
    const data = serializeWorld(w);
    delete (data.stats as { vips?: number }).vips;
    expect(deserializeWorld(data).stats.vips).toBe(0);
  });
});
