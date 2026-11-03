import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, parseSave, serializeWorld } from '../src/save/save';
import { buildingAt, canPlaceBuilding, demolishAt, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import {
  buildingDef, PHYSICS, PIECE_COST, pieceRange, routeAt, stationTiles, type TrackType,
} from '../src/sim/coaster';
import { applyEffects, createGuest } from '../src/sim/guest';
import { stepWorld } from '../src/sim/sim';
import { appendPiece, canAppendPiece, clearTrack, trackOccupancy, undoPiece } from '../src/sim/trackedit';
import { START_MONEY, World, type Building } from '../src/sim/world';

const CODE: Record<string, TrackType> = {
  S: 'straight', L: 'left', R: 'right', U: 'up', D: 'down', C: 'lift', B: 'brake', O: 'loop',
};

/** 역을 (10,10) rot 0에 놓는다: 칸 (10..12,10), 열차는 +x로 출발, 입구 (11,11). */
function setup(money = 50_000): { w: World; b: Building } {
  const w = new World();
  w.money = money;
  const b = placeBuilding(w, getDef('coaster'), 10, 10, 0)!;
  expect(b).not.toBeNull();
  return { w, b };
}

/** 코드 문자열대로 조각을 잇는다. 실패하면 그 이유를 반환. */
function build(w: World, b: Building, code: string) {
  for (const ch of code) {
    const r = appendPiece(w, b, CODE[ch]);
    if (!r.ok) return r;
  }
  return { ok: true as const };
}

/** 평평한 직사각형 루프 13조각 */
const FLAT = 'SRSRSSSSSRSRS';
/** 리프트 3칸으로 올라가 3칸 내려오는 21조각 루프 */
const HILL = 'CCCRDDDRSSSSSSSRSSSRS';
/**
 * 위 두 코스의 좌우 반전. 역 입구(11,11)는 진행 방향 오른쪽(+y)에 있어서
 * 우회전 루프는 입구를 루프 안에 가두고, 좌회전 루프는 입구를 바깥에 남긴다. 길이 필요한 테스트는 이쪽을 쓴다.
 */
const FLAT_OUT = 'SLSLSSSSSLSLS';
const HILL_OUT = 'CCCLDDDLSSSSSSSLSSSLS';

describe('station geometry', () => {
  it('lists the station tiles in travel order and starts the track after the last one', () => {
    const { b } = setup();
    expect(stationTiles(b)).toEqual([{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }]);
    expect(b.entrance).toEqual({ x: 11, y: 11 });
    expect(b.track!.cursor).toEqual({ x: 13, y: 10, dir: 0, h: 0 });
  });

  it('travels the other way when the station is rotated', () => {
    const w = new World();
    w.money = 50_000;
    const b = placeBuilding(w, getDef('coaster'), 20, 20, 2)!; // 진행 방향 -x
    expect(stationTiles(b)[0]).toEqual({ x: 22, y: 20 });
    expect(b.track!.cursor).toEqual({ x: 19, y: 20, dir: 2, h: 0 });
  });
});

describe('placing pieces', () => {
  it('moves the cursor, turns and changes height', () => {
    const { w, b } = setup();
    build(w, b, 'S');
    expect(b.track!.cursor).toMatchObject({ x: 14, y: 10, dir: 0, h: 0 });
    build(w, b, 'R'); // 우회전: +x → +y
    expect(b.track!.cursor).toMatchObject({ x: 14, y: 11, dir: 1, h: 0 });
    build(w, b, 'C');
    expect(b.track!.cursor).toMatchObject({ x: 14, y: 12, dir: 1, h: 1 });
    build(w, b, 'L'); // 좌회전: +y → +x
    expect(b.track!.cursor).toMatchObject({ x: 15, y: 12, dir: 0, h: 1 });
  });

  it('occupies the tiles so other buildings cannot be built on the track', () => {
    const { w, b } = setup();
    build(w, b, 'SS');
    const m = w.map;
    expect(m.occupant[m.index(13, 10)]).toBe(b.id);
    expect(buildingAt(w, 14, 10)).toBe(b);
    expect(placeBuilding(w, getDef('burger'), 13, 10, 0)).toBeNull();
  });

  it('charges per piece and refunds in full on undo', () => {
    const { w, b } = setup();
    const afterStation = w.money;
    expect(afterStation).toBe(50_000 - 800);
    build(w, b, 'SC');
    expect(w.money).toBe(afterStation - PIECE_COST.straight - PIECE_COST.lift);
    expect(b.track!.spent).toBe(800 + 60 + 100);
    expect(undoPiece(w, b)).toBe(true);
    expect(w.money).toBe(afterStation - PIECE_COST.straight);
    expect(clearTrack(w, b)).toBe(1);
    expect(w.money).toBe(afterStation);
    expect(b.track!.pieces).toHaveLength(0);
    expect(w.map.occupant[w.map.index(13, 10)]).toBe(0);
  });

  it('refuses pieces it cannot afford', () => {
    const { w, b } = setup(800 + 50);
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'money' });
  });

  it('refuses to go below the ground or above the height limit', () => {
    const { w, b } = setup();
    expect(canAppendPiece(w, b, 'down')).toEqual({ ok: false, reason: 'height' });
    expect(build(w, b, 'C'.repeat(8)).ok).toBe(true);
    expect(canAppendPiece(w, b, 'lift')).toEqual({ ok: false, reason: 'height' });
    expect(canAppendPiece(w, b, 'up')).toEqual({ ok: false, reason: 'height' });
  });

  it('refuses to cross itself or run into the station', () => {
    const { w, b } = setup();
    // (13,10) → (13,11) → (12,11) → 다음은 역 칸 (12,10)
    expect(build(w, b, 'RRR').ok).toBe(true);
    expect(b.track!.cursor).toMatchObject({ x: 12, y: 10 });
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'occupied' });
  });

  it('refuses to cover its own entrance tile or leave the map', () => {
    const { w, b } = setup();
    // (13,10) → (13,11) → (12,11) → (11,11)이 입구
    expect(build(w, b, 'RRS').ok).toBe(true);
    expect(b.track!.cursor).toMatchObject({ x: 11, y: 11 });
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'entrance' });

  });

  it('refuses to leave the map', () => {
    const w = new World();
    w.money = 50_000;
    const b = placeBuilding(w, getDef('coaster'), 0, 10, 2)!; // 서쪽(-x)으로 출발: 트랙 시작 칸이 맵 밖
    expect(b.track!.cursor.x).toBe(-1);
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'bounds' });
  });
});

describe('closing the loop', () => {
  it('is not complete (and not operational) until the train returns to the station', () => {
    const { w, b } = setup();
    build(w, b, FLAT.slice(0, -1));
    expect(b.track!.closed).toBe(false);
    expect(b.track!.ok).toBe(false);
    expect(buildingDef(b).fun).toBe(0);
    expect(w.network.isOperational(b)).toBe(false);
  });

  it('completes a flat loop and reports stats', () => {
    const { w, b } = setup();
    expect(build(w, b, FLAT).ok).toBe(true);
    const t = b.track!;
    expect(t.closed).toBe(true);
    expect(t.error).toBeNull();
    expect(t.ok).toBe(true);
    expect(t.stats).toMatchObject({ length: 13, maxDrop: 0, turns: 4 });
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'closed' });
  });

  it('does not close when it returns at the wrong height or direction', () => {
    const { w, b } = setup();
    // 높이 1로 돌아오는 코스
    build(w, b, 'CRSRSSSSSRSR'); // ... (9,10)에 도착하기 직전까지
    expect(b.track!.cursor).toMatchObject({ x: 9, y: 10, h: 1 });
    build(w, b, 'S');
    expect(b.track!.cursor).toMatchObject({ x: 10, y: 10, h: 1 });
    expect(b.track!.closed).toBe(false);
  });

  it('becomes operational once connected to the park entrance, and uses the computed stats', () => {
    const { w, b } = setup();
    build(w, b, FLAT_OUT);
    // 입구(11,11)에서 공원 입구(24,47)까지 길
    placePaths(w, lineTiles({ x: 11, y: 11 }, { x: 11, y: 47 }));
    placePaths(w, lineTiles({ x: 11, y: 47 }, w.map.gate));
    expect(w.network.isOperational(b)).toBe(true);
    const def = buildingDef(b);
    expect(def.fun).toBe(b.track!.stats!.fun);
    expect(def.duration).toBe(b.track!.stats!.duration);
    expect(def.cost).toBe(b.track!.spent);
    expect(def.upkeep).toBe(getDef('coaster').upkeep + 10 * 13);
    // 우회전 루프는 입구를 가둬서 길이 닿지 않는다
    const trapped = setup();
    build(trapped.w, trapped.b, FLAT);
    placePaths(trapped.w, lineTiles({ x: 11, y: 11 }, { x: 11, y: 47 }));
    placePaths(trapped.w, lineTiles({ x: 11, y: 47 }, trapped.w.map.gate));
    expect(trapped.w.network.isOperational(trapped.b)).toBe(false);
  });

  it('sets the price to the fair price the first time it is completed', () => {
    const { w, b } = setup();
    build(w, b, FLAT);
    expect(b.price).toBe(Math.round(b.track!.stats!.fun * 0.2));
  });
});

describe('physics', () => {
  it('stalls a course that only climbs', () => {
    const { w, b } = setup();
    build(w, b, 'UUUU');
    expect(b.track!.error).toMatch(/멈춥니다/);
    expect(b.track!.ok).toBe(false);
  });

  it('lets a chain lift climb without losing speed', () => {
    const { w, b } = setup();
    build(w, b, 'CCCC');
    expect(b.track!.error).toBeNull();
  });

  it('stalls an over-long flat course (friction)', () => {
    const { w, b } = setup();
    build(w, b, 'S'.repeat(30));
    expect(b.track!.error).not.toBeNull();
  });

  it('gives a tall course with a big drop more fun and intensity than a flat loop', () => {
    const flat = setup();
    build(flat.w, flat.b, FLAT);
    const hill = setup();
    expect(build(hill.w, hill.b, HILL).ok).toBe(true);
    expect(hill.b.track!.ok).toBe(true);
    const f = flat.b.track!.stats!;
    const h = hill.b.track!.stats!;
    expect(h.maxDrop).toBe(3);
    expect(h.fun).toBeGreaterThan(f.fun);
    expect(h.maxSpeed).toBeGreaterThan(f.maxSpeed);
    expect(h.intensity).toBeGreaterThan(f.intensity);
    expect(h.duration).toBeGreaterThan(f.duration);
  });

  it('raises nausea for consecutive turns in one direction', () => {
    const a = setup();
    build(a.w, a.b, 'SRSRSSSSSRSRS');
    const spiral = setup();
    build(spiral.w, spiral.b, 'RRRRRRRR'); // 같은 방향으로 계속 도는 나선(루프가 닫히지 않아도 계산됨)
    expect(spiral.b.track!.stats!.nausea).toBeGreaterThan(a.b.track!.stats!.nausea);
  });
});

describe('guest effects', () => {
  const ride = (over: Partial<ReturnType<typeof getDef>>) => ({ ...getDef('wheel'), ...over });
  const fresh = () => {
    const w = new World();
    const g = createGuest(w);
    g.needs.happiness = 10;
    g.needs.energy = 100;
    return g;
  };

  it('is unchanged for ordinary rides', () => {
    const g = fresh();
    applyEffects(g, getDef('wheel'));
    expect(g.needs.happiness).toBeCloseTo(10 + 60 * 0.25);
    expect(g.needs.energy).toBe(94);
    expect(g.thought).toBe('fun');
  });

  it('enjoys an over-intense ride less, tires on nausea, and gets scared', () => {
    const mild = fresh();
    applyEffects(mild, ride({ fun: 80, intensity: 40, nausea: 0 }));
    const wild = fresh();
    applyEffects(wild, ride({ fun: 80, intensity: 90, nausea: 50 }));
    expect(wild.needs.happiness).toBeLessThan(mild.needs.happiness);
    expect(wild.needs.energy).toBeLessThan(mild.needs.energy);
    expect(wild.thought).toBe('tooIntense');
    expect(mild.thought).toBe('fun');
  });
});

describe('running and demolishing', () => {
  function openPark(code: string): { w: World; b: Building } {
    const { w, b } = setup();
    build(w, b, code);
    placePaths(w, lineTiles({ x: 11, y: 11 }, { x: 11, y: 47 }));
    placePaths(w, lineTiles({ x: 11, y: 47 }, w.map.gate));
    return { w, b };
  }

  it('takes guests for a ride and earns money', () => {
    const { w, b } = openPark(HILL_OUT);
    for (let i = 0; i < 4000; i++) stepWorld(w);
    expect(b.served).toBeGreaterThan(0);
    expect(b.income).toBeGreaterThan(0);
  });

  it('refunds half of everything spent and frees every tile on demolish', () => {
    const { w, b } = setup();
    build(w, b, FLAT);
    const spent = b.track!.spent;
    const before = w.money;
    expect(demolishAt(w, 14, 11)).toBe(Math.floor(spent / 2)); // 트랙 위를 눌러도 코스터 전체 철거
    expect(w.money).toBe(before + Math.floor(spent / 2));
    expect(w.buildings.size).toBe(0);
    expect(w.map.occupant.every((v) => v === 0)).toBe(true);
  });

  it('places the train along the route', () => {
    const { w, b } = setup();
    build(w, b, FLAT);
    const t = b.track!;
    const start = routeAt(t.route, 0);
    const end = routeAt(t.route, 1);
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
    const hold = routeAt(t.route, t.holdT);
    expect(hold).toMatchObject({ x: 11.5, y: 10.5 });
  });
});

describe('saving', () => {
  it('round-trips the track (pieces, spent, occupancy and derived stats)', () => {
    const { w, b } = setup();
    build(w, b, HILL);
    const json = JSON.stringify(serializeWorld(w));
    expect(json).not.toContain('"route"'); // 파생 값은 저장하지 않는다
    const back = deserializeWorld(JSON.parse(json));
    const b2 = [...back.buildings.values()][0];
    expect(b2.track!.pieces).toEqual(b.track!.pieces);
    expect(b2.track!.spent).toBe(b.track!.spent);
    expect(b2.track!.ok).toBe(true);
    expect(b2.track!.stats).toEqual(b.track!.stats);
    expect(back.map.occupant).toEqual(w.map.occupant);
  });

  it('continues exactly like the original after loading', () => {
    const { w, b } = setup();
    build(w, b, HILL_OUT);
    placePaths(w, lineTiles({ x: 11, y: 11 }, { x: 11, y: 47 }));
    placePaths(w, lineTiles({ x: 11, y: 47 }, w.map.gate));
    for (let i = 0; i < 1500; i++) stepWorld(w);

    const copy = new World();
    copy.adopt(deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w)))));
    for (let i = 0; i < 1500; i++) { stepWorld(w); stepWorld(copy); }
    const snap = (x: World) => ({ money: x.money, tick: x.tick, guests: x.guests.length, entered: x.stats.entered, rating: x.rating });
    expect(snap(copy)).toEqual(snap(w));
    expect(START_MONEY).toBeGreaterThan(0);
  });

  it('still reads a version 1 save (no tracks)', () => {
    const w = new World();
    placeBuilding(w, getDef('carousel'), 20, 30, 0);
    const v1 = { ...serializeWorld(w), version: 1 };
    const r = parseSave(JSON.stringify(v1));
    expect(r.ok).toBe(true);
  });

  it('rejects a corrupt track', () => {
    const { w, b } = setup();
    build(w, b, 'SS');
    const d = JSON.parse(JSON.stringify(serializeWorld(w)));
    d.buildings[0].track.pieces = ['straight', 'warp'];
    expect(parseSave(JSON.stringify(d))).toEqual({ ok: false, reason: 'corrupt' });
    d.buildings[0].track.pieces = 'nope';
    expect(parseSave(JSON.stringify(d))).toEqual({ ok: false, reason: 'corrupt' });
  });
});

/** HILL_OUT의 긴 직선 한 칸을 바꾼 코스 (칸 수·모양이 같아 그대로 닫힌다) */
const swapAt = (code: string, i: number, ch: string): string => code.slice(0, i) + ch + code.slice(i + 1);
const BRAKE_AT = 10;

describe('brake', () => {
  it('caps the speed after it and lowers intensity', () => {
    const a = setup();
    build(a.w, a.b, HILL_OUT);
    const c = setup();
    expect(build(c.w, c.b, swapAt(HILL_OUT, BRAKE_AT, 'B')).ok).toBe(true);
    const plain = a.b.track!;
    const braked = c.b.track!;
    expect(braked.ok).toBe(true);
    expect(plain.speeds[BRAKE_AT]).toBeGreaterThan(1.3);
    expect(braked.speeds[BRAKE_AT]).toBeLessThanOrEqual(Math.sqrt(PHYSICS.brakeE) + 1e-9);
    expect(braked.speeds[BRAKE_AT + 1]).toBeLessThan(plain.speeds[BRAKE_AT + 1]);
    expect(braked.stats!.intensity).toBeLessThan(plain.stats!.intensity);
    expect(c.b.track!.spent - a.b.track!.spent).toBe(PIECE_COST.brake - PIECE_COST.straight);
  });
});

describe('loop', () => {
  it('fails at the loop when the entry speed is too low', () => {
    const { w, b } = setup();
    expect(build(w, b, 'SSO').ok).toBe(true);
    const t = b.track!;
    expect(t.error).toContain('속도가 부족해 루프를 못 넘음');
    expect(t.stallIndex).toBe(2);
    expect(t.ok).toBe(false);
  });

  it('completes with enough speed and boosts fun, intensity and nausea', () => {
    const a = setup();
    build(a.w, a.b, HILL_OUT);
    const c = setup();
    expect(build(c.w, c.b, swapAt(HILL_OUT, 9, 'O')).ok).toBe(true);
    const t = c.b.track!;
    expect(t.error).toBeNull();
    expect(t.ok).toBe(true);
    expect(t.stats!.loops).toBe(1);
    expect(t.stats!.fun).toBeGreaterThan(a.b.track!.stats!.fun);
    expect(t.stats!.intensity).toBeGreaterThan(a.b.track!.stats!.intensity);
    expect(t.stats!.nausea).toBeGreaterThan(a.b.track!.stats!.nausea);
    expect(t.speeds[9]).toBeLessThan(a.b.track!.speeds[9]); // 루프가 에너지를 더 깎는다
  });

  it('keeps one tile forward at the same height but occupies h..h+2', () => {
    const { w, b } = setup();
    build(w, b, 'CCCRDDDO');
    const p = b.track!.placed[b.track!.placed.length - 1];
    expect(p.hIn).toBe(0);
    expect(p.hOut).toBe(0);
    expect(pieceRange(p)).toEqual({ hMin: 0, hMax: 2 });
  });

  it('needs headroom under the height limit', () => {
    const { w, b } = setup();
    build(w, b, 'C'.repeat(7));
    expect(canAppendPiece(w, b, 'loop')).toEqual({ ok: false, reason: 'height' });
  });
});

describe('crossing at different heights', () => {
  // 낮은 구간이 (14,10)을 지나고, 되돌아오는 구간이 (14,10)을 위로 가로지른다
  const over = 'CCCRRSSR';
  const under = 'CCRRSR';

  it('allows crossing when the heights are 2+ apart', () => {
    const { w, b } = setup();
    expect(build(w, b, over).ok).toBe(true);
    expect(b.track!.cursor).toMatchObject({ x: 13, y: 10, dir: 3, h: 3 });
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: true });
  });

  it('rejects crossing when the heights are less than 2 apart', () => {
    const { w, b } = setup();
    expect(build(w, b, under).ok).toBe(true);
    expect(b.track!.cursor).toMatchObject({ x: 13, y: 10, h: 2 });
    expect(canAppendPiece(w, b, 'straight')).toEqual({ ok: false, reason: 'occupied' });
  });

  it('lets another coaster cross and keeps the lower one\'s occupancy', () => {
    const { w, b } = setup();
    build(w, b, 'SS'); // (13,10) (14,10) 낮게
    const b2 = placeBuilding(w, getDef('coaster'), 14, 5, 1)!; // +y로 출발, 칸 (14,5..7)
    expect(build(w, b2, 'CCC').ok).toBe(true); // (14,8) (14,9) (14,10)을 높이 0→3으로
    const idx = w.map.index(14, 10);
    expect(w.map.occupant[idx]).toBe(b.id);
    demolishAt(w, 14, 5);
    expect(w.buildings.has(b2.id)).toBe(false);
    expect(w.map.occupant[idx]).toBe(b.id);
    expect(w.map.occupant[w.map.index(14, 9)]).toBe(0);
    demolishAt(w, 10, 10);
    expect(w.map.occupant.every((v) => v === 0)).toBe(true);
  });

  it('keeps the occupancy of the lower piece when the upper one is undone', () => {
    const { w, b } = setup();
    build(w, b, over);
    build(w, b, 'S'); // (13,10)을 위로 지난다
    expect(w.map.occupant[w.map.index(13, 10)]).toBe(b.id);
    undoPiece(w, b);
    expect(w.map.occupant[w.map.index(13, 10)]).toBe(b.id);
    expect(trackOccupancy(w).get(w.map.index(13, 10))).toHaveLength(1);
  });

  it('does not allow building under elevated track', () => {
    const { w, b } = setup();
    build(w, b, over);
    // (16,11)에는 높이 3의 조각이 있다
    expect(canPlaceBuilding(w, getDef('carousel'), 16, 11, 0)).toMatchObject({ ok: false });
  });
});

describe('elevated track over paths', () => {
  it('goes over a path at height 2+, leaves the path walkable and refuses low pieces on it', () => {
    const { w, b } = setup();
    placePaths(w, [{ x: 14, y: 11 }]);
    expect(build(w, b, 'CCCRRSSR').ok).toBe(true); // (14,11)를 높이 3으로 지난다
    const i = w.map.index(14, 11);
    expect(w.map.isPath(14, 11)).toBe(true);
    expect(w.map.occupant[i]).toBe(0);
    expect(trackOccupancy(w).has(i)).toBe(true);
    // 길 위의 철거는 길만 걷어낸다
    const c = setup();
    placePaths(c.w, [{ x: 13, y: 10 }]);
    expect(canAppendPiece(c.w, c.b, 'straight')).toEqual({ ok: false, reason: 'occupied' });
  });
});

describe('test run support data', () => {
  it('exposes per-piece speed profile and the stall piece', () => {
    const { w, b } = setup();
    build(w, b, 'SSS');
    expect(b.track!.speeds).toHaveLength(3);
    expect(b.track!.pieceT).toHaveLength(3);
    expect(b.track!.stallIndex).toBeNull();
    build(w, b, 'S'.repeat(30));
    expect(b.track!.stallIndex).not.toBeNull();
    const [a, e] = b.track!.pieceT[b.track!.stallIndex!];
    expect(e).toBeGreaterThan(a);
  });
});

describe('saving new pieces', () => {
  it('round-trips brake, loop and crossings', () => {
    const { w, b } = setup();
    build(w, b, swapAt(swapAt(HILL_OUT, BRAKE_AT, 'B'), 9, 'O'));
    expect(b.track!.ok).toBe(true);
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    const b2 = [...back.buildings.values()][0];
    expect(b2.track!.pieces).toEqual(b.track!.pieces);
    expect(b2.track!.stats).toEqual(b.track!.stats);
    expect(back.map.occupant).toEqual(w.map.occupant);

    const c = setup();
    build(c.w, c.b, 'CCCRRSS');
    const back2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(c.w))));
    expect(back2.map.occupant).toEqual(c.w.map.occupant);
  });

  it('rejects a saved track that crosses at the same height', () => {
    const { w, b } = setup();
    build(w, b, 'CCRRSR');
    const d = JSON.parse(JSON.stringify(serializeWorld(w)));
    d.buildings[0].track.pieces.push('straight');
    expect(parseSave(JSON.stringify(d))).toEqual({ ok: false, reason: 'corrupt' });
  });
});
