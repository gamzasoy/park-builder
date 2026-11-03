import { describe, expect, it } from 'vitest';
import { hash32 } from '../src/core/hash';
import { getDef } from '../src/data';
import { parseSave, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { createGuest, type Guest } from '../src/sim/guest';
import {
  breaksDown, INSPECT_BELOW, MAX_RELIABILITY, RELIABILITY_LOSS,
} from '../src/sim/ride';
import { stepGuests } from '../src/sim/sim';
import {
  hireStaff, INSPECT_GAIN, INSPECT_TICKS, REPAIR_GAIN, REPAIR_TICKS,
} from '../src/sim/staff';
import { World, type Building } from '../src/sim/world';
import { THOUGHT_TEXT } from '../src/render/thoughts';

/** 입구에서 위로 뻗은 길 + 회전목마(길 끝, 입구 = (g.x, 33)) */
function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 14 })); // y 47..33
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 31, 0)!;
  return { w, g, ride };
}

const step = (w: World, n = 1): void => { for (let i = 0; i < n; i++) stepGuests(w); };

function queueGuest(w: World, b: Building): Guest {
  const g = createGuest(w);
  g.state = 'queueing';
  g.target = b.id;
  g.tile = { ...b.entrance };
  g.x = g.px = b.entrance.x + 0.5;
  g.y = g.py = b.entrance.y + 0.5;
  w.guests.push(g);
  b.queue.push(g.id);
  return g;
}

/** 한 번의 운행이 끝나는 순간까지 진행 */
function runOneCycle(w: World, b: Building): void {
  const before = b.cycles;
  for (let i = 0; i < 400 && b.cycles === before; i++) step(w);
}

/** hash가 고장 판정에 걸리지 않는(또는 걸리는) 운행 횟수를 찾는다 */
function findCycles(b: Building, wantBreak: boolean): number {
  for (let c = 1; c < 5000; c++) {
    b.cycles = c;
    if (breaksDown(b) === wantBreak) return c;
  }
  throw new Error('no cycle found');
}

describe('reliability and breakdown', () => {
  it('new rides start at full reliability; shops never lose it', () => {
    const { w, g, ride } = makePark();
    expect(ride.reliability).toBe(MAX_RELIABILITY);
    expect(ride.broken).toBe(false);
    const shop = placeBuilding(w, getDef('burger'), g.x + 1, 40, 3)!;
    queueGuest(w, shop);
    step(w, 200);
    expect(shop.reliability).toBe(MAX_RELIABILITY);
    expect(shop.broken).toBe(false);
  });

  it('loses reliability on every completed cycle', () => {
    const { w, ride } = makePark();
    queueGuest(w, ride);
    runOneCycle(w, ride);
    expect(ride.cycles).toBe(1);
    expect(ride.reliability).toBe(MAX_RELIABILITY - RELIABILITY_LOSS);
  });

  it('breakdown roll is deterministic and follows (100-reliability)/400', () => {
    const { ride } = makePark();
    ride.reliability = 100;
    for (let c = 0; c < 200; c++) { ride.cycles = c; expect(breaksDown(ride)).toBe(false); }
    ride.reliability = 0; // 확률 25%
    let hits = 0;
    for (let c = 0; c < 2000; c++) {
      ride.cycles = c;
      const a = breaksDown(ride);
      expect(breaksDown(ride)).toBe(a);
      expect(a).toBe(hash32(ride.id, c, 7) / 0x100000000 < 0.25);
      if (a) hits++;
    }
    expect(hits).toBeGreaterThan(350);
    expect(hits).toBeLessThan(650);
  });

  it('breaks when the roll hits: not operational, queue evicted with a broken thought', () => {
    const { w, ride } = makePark();
    ride.reliability = 40;
    // 다음 운행이 끝날 때 판정에 걸리는 운행 횟수를 고른다(감소 후 신뢰도 38.5 기준)
    ride.reliability = 40 + RELIABILITY_LOSS;
    const c = findCycles(ride, true);
    ride.cycles = c - 1;
    const rider = queueGuest(w, ride);
    const waiting: Guest[] = [];
    runOneCycleAdmitting(w, ride, rider, waiting);
    expect(ride.broken).toBe(true);
    expect(w.network.isOperational(ride)).toBe(false);
    expect(ride.queue).toHaveLength(0);
    expect(ride.inside).toHaveLength(0);
    for (const q of waiting) {
      expect(q.state).toBe('idle');
      expect(q.thought).toBe('broken');
    }
    expect(THOUGHT_TEXT.broken.length).toBeGreaterThan(0);
  });

  it('a broken ride takes no new riders', () => {
    const { w, ride } = makePark();
    ride.broken = true;
    queueGuest(w, ride);
    step(w, 100);
    expect(ride.phase).toBe('idle');
    expect(ride.served).toBe(0);
  });

  it('does not break when the roll misses', () => {
    const { w, ride } = makePark();
    ride.reliability = 40 + RELIABILITY_LOSS;
    ride.cycles = findCycles(ride, false) - 1;
    queueGuest(w, ride);
    runOneCycle(w, ride);
    expect(ride.broken).toBe(false);
  });
});

/** 첫 손님을 태워 출발시킨 뒤 새 손님들을 줄 세우고, 운행이 끝날 때까지 진행 */
function runOneCycleAdmitting(w: World, b: Building, _first: Guest, waiting: Guest[]): void {
  const before = b.cycles;
  for (let i = 0; i < 400 && b.cycles === before; i++) {
    step(w);
    if (b.phase === 'running' && waiting.length === 0) {
      for (let k = 0; k < 3; k++) waiting.push(queueGuest(w, b));
    }
  }
}

describe('mechanic', () => {
  it('walks to a broken ride, repairs it in 60 ticks and restores reliability', () => {
    const { w, ride } = makePark();
    ride.reliability = 30;
    ride.broken = true;
    const m = hireStaff(w, 'mechanic')!;
    let repairedAt = -1;
    for (let i = 0; i < 600; i++) {
      step(w);
      if (m.state === 'working' && m.job === 'repair' && repairedAt < 0) repairedAt = w.tick;
      if (!ride.broken) break;
    }
    expect(repairedAt).toBeGreaterThan(0);
    expect(ride.broken).toBe(false);
    expect(ride.reliability).toBe(30 + REPAIR_GAIN);
    expect(w.tick - repairedAt).toBeGreaterThanOrEqual(REPAIR_TICKS - 1);
    expect(w.network.isOperational(ride)).toBe(true);
  });

  it('caps reliability at 100', () => {
    const { w, ride } = makePark();
    ride.reliability = 90;
    ride.broken = true;
    hireStaff(w, 'mechanic');
    step(w, 600);
    expect(ride.broken).toBe(false);
    expect(ride.reliability).toBe(MAX_RELIABILITY);
  });

  it('two mechanics do not pile onto the same broken ride', () => {
    const { w, ride } = makePark();
    ride.broken = true;
    const a = hireStaff(w, 'mechanic')!;
    const b = hireStaff(w, 'mechanic')!;
    let both = false;
    for (let i = 0; i < 600 && ride.broken; i++) {
      step(w);
      if (a.job === 'repair' && b.job === 'repair' && a.state !== 'idle' && b.state !== 'idle') both = true;
    }
    expect(both).toBe(false);
  });

  it('inspects the weakest ride below the threshold for a small recovery', () => {
    const { w, ride } = makePark();
    ride.reliability = INSPECT_BELOW - 20;
    const m = hireStaff(w, 'mechanic')!;
    let inspecting = 0;
    for (let i = 0; i < 600; i++) {
      step(w);
      if (m.state === 'working' && m.job === 'inspect') inspecting++;
      if (ride.reliability > INSPECT_BELOW - 20) break;
    }
    expect(inspecting).toBeGreaterThanOrEqual(INSPECT_TICKS - 1);
    expect(ride.reliability).toBe(INSPECT_BELOW - 20 + INSPECT_GAIN);
    expect(ride.broken).toBe(false);
  });

  it('ignores healthy rides and wanders', () => {
    const { w, ride } = makePark();
    const m = hireStaff(w, 'mechanic')!;
    step(w, 300);
    expect(ride.reliability).toBe(MAX_RELIABILITY);
    expect(m.state === 'idle' || m.state === 'walking').toBe(true);
  });
});

describe('save', () => {
  it('round-trips a broken ride and a mechanic, and continuing gives the same result', () => {
    const { w, ride } = makePark();
    ride.reliability = 50;
    ride.broken = true;
    ride.brokenTicks = 5;
    ride.cycles = 17;
    hireStaff(w, 'mechanic');
    step(w, 20); // 수리하러 걷는 중

    const loadedA = parseSave(JSON.stringify(serializeWorld(w)));
    if (!loadedA.ok) throw new Error('load failed');
    const copy = loadedA.world;
    const cb = [...copy.buildings.values()][0];
    expect(cb.broken).toBe(true);
    expect(cb.reliability).toBe(50);
    expect(cb.cycles).toBe(17);
    expect(copy.staff[0].kind).toBe('mechanic');

    step(w, 400);
    step(copy, 400);
    const a = [...w.buildings.values()][0];
    expect(cb.broken).toBe(a.broken);
    expect(cb.reliability).toBe(a.reliability);
    expect(cb.brokenTicks).toBe(a.brokenTicks);
    // pathVersion은 맵 버전 카운터라 불러오기 전후로 다르다(동작에는 영향 없음)
    const staffOf = (x: World) => serializeWorld(x).staff!.map(({ pathVersion: _v, ...rest }) => rest);
    expect(staffOf(copy)).toEqual(staffOf(w));
    expect(a.broken).toBe(false);
  });

  it('old saves without reliability fields load as healthy rides', () => {
    const { w } = makePark();
    const data = JSON.parse(JSON.stringify(serializeWorld(w)));
    for (const b of data.buildings) { delete b.reliability; delete b.broken; delete b.brokenTicks; delete b.cycles; }
    const res = parseSave(JSON.stringify(data));
    if (!res.ok) throw new Error('load failed');
    const loaded = res.world;
    const b = [...loaded.buildings.values()][0];
    expect(b.reliability).toBe(100);
    expect(b.broken).toBe(false);
    expect(b.brokenTicks).toBe(0);
    expect(b.cycles).toBe(0);
  });
});
