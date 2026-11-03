import { describe, expect, it } from 'vitest';
import { occludingTiles } from '../src/render/ground';
import { TileMap } from '../src/sim/map';

const hill = (): TileMap => {
  const m = new TileMap();
  for (let y = 20; y <= 22; y++) for (let x = 20; x <= 22; x++) m.setHeight(x, y, 1);
  return m;
};
const run = (m: TileMap, x: number, y: number, h = 0) => {
  const out = new Map<number, { tx: number; ty: number }>();
  occludingTiles(m, x, y, h, 40, out);
  return [...out.values()];
};

describe('언덕 가림', () => {
  it('언덕 바로 뒤에 선 물체는 앞의 솟은 칸에 가려진다', () => {
    const tiles = run(hill(), 21.5, 19.5);
    expect(tiles.some((t) => t.tx >= 20 && t.tx <= 22 && t.ty >= 20 && t.ty <= 22)).toBe(true);
  });
  it('언덕 앞이나 평지에서는 가림 칸이 없다', () => {
    expect(run(hill(), 21.5, 24.5)).toEqual([]);
    expect(run(new TileMap(), 21.5, 19.5)).toEqual([]);
  });
  it('언덕 위에 선 물체는 같은 높이 칸에 가려지지 않는다', () => {
    expect(run(hill(), 20.5, 20.5, 1)).toEqual([]);
  });
});
