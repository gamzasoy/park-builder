import { describe, expect, it } from 'vitest';
import { cornerLevels } from '../src/render/relief';
import { connected } from '../src/sim/pathfinding';
import { TileMap } from '../src/sim/map';

/** 이웃한 두 길 칸이 이어져 있으면, 맞닿은 변의 두 모서리 높이가 같아야 이음새가 안 보인다 */
describe('경사 길 이음새', () => {
  it('이어진 길의 맞닿은 변은 높이가 일치한다', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const bad: string[] = [];
    for (let trial = 0; trial < 60; trial++) {
      const m = new TileMap();
      for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) {
        m.setHeight(x, y, Math.floor(rnd() * 3));
        if (rnd() < 0.7) m.path[m.index(x, y)] = 1;
      }
      for (let y = 10; y < 19; y++) for (let x = 10; x < 19; x++) {
        // [T,R,B,L]; 동쪽 이웃: A.R==B.T, A.B==B.L / 남쪽 이웃: A.L==B.T, A.B==B.R
        if (connected(m, x, y, x + 1, y)) {
          const a = cornerLevels(m, x, y); const b = cornerLevels(m, x + 1, y);
          if (a[1] !== b[0] || a[2] !== b[3]) bad.push(`E ${trial} ${x},${y}`);
        }
        if (connected(m, x, y, x, y + 1)) {
          const a = cornerLevels(m, x, y); const b = cornerLevels(m, x, y + 1);
          if (a[3] !== b[0] || a[2] !== b[1]) bad.push(`S ${trial} ${x},${y}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
