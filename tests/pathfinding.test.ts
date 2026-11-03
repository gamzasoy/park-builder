import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { demolishAt, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { World } from '../src/sim/world';

/** 입구에서 위로 n칸(입구 제외 n칸 + 입구) 직선 길 */
function spine(w: World, n: number): void {
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - n }));
}

describe('PathNetwork.findPath', () => {
  it('returns the shortest straight path inclusive of both ends', () => {
    const w = new World();
    spine(w, 5);
    const g = w.map.gate;
    const p = w.network.findPath(g, { x: g.x, y: g.y - 5 })!;
    expect(p).toHaveLength(6);
    expect(p[0]).toEqual(g);
    expect(p[5]).toEqual({ x: g.x, y: g.y - 5 });
  });

  it('routes around a corner (L shape) and every step is adjacent', () => {
    const w = new World();
    const g = w.map.gate;
    spine(w, 3);
    placePaths(w, lineTiles({ x: g.x, y: g.y - 3 }, { x: g.x + 4, y: g.y - 3 }));
    const p = w.network.findPath(g, { x: g.x + 4, y: g.y - 3 })!;
    expect(p).toHaveLength(8); // 3 up + 4 right + start
    for (let i = 1; i < p.length; i++) {
      expect(Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y)).toBe(1);
    }
  });

  it('picks the shorter branch when two routes exist', () => {
    const w = new World();
    // 2x? 고리: (10,10)->(14,10) 위쪽 길 5칸, 아래로 우회하는 긴 길
    placePaths(w, lineTiles({ x: 10, y: 10 }, { x: 14, y: 10 }));
    placePaths(w, lineTiles({ x: 10, y: 11 }, { x: 10, y: 13 }));
    placePaths(w, lineTiles({ x: 10, y: 13 }, { x: 14, y: 13 }));
    placePaths(w, lineTiles({ x: 14, y: 11 }, { x: 14, y: 13 }));
    const p = w.network.findPath({ x: 10, y: 10 }, { x: 14, y: 10 })!;
    expect(p).toHaveLength(5);
  });

  it('handles same tile, non-path endpoints and disconnected islands', () => {
    const w = new World();
    placePaths(w, [{ x: 5, y: 5 }, { x: 5, y: 6 }]);
    placePaths(w, [{ x: 20, y: 20 }]);
    expect(w.network.findPath({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }]);
    expect(w.network.findPath({ x: 5, y: 5 }, { x: 5, y: 7 })).toBeNull(); // 도착이 길 아님
    expect(w.network.findPath({ x: 5, y: 5 }, { x: 20, y: 20 })).toBeNull(); // 끊김
  });
});

describe('cache', () => {
  it('reuses results until the path layout changes', () => {
    const w = new World();
    spine(w, 4);
    const g = w.map.gate;
    const a = { x: g.x, y: g.y - 4 };
    const first = w.network.findPath(g, a);
    expect(w.network.findPath(g, a)).toBe(first); // 같은 객체 = 캐시 적중
    placePaths(w, [{ x: g.x + 1, y: g.y }]); // 길 변경 → 무효화
    const second = w.network.findPath(g, a);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('sees newly connected and newly broken routes', () => {
    const w = new World();
    placePaths(w, lineTiles({ x: 5, y: 5 }, { x: 5, y: 8 }));
    placePaths(w, lineTiles({ x: 5, y: 10 }, { x: 5, y: 12 }));
    expect(w.network.findPath({ x: 5, y: 5 }, { x: 5, y: 12 })).toBeNull();
    placePaths(w, [{ x: 5, y: 9 }]);
    expect(w.network.findPath({ x: 5, y: 5 }, { x: 5, y: 12 })).toHaveLength(8);
    demolishAt(w, 5, 9);
    expect(w.network.findPath({ x: 5, y: 5 }, { x: 5, y: 12 })).toBeNull();
  });
});

describe('reachability / operational', () => {
  it('only tiles connected to the gate are reachable', () => {
    const w = new World();
    const g = w.map.gate;
    spine(w, 3);
    placePaths(w, [{ x: 2, y: 2 }]);
    expect(w.network.isReachable(g.x, g.y)).toBe(true);
    expect(w.network.isReachable(g.x, g.y - 3)).toBe(true);
    expect(w.network.isReachable(2, 2)).toBe(false);
    expect(w.network.isReachable(30, 30)).toBe(false); // 길 아님
    expect(w.network.isReachable(-1, 0)).toBe(false);
  });

  it('a building runs only while its entrance is joined to the gate', () => {
    const w = new World();
    const g = w.map.gate;
    spine(w, 8); // y: 47..39
    // 회전목마 2x2, 커서 기준 앵커 (g.x-1, 36)~ → 입구 (g.x, 38)
    const b = placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0)!;
    expect(b.entrance).toEqual({ x: g.x, y: 38 });
    expect(w.network.isOperational(b)).toBe(false); // 길이 39까지 → 입구 38은 길이 아님
    placePaths(w, [{ x: g.x, y: 38 }]);
    expect(w.network.isOperational(b)).toBe(true);
    demolishAt(w, g.x, 42); // 중간 끊기
    expect(w.network.isOperational(b)).toBe(false);
  });
});
