import { afterEach, describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { ToolController } from '../src/input/tools';
import { guestDisplayPos } from '../src/render/guestpos';
import { THOUGHT_TEXT } from '../src/render/thoughts';
import { deserializeWorld, serializeWorld, type KV } from '../src/save/save';
import { demolishAt, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { setPrice } from '../src/sim/economy';
import { createGuest, MAX_QUEUE, PATIENCE, THOUGHT_TICKS, type Guest } from '../src/sim/guest';
import { stepGuests } from '../src/sim/sim';
import { World, type Building } from '../src/sim/world';
import { Sound } from '../src/ui/sound';

function makePark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  const ride = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!;
  return { w, g, ride, shop };
}

function addGuest(w: World, tweak?: (g: Guest) => void): Guest {
  const guest = createGuest(w);
  tweak?.(guest);
  w.guests.push(guest);
  return guest;
}

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

describe('thoughts', () => {
  it('urgent needs surface as thoughts and fade after THOUGHT_TICKS', () => {
    const { w } = makePark();
    const g = addGuest(w, (x) => { x.needs.hunger = 95; x.needs.thirst = 0; x.needs.toilet = 0; x.target = null; x.state = 'visiting'; });
    g.state = 'visiting'; // 시설 안에 있는 것으로 두어 다른 행동 없이 생각만 관찰
    g.target = 999;
    step(w, 31);
    expect(g.thought).toBe('hungry');
    g.needs.hunger = 0; // 해소
    step(w, THOUGHT_TICKS + 1);
    expect(g.thought).toBeNull();
  });

  it('shows one thought per need with the right priority', () => {
    const { w } = makePark();
    const mk = (tweak: (g: Guest) => void) => {
      const g = addGuest(w, (x) => { x.state = 'visiting'; x.target = 999; x.needs.hunger = 0; x.needs.thirst = 0; x.needs.toilet = 0; x.needs.energy = 100; x.needs.happiness = 90; tweak(x); });
      return g;
    };
    const thirsty = mk((x) => { x.needs.thirst = 90; });
    const toilet = mk((x) => { x.needs.toilet = 90; });
    const tired = mk((x) => { x.needs.energy = 10; });
    const sad = mk((x) => { x.needs.happiness = 10; });
    const both = mk((x) => { x.needs.hunger = 90; x.needs.thirst = 90; });
    step(w, 31);
    expect(thirsty.thought).toBe('thirsty');
    expect(toilet.thought).toBe('toilet');
    expect(tired.thought).toBe('tired');
    expect(sad.thought).toBe('unhappy');
    expect(both.thought).toBe('hungry'); // 배고픔이 갈증보다 우선
  });

  it('riders think it was fun', () => {
    const { w, ride } = makePark();
    const g = enqueue(w, ride, (x) => { x.needs.hunger = 0; });
    let guard = 0;
    while (g.thought !== 'fun' && guard++ < 400) step(w);
    expect(g.thought).toBe('fun');
  });

  it('refusing a full queue and running out of patience leave matching thoughts', () => {
    const { w, ride } = makePark();
    ride.phase = 'running';
    ride.timer = 100_000;
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
    w.guests.push(newcomer);
    step(w, 1);
    expect(newcomer.thought).toBe('queueFull');

    const w2 = makePark();
    w2.ride.phase = 'running';
    w2.ride.timer = 100_000;
    const waiter = enqueue(w2.w, w2.ride);
    step(w2.w, PATIENCE + 2);
    expect(waiter.thought).toBe('waited');
  });

  it('says why it is leaving', () => {
    const { w, g } = makePark();
    // 입구에서 막 생성된 손님은 퇴장 경로가 한 칸이라 같은 틱에 사라지므로, 입구에서 떨어진 길 위에 둔다
    const away = (x: Guest): void => {
      x.x = x.px = g.x + 0.5;
      x.y = x.py = 41.5;
      x.tile = { x: g.x, y: 41 };
    };
    const sad = addGuest(w, (x) => { away(x); x.needs.happiness = 5; });
    const broke = addGuest(w, (x) => { away(x); x.money = 3; });
    const old = addGuest(w, (x) => { away(x); x.age = 9001; });
    step(w, 6);
    expect(sad.state).toBe('leaving');
    expect(sad.thought).toBe('unhappy');
    expect(broke.state).toBe('leaving');
    expect(broke.thought).toBe('broke');
    expect(old.state).toBe('leaving');
    expect(old.thought).toBe('tooOld');
  });

  it('complains about prices when only overpriced attractions are left, otherwise says it is bored', () => {
    const { w, ride, shop } = makePark();
    setPrice(ride, 100);
    demolishAt(w, shop.x, shop.y);
    const g = addGuest(w, (x) => { x.money = 120; x.needs.hunger = 0; x.needs.thirst = 0; x.needs.toilet = 0; });
    let guard = 0;
    while (g.state !== 'leaving' && guard++ < 400) step(w);
    expect(g.state).toBe('leaving');
    expect(g.thought).toBe('expensive');

    const empty = new World();
    const bored = addGuest(empty, (x) => { x.needs.hunger = 0; x.needs.thirst = 0; x.needs.toilet = 0; });
    guard = 0;
    while (bored.state !== 'leaving' && guard++ < 400) step(empty);
    expect(bored.thought).toBe('bored');
  });

  it('every thought has display text', () => {
    const { w } = makePark();
    for (const t of ['hungry', 'thirsty', 'toilet', 'tired', 'unhappy', 'fun', 'queueFull', 'waited', 'broke', 'tooOld', 'bored', 'expensive'] as const) {
      expect(THOUGHT_TEXT[t].length).toBeGreaterThan(0);
    }
    void w;
  });

  it('survives saving, and saves from before thoughts existed still load', () => {
    const { w } = makePark();
    const g = addGuest(w, (x) => { x.needs.hunger = 95; });
    step(w, 31);
    expect(g.thought).not.toBeNull();
    const data = JSON.parse(JSON.stringify(serializeWorld(w)));
    expect(deserializeWorld(data).guests[0].thought).toBe(g.thought);

    for (const gs of data.guests) { delete gs.thought; delete gs.thoughtTimer; } // 옛 저장본
    const old = deserializeWorld(data);
    expect(old.guests[0].thought).toBeNull();
    expect(old.guests[0].thoughtTimer).toBe(0);
  });
});

describe('guest selection', () => {
  function setup() {
    const { w, g, ride } = makePark();
    const tools = new ToolController(w);
    const guest = addGuest(w);
    guest.x = guest.px = g.x + 0.5;
    guest.y = guest.py = 44.5;
    const at = (x: number, y: number) => tools.onDown({ x: Math.floor(x), y: Math.floor(y) }, { x, y });
    return { w, g, ride, tools, guest, at };
  }

  it('clicking on a guest selects it; clicking a building selects the building instead', () => {
    const { tools, guest, ride, at } = setup();
    const p = guestDisplayPos(guest, 1);
    at(p.x + 0.1, p.y - 0.1);
    expect(tools.selectedGuestId).toBe(guest.id);
    expect(tools.selectedId).toBeNull();

    at(ride.x + 0.5, ride.y + 0.5);
    expect(tools.selectedId).toBe(ride.id);
    expect(tools.selectedGuestId).toBeNull();
  });

  it('a guest standing in front of a building wins over the building', () => {
    const { w, tools, ride } = setup();
    const near = addGuest(w);
    near.x = near.px = ride.x + 0.5;
    near.y = near.py = ride.y + 0.5;
    const p = guestDisplayPos(near, 1);
    tools.onDown({ x: ride.x, y: ride.y }, p);
    expect(tools.selectedGuestId).toBe(near.id);
    expect(tools.selectedId).toBeNull();
  });

  it('picks the closest guest, ignores hidden ones, and clears on empty ground', () => {
    const { w, tools, guest, at } = setup();
    const other = addGuest(w);
    other.x = other.px = guest.x + 0.5;
    other.y = other.py = guest.y;
    const pg = guestDisplayPos(guest, 1);
    const po = guestDisplayPos(other, 1);
    at((pg.x + po.x) / 2 - 0.05, pg.y); // 두 손님 사이에서 guest 쪽으로 약간 치우친 곳
    expect(tools.selectedGuestId).toBe(guest.id);

    guest.state = 'visiting'; // 시설 안(숨김)은 선택 불가
    guest.target = 999;
    at(pg.x, pg.y);
    expect(tools.selectedGuestId).not.toBe(guest.id);

    at(3.5, 3.5); // 빈 땅
    expect(tools.selectedGuestId).toBeNull();
    expect(tools.selectedId).toBeNull();
  });

  it('does not select while a build tool is active, and Esc / tool change clear the selection', () => {
    const { tools, guest, at } = setup();
    const p = guestDisplayPos(guest, 1);
    at(p.x, p.y);
    expect(tools.selectedGuestId).toBe(guest.id);
    tools.cancel();
    expect(tools.selectedGuestId).toBeNull();

    at(p.x, p.y);
    tools.setTool({ kind: 'path' });
    expect(tools.selectedGuestId).toBeNull();
    at(p.x, p.y); // 길 도구: 선택이 아니라 드래그 시작
    expect(tools.selectedGuestId).toBeNull();

    tools.setTool({ kind: 'none' });
    at(p.x, p.y);
    tools.reset();
    expect(tools.selectedGuestId).toBeNull();
  });
});

describe('tool events (sound hooks)', () => {
  it('reports build / path / demolish successes and error cases', () => {
    const w = new World();
    const tools = new ToolController(w);
    const events: string[] = [];
    tools.onEvent = (e) => events.push(e);

    tools.setTool({ kind: 'path' });
    tools.onDown({ x: 5, y: 5 });
    tools.onUp({ x: 8, y: 5 });
    tools.setTool({ kind: 'build', def: getDef('carousel') });
    tools.onDown({ x: 20, y: 20 });
    tools.onDown({ x: 20, y: 20 }); // 같은 자리 → 실패
    tools.setTool({ kind: 'demolish' });
    tools.onDown({ x: 20, y: 20 });
    tools.onDown({ x: 1, y: 1 }); // 빈 땅 → 실패
    expect(events).toEqual(['path', 'build', 'error', 'demolish', 'error']);
  });
});

describe('Sound', () => {
  const g = globalThis as { AudioContext?: unknown };
  const original = g.AudioContext;
  afterEach(() => { g.AudioContext = original; });

  const memStorage = (init: Record<string, string> = {}): KV => {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
  };

  it('does nothing (and does not throw) without Web Audio', () => {
    g.AudioContext = undefined;
    const s = new Sound(memStorage());
    expect(() => s.play('build')).not.toThrow();
  });

  it('remembers mute across instances and plays nothing when muted', () => {
    let oscillators = 0;
    class FakeCtx {
      currentTime = 0;
      state = 'running';
      destination = {};
      createOscillator() {
        oscillators++;
        return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
      }
    }
    g.AudioContext = FakeCtx;

    const store = memStorage();
    const s = new Sound(store);
    s.play('build');
    expect(oscillators).toBe(2); // 두 음
    s.play('chime');
    expect(oscillators).toBe(5); // 세 음

    expect(s.toggle()).toBe(true);
    s.play('build');
    expect(oscillators).toBe(5); // 음소거 중엔 재생 없음

    const again = new Sound(store);
    expect(again.muted).toBe(true);
    expect(again.toggle()).toBe(false);
    expect(new Sound(store).muted).toBe(false);
  });

  it('survives broken storage and a throwing audio context', () => {
    const broken: KV = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const s = new Sound(broken);
    expect(s.muted).toBe(false);
    expect(() => s.toggle()).not.toThrow();
    g.AudioContext = class { constructor() { throw new Error('blocked'); } };
    const s2 = new Sound(memStorage());
    expect(() => s2.play('win')).not.toThrow();
  });
});
