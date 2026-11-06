import { describe, expect, it } from 'vitest';
import { getDef, SHOPS } from '../src/data';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { applyEffects, createGuest, pickTarget, REST_BELOW, SOUVENIR_HAPPY, type Guest } from '../src/sim/guest';
import { stepGuests } from '../src/sim/sim';
import { World } from '../src/sim/world';

/** 입구에서 위로 뻗은 길과 길 옆(g.x+1, 43)의 매점 하나 */
function park(shop: string) {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  const b = placeBuilding(w, getDef(shop), g.x + 1, 43, 3);
  expect(b).not.toBeNull();
  return { w, b: b! };
}

function calmGuest(w: World, tweak?: (g: Guest) => void): Guest {
  const g = createGuest(w);
  g.needs = { happiness: 60, hunger: 0, thirst: 0, toilet: 0, energy: 100 };
  g.money = 100;
  tweak?.(g);
  w.guests.push(g);
  w.guestById = new Map(w.guests.map((x) => [x.id, x]));
  return g;
}

describe('new shops', () => {
  it('are all placeable on the path and have unique ids', () => {
    expect(new Set(SHOPS.map((d) => d.id)).size).toBe(SHOPS.length);
    for (const id of ['pizza', 'icecream', 'cafe', 'souvenir']) park(id);
  });

  it('pizza serves hungry guests, three at a time', () => {
    const { w } = park('pizza');
    expect(getDef('pizza').capacity).toBe(3);
    const g = calmGuest(w, (x) => { x.needs.hunger = 90; });
    expect(pickTarget(w, g)?.b.defId).toBe('pizza');
    for (let i = 0; i < 600 && g.needs.hunger > 50; i++) stepGuests(w);
    expect(g.needs.hunger).toBeLessThan(50);
  });

  it('ice cream quenches thirst and cheers guests up more than a plain drink', () => {
    const a = calmGuest(new World(), (x) => { x.needs.thirst = 80; });
    const b = calmGuest(new World(), (x) => { x.needs.thirst = 80; });
    applyEffects(a, getDef('icecream'));
    applyEffects(b, getDef('drinks'));
    expect(a.needs.thirst).toBe(b.needs.thirst);
    expect(a.needs.happiness).toBeGreaterThan(b.needs.happiness);
  });

  it('cafe is only wanted by tired guests and restores energy', () => {
    const { w } = park('cafe');
    const fresh = calmGuest(w);
    expect(pickTarget(w, fresh)).toBeNull();
    const tired = calmGuest(w, (x) => { x.needs.energy = REST_BELOW - 25; });
    expect(pickTarget(w, tired)?.b.defId).toBe('cafe');
    const before = tired.needs.energy;
    applyEffects(tired, getDef('cafe'));
    expect(tired.needs.energy).toBeGreaterThan(before + 30);
  });

  it('souvenir shop attracts happy guests with spare money, once', () => {
    const { w, b } = park('souvenir');
    const meh = calmGuest(w, (x) => { x.needs.happiness = SOUVENIR_HAPPY - 10; });
    expect(pickTarget(w, meh)).toBeNull();
    const poor = calmGuest(w, (x) => { x.needs.happiness = 95; x.money = b.price + 5; });
    expect(pickTarget(w, poor)).toBeNull();
    const happy = calmGuest(w, (x) => { x.needs.happiness = 95; });
    expect(pickTarget(w, happy)?.b.id).toBe(b.id);
    const money = happy.money;
    for (let i = 0; i < 600 && happy.money === money; i++) stepGuests(w);
    expect(happy.money).toBe(money - b.price);
    expect(w.ledger.shops).toBe(b.price);
    expect(pickTarget(w, happy)).toBeNull(); // 이미 들른 가게
  });
});
