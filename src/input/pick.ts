import { terrainPx, worldToTile, type Vec2 } from '../render/iso';
import { surfaceLevel } from '../render/relief';
import { MAX_TERRAIN, type TileMap } from '../sim/map';

export interface Picked {
  /** 마우스 아래 지표면 점의 타일 좌표(실수) */
  pos: Vec2;
  /** 그 점의 높이(단계) */
  level: number;
  tile: { x: number; y: number };
}

const STEP = 1 / 8;

/**
 * 월드 좌표 (wx, wy)의 화면 점 아래에 보이는 지표면을 찾는다.
 * 시선은 높이 e에서 평면 위치 (wx, wy + e·px)에 해당하므로, 가장 높은 곳(MAX_TERRAIN)에서 땅 쪽으로 내려오며
 * 처음으로 지표면 이하가 되는 점이 보이는 점이다. 높이가 다른 칸의 윗면과 옆면(절벽) 모두 위에 있는 칸으로 잡힌다.
 * 구간을 찾은 뒤 이분법으로 칸 경계 오차를 줄인다.
 */
export function pickTile(map: TileMap, wx: number, wy: number): Picked {
  const at = (e: number): { x: number; y: number; hit: boolean } => {
    const t = worldToTile(wx, wy + terrainPx(e));
    return { x: t.x, y: t.y, hit: e <= surfaceLevel(map, t.x, t.y) + 1e-9 };
  };
  let miss = MAX_TERRAIN + 0.5; // 이 높이의 점은 공중이라고 본다(지형 최고점보다 위)
  let hit = miss;
  let cur = at(miss);
  if (cur.hit) return finish(cur, miss);
  for (;;) {
    hit = Math.max(0, miss - STEP);
    cur = at(hit);
    if (cur.hit) break;
    miss = hit;
  }
  // miss(공중) ~ hit(땅 속) 사이를 이분법으로 좁힌다
  for (let i = 0; i < 6; i++) {
    const m = (hit + miss) / 2;
    if (at(m).hit) hit = m; else miss = m;
  }
  return finish(at(hit), hit);
}

function finish(p: { x: number; y: number }, level: number): Picked {
  return { pos: { x: p.x, y: p.y }, level, tile: { x: Math.floor(p.x), y: Math.floor(p.y) } };
}
