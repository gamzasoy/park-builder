import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { demolishAt, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { createGuest, MAX_QUEUE, PATIENCE, type Guest } from '../src/sim/guest';
import { LOAD_TICKS } from '../src/sim/ride';
import { stepGuests } from '../src/sim/sim';
import type { Building } from '../src/sim/world';
import { World } from '../src/sim/world';

function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 })); // y 47..39
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!; // 입구 (g.x,38), 정원 6, 요금 20, 80틱
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!; // 입구 (g.x,43), 정원 1, 요금 25, 30틱
  return { w, g, ride, shop };
}

/** 이미 입구에서 줄 서 있는 손님을 직접 만든다 */
function enqueue(w: World, b: Building, tweak?: (g: Guest) => void): Guest {
  const guest = createGuest(w);
  guest.x = guest.px = b.entrance.x + 0.5;
  guest.y = guest.py = b.entrance.y + 0.5;
  guest.tile = { ...b.entrance };
  guest.pathVersion = w.map.version;
  guest.state = 'queueing';
  guest.target = b.id;
  guest.money = 200;
  guest.needs.hunger = 90;
  tweak?.(guest);
  b.queue.push(guest.id);
  w.guests.push(guest);
  return guest;
}

const step = (w: World, n = 1): void => { for (let i = 0; i < n; i++) stepGuests(w); };

describe('ride cycle', () => {
  it('boards up to capacity, runs, then releases riders (a second batch follows)', () => {
    const { w, ride } = makePark();
    const guests = Array.from({ length: 8 }, () => enqueue(w, ride));
    const before = w.money;

    step(w, 3);
    expect(ride.phase).toBe('running');
    expect(ride.inside).toHaveLength(6); // 정원
    expect(ride.queue).toHaveLength(2);
    expect(w.money).toBe(before + 6 * getDef('carousel').price);
    expect(guests.slice(0, 6).every((g) => g.state === 'visiting')).toBe(true);
    expect(guests.slice(6).every((g) => g.state === 'queueing')).toBe(true);

    // 운행이 끝나면 첫 6명이 내리고(이 틱엔 다음 사이클이 아직 시작 전) 2명은 대기 중
    let guard = 0;
    while (ride.inside.length > 0 && guard++ < 200) step(w);
    expect(guests.slice(0, 6).every((g) => g.state !== 'visiting')).toBe(true); // 내리자마자 다음 목표를 고를 수도 있음
    expect(ride.phase).toBe('idle');
    expect(ride.inside).toHaveLength(0);
    expect(ride.queue).toHaveLength(2);
    expect(guests[0].needs.happiness).toBeGreaterThan(70);

    // 다음 틱에 남은 2명이 바로 탑승, 정원이 안 차도 LOAD_TICKS 후 출발
    step(w, 1);
    expect(ride.phase).toBe('loading');
    expect(ride.inside).toHaveLength(2);
    step(w, LOAD_TICKS + 2);
    expect(ride.phase).toBe('running');
    expect(ride.served).toBe(8);
    expect(ride.income).toBe(8 * getDef('carousel').price);
  });

  it('waits for passengers up to LOAD_TICKS and never departs empty', () => {
    const { w, ride } = makePark();
    step(w, 100);
    expect(ride.phase).toBe('idle'); // 손님 없음 → 그대로

    const g = enqueue(w, ride);
    step(w, 2);
    expect(ride.phase).toBe('loading');
    expect(g.state).toBe('visiting');
    step(w, LOAD_TICKS);
    expect(ride.phase).toBe('running');
    step(w, 80);
    expect(ride.phase).toBe('idle');
    expect(g.state).not.toBe('visiting');
  });

  it('does not accept new riders while its entrance is cut off from the gate', () => {
    const { w, g, ride } = makePark();
    demolishAt(w, g.x, 42); // 길 중간 끊기 (손님은 입구 타일(38)에 서 있음)
    const guest = enqueue(w, ride);
    step(w, 50);
    expect(ride.inside).toHaveLength(0);
    expect(guest.state).toBe('queueing');
    expect(ride.phase).toBe('idle');
  });
});

describe('shop service', () => {
  it('serves capacity-many customers at a time, in queue order', () => {
    const { w, shop } = makePark();
    const a = enqueue(w, shop);
    const b = enqueue(w, shop);
    const c = enqueue(w, shop);
    const before = w.money;

    step(w, 1);
    expect(shop.inside).toEqual([a.id]);
    expect(shop.queue).toEqual([b.id, c.id]);
    expect(w.money).toBe(before + getDef('burger').price);
    expect([b.slot, c.slot]).toEqual([0, 1]);

    step(w, 30);
    expect(a.state).not.toBe('visiting');
    expect(a.needs.hunger).toBeLessThan(40); // 90 - 70
    expect(shop.inside).toEqual([b.id]);

    step(w, 31);
    expect(shop.inside).toEqual([c.id]);
    expect(shop.served).toBe(3);
  });

  it('a two-slot facility serves two at once', () => {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 3 }));
    const wc = placeBuilding(w, getDef('toilet'), g.x + 1, g.y - 3, 3)!; // 입구 (g.x, ...)
    expect(w.network.isOperational(wc)).toBe(true);
    enqueue(w, wc); enqueue(w, wc); enqueue(w, wc);
    step(w, 1);
    expect(wc.inside).toHaveLength(2);
    expect(wc.queue).toHaveLength(1);
  });
});

describe('queue rules', () => {
  it('refuses to join a full queue and loses a little happiness', () => {
    const { w, ride } = makePark();
    ride.phase = 'running'; // 줄이 줄어들지 않게 운행 고정
    ride.timer = 10_000;
    for (let i = 0; i < MAX_QUEUE; i++) enqueue(w, ride);

    const newcomer = createGuest(w);
    newcomer.state = 'walking';
    newcomer.target = ride.id;
    newcomer.x = newcomer.px = ride.entrance.x + 0.5;
    newcomer.y = newcomer.py = ride.entrance.y + 0.5;
    newcomer.tile = { ...ride.entrance };
    newcomer.path = [ride.entrance];
    newcomer.pathIdx = 1;
    newcomer.pathVersion = w.map.version;
    newcomer.money = 200;
    const h0 = newcomer.needs.happiness;
    w.guests.push(newcomer);

    step(w, 1);
    expect(ride.queue).toHaveLength(MAX_QUEUE);
    expect(newcomer.state).toBe('idle');
    expect(newcomer.needs.happiness).toBeLessThan(h0);
    expect(newcomer.visited).toContain(ride.id);
  });

  it('gives up after PATIENCE ticks, unhappier', () => {
    const { w, ride } = makePark();
    ride.phase = 'running';
    ride.timer = 10_000;
    const g = enqueue(w, ride);
    const h0 = g.needs.happiness;
    step(w, PATIENCE);
    expect(g.state).toBe('queueing');
    step(w, 2);
    expect(g.state).toBe('idle');
    expect(ride.queue).toHaveLength(0);
    expect(g.needs.happiness).toBeLessThan(h0);
  });

  it('prefers the attraction with the shorter queue', () => {
    const { w, g, ride: busy } = makePark();
    // 첫 놀이기구(x=g.x, y=36~37)를 옆으로 우회하는 길
    placePaths(w, lineTiles({ x: g.x + 1, y: 38 }, { x: g.x + 1, y: 34 }));
    placePaths(w, [{ x: g.x, y: 34 }]);
    const quiet = placeBuilding(w, getDef('carousel'), g.x - 1, 32, 0)!; // 입구 (g.x, 34), 더 멀다
    expect(w.network.isOperational(quiet)).toBe(true);

    busy.phase = 'running'; // 줄이 줄어들지 않게 운행 고정
    busy.timer = 10_000;
    for (let i = 0; i < 10; i++) enqueue(w, busy);

    const guest = createGuest(w);
    guest.needs.hunger = 0; guest.needs.thirst = 0; guest.needs.toilet = 0;
    w.guests.push(guest);
    step(w, 20);
    expect(guest.target).toBe(quiet.id);
  });
});

describe('demolishing a busy venue', () => {
  it('releases queued and riding guests and removes the building', () => {
    const { w, ride } = makePark();
    const guests = Array.from({ length: 8 }, () => enqueue(w, ride));
    step(w, 3); // 6명 탑승, 2명 대기
    expect(ride.inside).toHaveLength(6);

    demolishAt(w, ride.x, ride.y);
    expect(w.buildings.has(ride.id)).toBe(false);
    expect(guests.every((g) => g.state === 'idle' && g.target === null)).toBe(true);
    expect(ride.queue).toHaveLength(0);
    expect(ride.inside).toHaveLength(0);
    step(w, 10); // 이후 틱에서도 문제 없음
  });
});
