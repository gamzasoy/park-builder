import { describe, expect, it } from 'vitest';
import { pickTile } from '../src/input/pick';
import { tileToWorld, tileToWorldZ } from '../src/render/iso';
import { cornerLevels, surfaceLevel } from '../src/render/relief';
import { placePaths } from '../src/sim/building';
import { TileMap } from '../src/sim/map';
import { World } from '../src/sim/world';

/** 타일 윗면 중앙의 월드 좌표 */
const topCenter = (m: TileMap, x: number, y: number) => tileToWorldZ(x + 0.5, y + 0.5, m.heightAt(x, y));

describe('pickTile', () => {
  it('flat map: same as the plain inverse', () => {
    const m = new TileMap();
    for (const [x, y] of [[3, 4], [10, 2], [20, 30]]) {
      const w = tileToWorld(x + 0.5, y + 0.5);
      expect(pickTile(m, w.x, w.y).tile).toEqual({ x, y });
    }
  });

  it('hits the raised tile under the cursor, not the flat-plane tile', () => {
    const m = new TileMap();
    m.setHeight(10, 10, 1);
    m.setHeight(10, 11, 1);
    m.setHeight(11, 10, 1);
    m.setHeight(11, 11, 2);
    const w = topCenter(m, 11, 11);
    // 평면 가정으로는 (11,11)이 아니라 더 뒤쪽 칸이 나온다
    expect(pickTile(m, w.x, w.y).tile).toEqual({ x: 11, y: 11 });
    const w2 = topCenter(m, 11, 10);
    expect(pickTile(m, w2.x, w2.y).tile).toEqual({ x: 11, y: 10 });
  });

  it('front-most tile wins over a taller one behind; lower tiles behind a hill are hidden', () => {
    const m = new TileMap();
    // 언덕: (20,20)=3, 주변은 계단
    const h: Record<string, number> = { '20,20': 3, '19,20': 2, '20,19': 2, '19,19': 1, '21,20': 2, '20,21': 2, '21,21': 1, '21,19': 1, '19,21': 1 };
    for (const [k, v] of Object.entries(h)) {
      const [x, y] = k.split(',').map(Number);
      m.setHeight(x, y, v);
    }
    for (const k of Object.keys(h)) {
      const [x, y] = k.split(',').map(Number);
      const w = topCenter(m, x, y);
      const got = pickTile(m, w.x, w.y).tile;
      // 윗면 중앙이 앞 칸에 가려지지 않는 한 자기 자신이 나와야 한다
      const front = [[x + 1, y], [x, y + 1], [x + 1, y + 1]].some(([fx, fy]) => m.heightAt(fx, fy) >= m.heightAt(x, y) + 1);
      if (!front) expect(got).toEqual({ x, y });
    }
  });

  it('cliff face resolves to the tile on top', () => {
    const m = new TileMap();
    m.setHeight(10, 10, 1);
    // (10,10)의 오른쪽 앞 절벽(R-B 변) 중간 높이 0.5 지점
    const p = tileToWorldZ(11, 10.5, 0.5);
    expect(pickTile(m, p.x, p.y).tile).toEqual({ x: 10, y: 10 });
  });

  it('outside the map still resolves (ground plane)', () => {
    const m = new TileMap();
    const w = tileToWorld(-3.5, 2.5);
    expect(pickTile(m, w.x, w.y).tile).toEqual({ x: -4, y: 2 });
  });
});

describe('relief', () => {
  it('path ramp corners follow connected neighbours', () => {
    const w = new World();
    const m = w.map;
    m.setHeight(5, 5, 1);
    m.setHeight(5, 4, 2);
    placePaths(w, [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }]);
    expect(cornerLevels(m, 5, 5)).toEqual([1.5, 1.5, 0.5, 0.5]); // 북쪽(2)으로 오르고 남쪽(0)으로 내려가는 비탈
    expect(surfaceLevel(m, 5.5, 5.5)).toBeCloseTo(1);
    expect(cornerLevels(m, 7, 7)).toEqual([0, 0, 0, 0]);
  });
});
