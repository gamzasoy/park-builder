import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { ToolController } from '../src/input/tools';
import { deserializeWorld, parseSave, serializeWorld } from '../src/save/save';
import { canPlaceBuilding, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { groundHeightAt, MAX_TERRAIN, TileMap } from '../src/sim/map';
import { connected } from '../src/sim/pathfinding';
import { stepWorld } from '../src/sim/sim';
import { canChangeTerrain, changeTerrain, paintTerrain, TERRAIN_COST } from '../src/sim/terrain';
import { appendPiece, canAppendPiece } from '../src/sim/trackedit';
import { START_MONEY, World } from '../src/sim/world';

describe('TileMap height', () => {
  it('starts flat, clamps, and bumps version only on change', () => {
    const m = new TileMap();
    expect(m.heightAt(5, 5)).toBe(0);
    const v = m.version;
    m.setHeight(5, 5, 2);
    expect(m.heightAt(5, 5)).toBe(2);
    expect(m.version).toBe(v + 1);
    m.setHeight(5, 5, 2);
    expect(m.version).toBe(v + 1);
    m.setHeight(5, 5, 99);
    expect(m.heightAt(5, 5)).toBe(MAX_TERRAIN);
    m.setHeight(5, 5, -3);
    expect(m.heightAt(5, 5)).toBe(0);
    expect(m.heightAt(-1, 0)).toBe(0);
  });
  it('interpolates ground height between tile centres', () => {
    const m = new TileMap();
    m.setHeight(10, 10, 2);
    expect(groundHeightAt(m, 10.5, 10.5)).toBe(2);
    expect(groundHeightAt(m, 11.0, 10.5)).toBeCloseTo(1, 5);
    expect(groundHeightAt(m, 12.5, 10.5)).toBe(0);
    expect(groundHeightAt(m, -5, -5)).toBe(0);
  });
});

describe('terrain rules', () => {
  it('raises and lowers one step, charging each tile', () => {
    const w = new World();
    expect(changeTerrain(w, 10, 10, 'raise').ok).toBe(true);
    expect(w.map.heightAt(10, 10)).toBe(1);
    expect(w.money).toBe(START_MONEY - TERRAIN_COST);
    expect(changeTerrain(w, 10, 10, 'lower').ok).toBe(true);
    expect(w.map.heightAt(10, 10)).toBe(0);
    expect(changeTerrain(w, 10, 10, 'lower')).toEqual({ ok: false, reason: 'limit' });
    expect(w.money).toBe(START_MONEY - 2 * TERRAIN_COST);
  });
  it('limits neighbour height difference to 1 and total height to 4', () => {
    const w = new World();
    changeTerrain(w, 10, 10, 'raise');
    expect(canChangeTerrain(w, 10, 10, 'raise')).toEqual({ ok: false, reason: 'step' });
    // 이웃을 먼저 올리면 가능
    changeTerrain(w, 11, 10, 'raise');
    changeTerrain(w, 9, 10, 'raise');
    changeTerrain(w, 10, 9, 'raise');
    changeTerrain(w, 10, 11, 'raise');
    expect(changeTerrain(w, 10, 10, 'raise').ok).toBe(true);
    // 높이 4 상한
    const w2 = new World();
    w2.money = 1e6;
    // 한 단계씩 층을 쌓아 마름모 피라미드를 만든다
    for (let level = 1; level <= MAX_TERRAIN; level++) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (MAX_TERRAIN - Math.abs(dx) - Math.abs(dy) >= level) expect(changeTerrain(w2, 20 + dx, 20 + dy, 'raise').ok).toBe(true);
      }
    }
    expect(w2.map.heightAt(20, 20)).toBe(MAX_TERRAIN);
    expect(canChangeTerrain(w2, 20, 20, 'raise')).toEqual({ ok: false, reason: 'limit' });
  });
  it('refuses paths, buildings, entrance tiles and the map edge', () => {
    const w = new World();
    placePaths(w, [{ x: 10, y: 10 }]);
    expect(canChangeTerrain(w, 10, 10, 'raise')).toEqual({ ok: false, reason: 'path' });
    const b = placeBuilding(w, getDef('carousel'), 20, 20, 0)!;
    expect(canChangeTerrain(w, 20, 20, 'raise')).toEqual({ ok: false, reason: 'occupied' });
    expect(canChangeTerrain(w, b.entrance.x, b.entrance.y, 'raise')).toEqual({ ok: false, reason: 'entrance' });
    expect(canChangeTerrain(w, -1, 0, 'raise')).toEqual({ ok: false, reason: 'bounds' });
  });
  it('refuses without money and charges nothing', () => {
    const w = new World();
    w.money = TERRAIN_COST - 1;
    expect(changeTerrain(w, 10, 10, 'raise')).toEqual({ ok: false, reason: 'money' });
    expect(w.map.heightAt(10, 10)).toBe(0);
    expect(w.money).toBe(TERRAIN_COST - 1);
  });
  it('paints a line in order and stops when short of money', () => {
    const w = new World();
    w.money = TERRAIN_COST * 2;
    const r = paintTerrain(w, lineTiles({ x: 10, y: 10 }, { x: 14, y: 10 }), 'raise');
    expect(r).toMatchObject({ changed: 2, short: true });
    expect(w.map.heightAt(11, 10)).toBe(1);
    expect(w.map.heightAt(12, 10)).toBe(0);
  });
  it('invalidates the path cache (version) when terrain changes', () => {
    const w = new World();
    const v = w.map.version;
    changeTerrain(w, 10, 10, 'raise');
    expect(w.map.version).toBeGreaterThan(v);
  });
  it('is driven by the terrain tool with click and messages', () => {
    const w = new World();
    const tc = new ToolController(w);
    tc.setTool({ kind: 'terrain', mode: 'raise' });
    expect(tc.toolKey).toBe('terrain:raise');
    expect(tc.preview({ x: 10, y: 10 })?.tiles).toEqual([{ x: 10, y: 10, ok: true, level: 1 }]);
    tc.onDown({ x: 10, y: 10 });
    tc.onUp({ x: 10, y: 10 });
    expect(w.map.heightAt(10, 10)).toBe(1);
    // 같은 칸을 또 올리면 이웃 단차로 거절
    tc.onDown({ x: 10, y: 10 });
    tc.onUp({ x: 10, y: 10 });
    expect(w.map.heightAt(10, 10)).toBe(1);
    expect(tc.message).toContain('높이 차');
    expect(tc.preview({ x: 10, y: 10 })?.tiles[0].ok).toBe(false);
    // 드래그 후 Esc는 드래그만 취소
    tc.onDown({ x: 15, y: 15 });
    tc.cancel();
    tc.onUp({ x: 17, y: 15 });
    expect(w.map.heightAt(16, 15)).toBe(0);
    tc.cancel();
    expect(tc.tool.kind).toBe('none');
    tc.setTool({ kind: 'terrain', mode: 'lower' });
    tc.onDown({ x: 10, y: 10 });
    tc.onUp({ x: 10, y: 10 });
    expect(w.map.heightAt(10, 10)).toBe(0);
  });
});

describe('paths and slopes', () => {
  function line(w: World, len: number) {
    const g = w.map.gate;
    placePaths(w, lineTiles(g, { x: g.x, y: g.y - len }));
  }
  it('connects adjacent paths only if the height difference is at most 1', () => {
    const w = new World();
    line(w, 5);
    const g = w.map.gate;
    w.map.setHeight(g.x, g.y - 1, 1);
    expect(connected(w.map, g.x, g.y, g.x, g.y - 1)).toBe(true);
    w.map.setHeight(g.x, g.y - 1, 2);
    expect(connected(w.map, g.x, g.y, g.x, g.y - 1)).toBe(false);
    expect(connected(w.map, g.x, g.y, g.x + 1, g.y)).toBe(false); // 길이 아님
  });
  it('a ramp is walkable; a 2-step cliff splits the network and strands buildings', () => {
    const w = new World();
    const g = w.map.gate;
    line(w, 9);
    const b = placeBuilding(w, getDef('carousel'), g.x - 1, g.y - 11, 0);
    expect(b).not.toBeNull();
    expect(b!.entrance).toEqual({ x: g.x, y: g.y - 9 });
    // 사다리처럼 한 칸씩 오르는 경사
    w.map.setHeight(g.x, g.y - 3, 1);
    w.map.setHeight(g.x, g.y - 4, 1);
    w.map.setHeight(g.x, g.y - 5, 1);
    w.map.setHeight(g.x, g.y - 6, 1);
    expect(w.network.isOperational(b!)).toBe(true);
    expect(w.network.findPath(g, b!.entrance)).not.toBeNull();
    // 절벽: 2단계 차이
    w.map.setHeight(g.x, g.y - 5, 3);
    expect(w.network.isReachable(g.x, g.y - 4)).toBe(true);
    expect(w.network.isReachable(g.x, g.y - 5)).toBe(false);
    expect(w.network.isOperational(b!)).toBe(false);
    expect(w.network.findPath(g, b!.entrance)).toBeNull();
    // 다시 낮추면 복구
    w.map.setHeight(g.x, g.y - 5, 2);
    expect(w.network.isOperational(b!)).toBe(true);
  });
});

describe('buildings need flat ground', () => {
  it('rejects a sloped footprint or entrance tile', () => {
    const w = new World();
    const def = getDef('carousel'); // 2x2, rot 0 입구는 아래(+y)
    expect(canPlaceBuilding(w, def, 10, 10, 0).ok).toBe(true);
    w.map.setHeight(11, 11, 1);
    expect(canPlaceBuilding(w, def, 10, 10, 0)).toEqual({ ok: false, reason: 'slope' });
    // 평평한 높이 1 위는 가능
    for (const [x, y] of [[10, 10], [11, 10], [10, 11]]) w.map.setHeight(x, y, 1);
    expect(canPlaceBuilding(w, def, 10, 10, 0).ok).toBe(false); // 입구(10,12) 높이 0
    w.map.setHeight(11, 12, 1);
    expect(canPlaceBuilding(w, def, 10, 10, 0).ok).toBe(true);
    w.map.setHeight(11, 12, 0);
    expect(canPlaceBuilding(w, def, 10, 10, 0)).toEqual({ ok: false, reason: 'slope' });
  });
  it('requires a flat coaster station too', () => {
    const w = new World();
    w.map.setHeight(12, 10, 1);
    expect(canPlaceBuilding(w, getDef('coaster'), 10, 10, 0)).toEqual({ ok: false, reason: 'slope' });
  });
});

describe('track versus terrain', () => {
  it('rejects a track piece that would be underground', () => {
    const w = new World();
    w.money = 50_000;
    const b = placeBuilding(w, getDef('coaster'), 10, 10, 0)!;
    expect(canAppendPiece(w, b, 'straight').ok).toBe(true);
    w.map.setHeight(13, 10, 1);
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'underground' });
    expect(appendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'underground' });
    // 오르막은 hMin이 0이라 여전히 땅속
    expect(canAppendPiece(w, b, 'up').ok).toBe(false);
  });
  it('allows a raised track over lower terrain and blocks raising ground into it', () => {
    const w = new World();
    w.money = 50_000;
    const b = placeBuilding(w, getDef('coaster'), 10, 10, 0)!;
    expect(appendPiece(w, b, 'lift').ok).toBe(true);
    expect(canChangeTerrain(w, 13, 10, 'raise')).toEqual({ ok: false, reason: 'occupied' }); // 낮은 조각 = 지면 점유
  });
});

describe('save', () => {
  it('round-trips terrain', () => {
    const w = new World();
    changeTerrain(w, 10, 10, 'raise');
    changeTerrain(w, 11, 10, 'raise');
    const data = JSON.parse(JSON.stringify(serializeWorld(w)));
    expect(typeof data.terrain).toBe('string');
    expect(data.terrain).toHaveLength(48 * 48);
    const back = deserializeWorld(data);
    expect(Array.from(back.map.terrain)).toEqual(Array.from(w.map.terrain));
  });
  it('loads old saves (no terrain field) as flat', () => {
    const w = new World();
    const data = JSON.parse(JSON.stringify(serializeWorld(w)));
    delete data.terrain;
    for (const v of [1, 2, 3, 4]) {
      const r = parseSave(JSON.stringify({ ...data, version: v }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.world.map.terrain.every((h) => h === 0)).toBe(true);
    }
  });
  it('rejects a corrupt terrain layer', () => {
    const data = JSON.parse(JSON.stringify(serializeWorld(new World())));
    expect(() => deserializeWorld({ ...data, terrain: '0'.repeat(10) })).toThrow();
    expect(() => deserializeWorld({ ...data, terrain: '5'.repeat(48 * 48) })).toThrow();
    expect(() => deserializeWorld({ ...data, terrain: 'x'.repeat(48 * 48) })).toThrow();
    expect(parseSave(JSON.stringify({ ...data, terrain: 7 }))).toEqual({ ok: false, reason: 'corrupt' });
  });
  it('adopt copies terrain and a loaded game continues identically', () => {
    const g = new World().map.gate;
    const mk = () => {
      const w = new World();
      placePaths(w, lineTiles(g, { x: g.x, y: g.y - 6 }));
      placeBuilding(w, getDef('carousel'), g.x - 1, g.y - 8, 0);
      w.map.setHeight(g.x, g.y - 2, 1);
      w.map.setHeight(g.x, g.y - 3, 1);
      changeTerrain(w, g.x + 5, g.y - 5, 'raise');
      return w;
    };
    const a = mk();
    for (let i = 0; i < 800; i++) stepWorld(a);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))));
    const c = new World();
    c.adopt(b);
    expect(Array.from(c.map.terrain)).toEqual(Array.from(a.map.terrain));
    for (let i = 0; i < 800; i++) { stepWorld(a); stepWorld(b); }
    const strip = (w: World) => ({ ...serializeWorld(w), savedAt: 0, guests: serializeWorld(w).guests.map(({ pathVersion: _p, ...g2 }) => g2) });
    expect(strip(b)).toEqual(strip(a));
  });
});
