import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { FLOWERS } from '../src/data/scenery';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { createGuest } from '../src/sim/guest';
import { ACTIVE_SLOTS, activeMissions, MISSION_IDS, MISSIONS, updateMissions } from '../src/sim/missions';
import { hireStaff } from '../src/sim/staff';
import { World } from '../src/sim/world';

function addGuests(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.guests.push(createGuest(w));
}

describe('missions', () => {
  it('have unique ids and positive targets and rewards', () => {
    expect(new Set(MISSION_IDS).size).toBe(MISSIONS.length);
    for (const m of MISSIONS) {
      expect(m.target).toBeGreaterThan(0);
      expect(m.reward).toBeGreaterThan(0);
    }
  });

  it('a new park has the first missions active and none completed', () => {
    const w = new World();
    expect(activeMissions(w).map((m) => m.id)).toEqual(MISSION_IDS.slice(0, ACTIVE_SLOTS));
    expect(updateMissions(w)).toEqual([]);
    expect(w.ledger.missions).toBe(0);
  });

  it('pays the reward once, records it in the ledger and opens the next mission', () => {
    const w = new World();
    const m = MISSIONS[0]; // 손님 30명
    addGuests(w, m.target);
    const money = w.money;
    expect(updateMissions(w).map((x) => x.id)).toEqual([m.id]);
    expect(w.money).toBe(money + m.reward);
    expect(w.ledger.missions).toBe(m.reward);
    expect(activeMissions(w).map((x) => x.id)).toEqual(MISSION_IDS.slice(1, ACTIVE_SLOTS + 1));
    // 조건이 깨져도 다시 받거나 잃지 않는다
    w.guests = [];
    expect(updateMissions(w)).toEqual([]);
    expect(w.missions.completed).toContain(m.id);
    expect(w.money).toBe(money + m.reward);
  });

  it('only checks active missions (later ones wait their turn)', () => {
    const w = new World();
    for (let i = 0; i < 5; i++) hireStaff(w, 'janitor'); // staff3은 다섯 번째라 아직 잠김
    expect(updateMissions(w)).toEqual([]);
    w.missions.completed.push(...MISSION_IDS.slice(0, 4));
    expect(updateMissions(w).map((x) => x.id)).toEqual(['staff3']);
  });

  it('counts operational shop kinds and planted flowers', () => {
    const w = new World();
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
    placeBuilding(w, getDef('burger'), g.x + 1, 43, 3);
    placeBuilding(w, getDef('drinks'), g.x + 1, 41, 3);
    placeBuilding(w, getDef('cafe'), g.x - 1, 41, 1);
    const shops3 = MISSIONS.find((m) => m.id === 'shops3')!;
    expect(shops3.progress(w)).toBe(3);
    const flowers = MISSIONS.find((m) => m.id === 'flowers10')!;
    const before = flowers.progress(w);
    w.map.scenery[w.map.index(5, 5)] = FLOWERS;
    expect(flowers.progress(w)).toBe(before + 1);
  });

  it('stops after the game is lost', () => {
    const w = new World();
    addGuests(w, 50);
    w.status = 'lost';
    expect(updateMissions(w)).toEqual([]);
  });

  it('survives save/load, and old saves start with no missions done', () => {
    const w = new World();
    w.missions.completed.push('guests30', 'shops3');
    const back = deserializeWorld(serializeWorld(w));
    expect(back.missions.completed).toEqual(['guests30', 'shops3']);
    const data = serializeWorld(w);
    delete data.missions;
    expect(deserializeWorld(data).missions.completed).toEqual([]);
  });
});
