import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { appendPiece } from '../src/sim/trackedit';
import type { TrackType } from '../src/sim/coaster';
import { DAY_TICKS } from '../src/sim/economy';
import {
  applyEffects, BALLOON_HAPPY, BALLOON_SLIP_EVERY, createGuest, FLOAT_TICKS, pickTarget, updateGuest, type Guest,
} from '../src/sim/guest';
import {
  PARADE_COST, PARADE_MAX_ROUTE, PARADE_MIN_ROUTE, paradeRoute, paradeUnits, startParade, updateParade,
} from '../src/sim/parade';
import { PHOTO_PRICE, photoSpot, sellRidePhoto } from '../src/sim/photo';
import { createScenarioWorld, SCENARIOS } from '../src/sim/scenarios';
import { stepGuests, stepWorld } from '../src/sim/sim';
import { START_MONEY, World } from '../src/sim/world';

function onPath(_w: World, g: Guest, x: number, y: number): Guest {
  g.x = g.px = x + 0.5;
  g.y = g.py = y + 0.5;
  g.tile = { x, y };
  return g;
}

/** 입구에서 위로 8칸 길, 그 옆에 풍선 가게 */
function balloonPark() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  const shop = placeBuilding(w, getDef('balloon'), g.x + 1, g.y - 4, 3)!;
  expect(shop).not.toBeNull();
  expect(w.network.isOperational(shop)).toBe(true);
  return { w, gate: g, shop };
}

describe('starting money', () => {
  it('is ₩20,000 in the default park, and every scenario starts with more than before', () => {
    expect(START_MONEY).toBe(20000);
    expect(new World().money).toBe(20000);
    expect(createScenarioWorld('meadow', 1).money).toBe(20000);
    const before: Record<string, number> = { meadow: 10000, hills: 12000, forest: 7000, revival: 1500, tycoon: 15000 };
    for (const s of SCENARIOS) expect(createScenarioWorld(s.id, 1).money).toBeGreaterThan(before[s.id]);
  });
});

describe('balloon shop', () => {
  it('gives the guest a balloon they carry around', () => {
    const w = new World();
    const g = createGuest(w);
    applyEffects(g, getDef('balloon'));
    expect(g.balloon).toBeGreaterThanOrEqual(0);
    expect(g.thought).toBe('balloon');
  });

  it('is visited by happy guests without a balloon, never by sad ones or those who already have one', () => {
    const { w, gate, shop } = balloonPark();
    const g = onPath(w, createGuest(w), gate.x, gate.y);
    g.needs.happiness = 90;
    expect(pickTarget(w, g)?.b.id).toBe(shop.id);
    g.needs.happiness = BALLOON_HAPPY - 1;
    expect(pickTarget(w, g)).toBeNull();
    g.needs.happiness = 90;
    g.balloon = 2;
    expect(pickTarget(w, g)).toBeNull();
  });

  it('is a must-visit for a family whose kid has no balloon, and the kid gets one too', () => {
    const { w, gate, shop } = balloonPark();
    const p = onPath(w, createGuest(w), gate.x, gate.y);
    const k = onPath(w, createGuest(w), gate.x, gate.y);
    p.money = k.money = 100;
    p.needs.happiness = k.needs.happiness = 80;
    p.kids = [k.id];
    k.kid = true;
    k.leader = p.id;
    p.balloon = 1; // 보호자는 이미 있어도 아이 풍선 때문에 간다
    w.guests = [p, k];
    for (let i = 0; i < 400 && k.balloon === undefined; i++) stepGuests(w);
    expect(k.balloon).toBeDefined();
    expect(shop.served).toBeGreaterThanOrEqual(1);
  });

  it('sometimes slips away and floats up into the sky', () => {
    const w = new World();
    const g = onPath(w, createGuest(w), w.map.gate.x, w.map.gate.y);
    w.map.path[w.map.index(g.tile.x, g.tile.y)] = 1;
    g.balloon = 3;
    g.state = 'queueing'; // 제자리에 머물게
    g.target = null;
    w.guests = [g];
    w.guestById = new Map([[g.id, g]]);
    let t = 0;
    for (; t < BALLOON_SLIP_EVERY * 400 && g.balloon !== undefined; t++) {
      w.tick++;
      g.timer = 0;
      updateGuest(w, g);
    }
    expect(g.balloon).toBeUndefined();
    expect(g.thought).toBe('balloonLost');
    expect(w.floaters).toHaveLength(1);
    expect(w.floaters[0].color).toBe(3);
    expect(w.stats.balloonsLost).toBe(1);
    // 다 날아간 풍선은 지워진다
    for (let i = 0; i < FLOAT_TICKS + 1; i++) stepGuests(w);
    expect(w.floaters).toHaveLength(0);
  });

  it('keeps balloons on guests through save/load', () => {
    const w = new World();
    const g = createGuest(w);
    g.balloon = 4;
    w.guests = [g];
    expect(deserializeWorld(serializeWorld(w)).guests[0].balloon).toBe(4);
  });
});

const CODE: Record<string, TrackType> = { S: 'straight', L: 'left', U: 'up', D: 'down', C: 'lift' };
/** 리프트 3칸으로 올라가 3칸 내려오는 코스(역 입구를 바깥에 둔다) */
const HILL_OUT = 'CCCLDDDLSSSSSSSLSSSLS';

function coasterPark() {
  const w = new World();
  w.money = 50_000;
  const b = placeBuilding(w, getDef('coaster'), 10, 10, 0)!;
  for (const ch of HILL_OUT) expect(appendPiece(w, b, CODE[ch]).ok).toBe(true);
  expect(b.track!.ok).toBe(true);
  return { w, b };
}

describe('coaster ride photos', () => {
  it('stand at the bottom of the biggest drop', () => {
    const { b } = coasterPark();
    const spot = photoSpot(b.track!)!;
    expect(spot.piece.type).toBe('down');
    expect(spot.piece.hOut).toBe(0);
    expect(spot.t).toBeGreaterThan(0);
    expect(spot.t).toBeLessThan(1);
  });

  it('are sold to happy riders for ₩8, once per coaster, never to kids', () => {
    const { w, b } = coasterPark();
    let sold = 0;
    let tried = 0;
    for (let i = 0; i < 40; i++) {
      const g = createGuest(w);
      g.needs.happiness = 90;
      g.money = 50;
      tried++;
      const money = w.money;
      if (sellRidePhoto(w, b, g)) {
        sold++;
        expect(g.money).toBe(50 - PHOTO_PRICE);
        expect(w.money).toBe(money + PHOTO_PRICE);
        expect(g.photo).toBe(b.id);
        expect(sellRidePhoto(w, b, g)).toBe(false); // 같은 코스터는 또 사지 않는다
      }
    }
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThan(tried);
    expect(b.photos).toBe(sold);
    expect(w.ledger.photos).toBe(sold * PHOTO_PRICE);

    const kid = createGuest(w);
    kid.kid = true;
    kid.needs.happiness = 100;
    kid.money = 50;
    for (let c = 0; c < 20; c++, b.cycles++) expect(sellRidePhoto(w, b, kid)).toBe(false);
    const sad = createGuest(w);
    sad.needs.happiness = 20;
    for (let c = 0; c < 20; c++, b.cycles++) expect(sellRidePhoto(w, b, sad)).toBe(false);
  });

  it('are sold in a running park', () => {
    const { w, b } = coasterPark();
    placePaths(w, lineTiles({ x: 11, y: 11 }, { x: 11, y: 47 }));
    placePaths(w, lineTiles({ x: 11, y: 47 }, w.map.gate));
    for (let i = 0; i < 5000; i++) stepWorld(w);
    expect(b.served).toBeGreaterThan(0);
    expect(b.photos ?? 0).toBeGreaterThan(0);
    expect(deserializeWorld(serializeWorld(w)).buildings.get(b.id)!.photos).toBe(b.photos);
  });
});

describe('parade', () => {
  function paradePark() {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 10 }));
    placePaths(w, lineTiles({ x: g.x, y: g.y - 10 }, { x: g.x + 8, y: g.y - 10 }));
    placePaths(w, lineTiles({ x: g.x, y: g.y - 5 }, { x: g.x - 6, y: g.y - 5 }));
    return { w, gate: g };
  }

  it('walks a connected route from the gate that covers the paths', () => {
    const { w, gate } = paradePark();
    const r = paradeRoute(w);
    expect(r[0]).toEqual(gate);
    for (let i = 1; i < r.length; i++) expect(Math.abs(r[i].x - r[i - 1].x) + Math.abs(r[i].y - r[i - 1].y)).toBe(1);
    const keys = new Set(r.map((t) => `${t.x},${t.y}`));
    expect(keys.has(`${gate.x + 8},${gate.y - 10}`)).toBe(true);
    expect(keys.has(`${gate.x - 6},${gate.y - 5}`)).toBe(true);
    expect(r.length).toBeLessThanOrEqual(PARADE_MAX_ROUTE);
  });

  it('costs money, needs enough path and happens once a day', () => {
    const w = new World();
    expect(startParade(w)).toContain(`${PARADE_MIN_ROUTE}칸`);
    const { w: p } = paradePark();
    p.money = PARADE_COST - 1;
    expect(startParade(p)).toBe('돈이 부족합니다');
    p.money = 5000;
    expect(startParade(p)).toBeNull();
    expect(p.money).toBe(5000 - PARADE_COST);
    expect(p.ledger.parade).toBe(-PARADE_COST);
    expect(startParade(p)).toBe('이미 퍼레이드 중입니다');
    p.tick = p.parade!.end;
    updateParade(p);
    expect(p.parade).toBeNull();
    expect(startParade(p)).toBe('퍼레이드는 하루에 한 번만 할 수 있습니다');
    p.tick = DAY_TICKS;
    expect(startParade(p)).toBeNull();
  });

  it('cheers up guests near the procession but not those far away', () => {
    const { w, gate } = paradePark();
    const near = onPath(w, createGuest(w), gate.x, gate.y - 1);
    const far = onPath(w, createGuest(w), gate.x + 8, gate.y - 10);
    near.needs.happiness = far.needs.happiness = 50;
    near.state = far.state = 'queueing';
    w.guests = [near, far];
    expect(startParade(w)).toBeNull();
    for (let i = 0; i < 40; i++) {
      w.tick++;
      updateParade(w);
    }
    expect(near.needs.happiness).toBeGreaterThan(50);
    expect(far.needs.happiness).toBe(50);
  });

  it('marches its units one after another along the route', () => {
    const { w } = paradePark();
    startParade(w);
    const p = w.parade!;
    const first = paradeUnits(p, p.start);
    expect(first[0]).not.toBeNull();
    expect(first.slice(1).every((u) => u === null)).toBe(true);
    const mid = paradeUnits(p, p.start + 120);
    expect(mid.filter((u) => u !== null).length).toBe(mid.length);
    expect(paradeUnits(p, p.end + 1).every((u) => u === null)).toBe(true);
  });

  it('survives save/load', () => {
    const { w } = paradePark();
    startParade(w);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.parade).toEqual(w.parade);
    expect(back.lastParadeDay).toBe(w.lastParadeDay);
    const data = serializeWorld(w);
    delete data.parade;
    delete data.lastParadeDay;
    const old = deserializeWorld(data);
    expect(old.parade).toBeNull();
    expect(old.lastParadeDay).toBe(-1);
  });
});
