import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { familyKids, KID_MAX_INTENSITY, LOST_TICKS, pickTarget, REUNITE_TIP, reuniteKid, thrillTolerance, type Guest } from '../src/sim/guest';
import { makeReview } from '../src/sim/reviews';
import { stepGuests } from '../src/sim/sim';
import { admitFamily, kidFee, PARENT_EXTRA_MONEY } from '../src/sim/spawner';
import { hireStaff } from '../src/sim/staff';
import { World } from '../src/sim/world';

/** 입구에서 위로 뻗은 길 + 2×2 놀이기구(입구 (g.x, 38)) + 햄버거 가게(입구 (g.x, 43)) */
function makePark(ride = 'carousel') {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 })); // y 47..39
  placePaths(w, [{ x: g.x, y: 38 }]);
  const b = placeBuilding(w, getDef(ride), g.x - 1, 36, 0)!;
  const shop = placeBuilding(w, getDef('burger'), g.x + 1, 43, 3)!;
  return { w, g, ride: b, shop };
}

/** 한 틱 진행 전에 guestById가 채워지도록 stepGuests로 진행 */
function runUntil(w: World, cond: () => boolean, max = 800): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    stepGuests(w);
  }
  throw new Error('condition not reached');
}

function family(w: World, kids = 2): { parent: Guest; kids: Guest[] } {
  const parent = admitFamily(w, kids)!;
  w.guestById = new Map(w.guests.map((x) => [x.id, x]));
  return { parent, kids: w.guests.filter((x) => x.leader === parent.id) };
}

describe('family guests', () => {
  it('enter together: the parent pays full fee for themself and half for each child', () => {
    const { w } = makePark();
    w.entranceFee = 10;
    const before = w.ledger.entrance;
    const { parent, kids } = family(w, 2);
    expect(kids).toHaveLength(2);
    expect(parent.kids).toEqual(kids.map((k) => k.id));
    for (const k of kids) {
      expect(k.kid).toBe(true);
      expect(thrillTolerance(k)).toBeLessThan(50);
    }
    expect(w.ledger.entrance - before).toBe(10 + 2 * kidFee(10));
    expect(kidFee(10)).toBe(5);
    expect(w.stats.entered).toBe(3);
    expect(w.stats.families).toBe(1);
    expect(parent.money).toBeGreaterThanOrEqual(40 + PARENT_EXTRA_MONEY - 10 - 2 * kidFee(10));
  });

  it('skip rides that are too intense for their kids, but a lone adult may ride them', () => {
    const { w } = makePark('drop');
    expect(getDef('drop').intensity!).toBeGreaterThan(KID_MAX_INTENSITY);
    const { parent } = family(w, 1);
    parent.needs.hunger = 0;
    for (let i = 0; i < 30; i++) expect(pickTarget(w, parent)?.b.defId).not.toBe('drop');
    // 아이가 없는 손님(담력 최대)은 드롭타워를 고를 수 있다
    parent.kids = undefined;
    let picked = false;
    for (let i = 0; i < 30 && !picked; i++) picked = pickTarget(w, parent)?.b.defId === 'drop';
    expect(picked).toBe(true);
  });

  it('go where the hungriest member needs to go', () => {
    const { w } = makePark();
    const { parent, kids } = family(w, 1);
    parent.needs.hunger = 0;
    kids[0].needs.hunger = 95;
    // 회전목마보다 햄버거 가게가 먼저
    expect(pickTarget(w, parent)?.b.defId).toBe('burger');
  });

  it('kids follow their parent to the same attraction and ride too', () => {
    const { w, ride } = makePark();
    const { parent, kids } = family(w, 2);
    for (const g of [parent, ...kids]) g.needs.hunger = g.needs.thirst = g.needs.toilet = 0;
    runUntil(w, () => parent.target === ride.id);
    runUntil(w, () => kids.every((k) => k.target === ride.id && k.state !== 'idle'), 50);
    const served = ride.served;
    runUntil(w, () => ride.served >= served + 3, 1500);
  });

  it('kids leave with their parent', () => {
    const { w } = makePark();
    const { parent, kids } = family(w, 2);
    parent.needs.happiness = 5; // 곧 떠난다
    runUntil(w, () => parent.state === 'leaving' || parent.state === 'gone');
    stepGuests(w);
    for (const k of kids) expect(['leaving', 'gone']).toContain(k.state);
    // 리뷰는 보호자만 남긴다
    runUntil(w, () => w.guests.length === 0, 400);
    expect(w.reviews).toHaveLength(1);
    expect(w.reviews[0].guestId).toBe(parent.id);
  });

  it('a parent whose kid is very unhappy takes the family home', () => {
    const { w } = makePark();
    const { parent, kids } = family(w, 1);
    kids[0].needs.happiness = 5;
    runUntil(w, () => parent.state === 'leaving' || parent.state === 'gone', 50);
  });
});

describe('lost children', () => {
  function lostSetup() {
    const { w, g } = makePark();
    const { parent, kids } = family(w, 1);
    const kid = kids[0];
    // 아이를 길 아래쪽에 두고 길을 잃게 한다
    kid.tile = { x: g.x, y: 46 };
    kid.x = kid.px = g.x + 0.5;
    kid.y = kid.py = 46.5;
    kid.lostUntil = w.tick + LOST_TICKS;
    return { w, g, parent, kid };
  }

  it('the parent will not leave while a kid is lost, and worries', () => {
    const { w, parent } = lostSetup();
    parent.needs.happiness = 30;
    const h = parent.needs.happiness;
    for (let i = 0; i < 100; i++) stepGuests(w);
    expect(parent.state).not.toBe('leaving');
    expect(parent.needs.happiness).toBeLessThan(h);
    expect(familyKids(w, parent)).toHaveLength(0); // 길 잃은 아이는 함께 다니지 않는다
  });

  it('reuniting moves the kid next to the parent and pays a tip', () => {
    const { w, parent, kid } = lostSetup();
    for (let i = 0; i < 20; i++) stepGuests(w);
    const money = w.money;
    const happy = parent.needs.happiness;
    expect(reuniteKid(w, kid)).toBe(true);
    expect(kid.lostUntil).toBeUndefined();
    expect(kid.tile).toEqual(parent.tile);
    expect(w.money).toBe(money + REUNITE_TIP);
    expect(w.ledger.missions).toBe(REUNITE_TIP);
    expect(w.stats.reunited).toBe(1);
    expect(parent.needs.happiness).toBeGreaterThan(happy);
    expect(kid.thought).toBe('reunited');
    expect(reuniteKid(w, kid)).toBe(false); // 이미 찾은 아이
  });

  it('an entertainer standing nearby brings the kid back', () => {
    const { w, g, kid } = lostSetup();
    const s = hireStaff(w, 'entertainer')!;
    s.tile = { x: g.x, y: 46 };
    s.x = g.x + 0.5;
    s.y = 46.5;
    runUntil(w, () => kid.lostUntil === undefined, 20);
    expect(w.stats.reunited).toBe(1);
  });

  it('if nobody finds the kid in time the family leaves unhappy and reviews it', () => {
    const { w, parent, kid } = lostSetup();
    runUntil(w, () => kid.state === 'leaving' || kid.state === 'gone', LOST_TICKS + 10);
    expect(w.stats.lostGone).toBe(1);
    runUntil(w, () => parent.state === 'leaving' || parent.state === 'gone', 300);
    expect(parent.gripe).toBe('lostKid');
    expect(makeReview(w, parent).text).toMatch(/아이|애/);
  });
});

describe('family save', () => {
  it('round-trips family links and lost state', () => {
    const { w } = makePark();
    const { parent, kids } = family(w, 2);
    kids[1].lostUntil = 500;
    const back = deserializeWorld(serializeWorld(w));
    const p = back.guests.find((x) => x.id === parent.id)!;
    expect(p.kids).toEqual(parent.kids);
    const k = back.guests.find((x) => x.id === kids[1].id)!;
    expect(k.kid).toBe(true);
    expect(k.leader).toBe(parent.id);
    expect(k.lostUntil).toBe(500);
    expect(back.stats.families).toBe(1);
  });
});
