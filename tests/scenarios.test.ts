import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { loadRecords, recordStars, starText } from '../src/save/records';
import { deserializeWorld, serializeWorld, type KV } from '../src/save/save';
import { canPlaceBuilding } from '../src/sim/building';
import { DAY_TICKS } from '../src/sim/economy';
import { goalOf, goalProgress, updateGoals } from '../src/sim/goals';
import { createGuest } from '../src/sim/guest';
import { createScenarioWorld, deadlineTicks, scenarioById, scenarioOf, SCENARIOS, starsFor } from '../src/sim/scenarios';
import { stepWorld } from '../src/sim/sim';
import { World } from '../src/sim/world';

function fillGuests(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.guests.push(createGuest(w));
}

/** 목표를 채운 상태로 하루를 유지한다 */
function holdGoal(w: World): void {
  const g = goalOf(w);
  w.rating = g.rating;
  if (g.money !== undefined) w.money = g.money;
  fillGuests(w, g.guests);
  for (let i = 0; i < g.holdTicks && w.status === 'playing'; i++) { w.tick++; updateGoals(w); }
}

describe('scenarios', () => {
  it('each start with their own money, a clean ledger and their id', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      const w = createScenarioWorld(s.id, 42);
      expect(w.scenario).toBe(s.id);
      expect(w.money).toBe(s.money);
      expect(Object.values(w.ledger).every((v) => v === 0)).toBe(true);
      expect(w.map.isPath(w.map.gate.x, w.map.gate.y)).toBe(true);
      expect(w.status).toBe('playing');
    }
  });

  it('unknown ids fall back to the meadow', () => {
    const w = createScenarioWorld('nope', 1);
    expect(w.scenario).toBe('meadow');
    expect(scenarioOf(new World()).id).toBe('meadow');
  });

  it('hills: rolling terrain with no step over 1, a flat gate area, shaped by the seed', () => {
    const w = createScenarioWorld('hills', 7);
    const m = w.map;
    let raised = 0;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const h = m.heightAt(x, y);
        if (h > 0) raised++;
        if (x + 1 < m.width) expect(Math.abs(h - m.heightAt(x + 1, y))).toBeLessThanOrEqual(1);
        if (y + 1 < m.height) expect(Math.abs(h - m.heightAt(x, y + 1))).toBeLessThanOrEqual(1);
      }
    }
    expect(raised).toBeGreaterThan(m.width * m.height * 0.3);
    for (let dx = -8; dx <= 8; dx++) expect(m.heightAt(m.gate.x + dx, m.height - 2)).toBe(0);
    // 입구 앞에는 건물을 지을 평지가 있다
    expect(canPlaceBuilding(w, getDef('carousel'), m.gate.x - 3, m.height - 5, 0).ok).toBe(true);
    const same = createScenarioWorld('hills', 7), other = createScenarioWorld('hills', 8);
    expect(Array.from(same.map.terrain)).toEqual(Array.from(m.terrain));
    expect(Array.from(other.map.terrain)).not.toEqual(Array.from(m.terrain));
  });

  it('forest: dense trees except the clearing in front of the gate', () => {
    const w = createScenarioWorld('forest', 3);
    const m = w.map;
    const trees = m.scenery.reduce((a, v) => a + (v ? 1 : 0), 0);
    expect(trees).toBeGreaterThan(m.width * m.height * 0.5);
    expect(m.sceneryAt(m.gate.x, m.height - 7)).toBe(0);
    expect(m.sceneryAt(m.gate.x + 3, m.height - 5)).toBe(0);
  });

  it('revival: a run-down park — connected rides, one broken, dirty paths, double prices, low rating', () => {
    const w = createScenarioWorld('revival', 5);
    const rides = [...w.buildings.values()];
    expect(rides.length).toBe(7);
    for (const b of rides) {
      expect(w.map.isPath(b.entrance.x, b.entrance.y)).toBe(true);
      expect(b.price).toBeGreaterThan(getDef(b.defId).price);
    }
    expect(rides.filter((b) => b.broken)).toHaveLength(1);
    expect(rides.filter((b) => !b.broken).every((b) => w.network.isOperational(b))).toBe(true);
    expect(w.map.litter.reduce((a, v) => a + v, 0)).toBeGreaterThan(10);
    expect(w.rating).toBeLessThan(300);
    expect(w.money).toBe(scenarioById('revival')!.money);
    // 손님이 들어와 돌아다닌다
    for (let i = 0; i < 2000; i++) stepWorld(w);
    expect(w.stats.entered).toBeGreaterThan(0);
  });
});

describe('scenario goals', () => {
  it('use the scenario targets and deadline', () => {
    const w = createScenarioWorld('forest', 1);
    const s = scenarioById('forest')!;
    expect(goalOf(w)).toMatchObject({ months: s.months, guests: s.guests, rating: s.rating, deadline: deadlineTicks(s) });
    expect(goalProgress(w).remainingDays).toBe(s.months * 10);
    w.tick = deadlineTicks(s);
    updateGoals(w);
    expect(w.status).toBe('lost');
    expect(w.endReason).toContain(`${s.months}개월`);
  });

  it('tycoon also needs the money target', () => {
    const w = createScenarioWorld('tycoon', 1);
    const g = goalOf(w);
    expect(g.money).toBe(50000);
    w.rating = g.rating;
    fillGuests(w, g.guests);
    w.money = g.money! - 1;
    for (let i = 0; i < g.holdTicks + 5; i++) { w.tick++; updateGoals(w); }
    expect(w.status).toBe('playing');
    expect(goalProgress(w).moneyMet).toBe(false);
    w.money = g.money!;
    for (let i = 0; i < g.holdTicks; i++) { w.tick++; updateGoals(w); }
    expect(w.status).toBe('won');
  });

  it('award more stars the earlier the park wins', () => {
    const s = scenarioById('meadow')!;
    const d = deadlineTicks(s);
    expect(starsFor(s, 0)).toBe(3);
    expect(starsFor(s, d * 0.5)).toBe(3);
    expect(starsFor(s, d * 0.5 + 1)).toBe(2);
    expect(starsFor(s, d * 0.75)).toBe(2);
    expect(starsFor(s, d * 0.75 + 1)).toBe(1);

    const fast = createScenarioWorld('meadow', 1);
    holdGoal(fast);
    expect(fast.status).toBe('won');
    expect(fast.stars).toBe(3);
    const slow = createScenarioWorld('meadow', 1);
    slow.tick = d - 2 * DAY_TICKS;
    holdGoal(slow);
    expect(slow.stars).toBe(1);
  });

  it('save the scenario and stars', () => {
    const w = createScenarioWorld('hills', 9);
    w.stars = 2;
    const back = deserializeWorld(serializeWorld(w));
    expect(back.scenario).toBe('hills');
    expect(back.stars).toBe(2);
    expect(Array.from(back.map.terrain)).toEqual(Array.from(w.map.terrain));
    // 시나리오가 없는 예전 저장본은 초원
    const old = serializeWorld(new World());
    delete old.scenario;
    delete old.stars;
    expect(deserializeWorld(old).scenario).toBe('meadow');
  });
});

describe('star records', () => {
  const mem = (): KV => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('keep only the best stars per scenario', () => {
    const kv = mem();
    expect(loadRecords(kv)).toEqual({});
    expect(recordStars('hills', 2, kv)).toBe(true);
    expect(recordStars('hills', 1, kv)).toBe(false);
    expect(recordStars('hills', 3, kv)).toBe(true);
    expect(recordStars('forest', 1, kv)).toBe(true);
    expect(loadRecords(kv)).toEqual({ hills: 3, forest: 1 });
    kv.setItem('park-builder-records', 'not json');
    expect(loadRecords(kv)).toEqual({});
    expect(starText(2)).toBe('★★☆');
  });
});
