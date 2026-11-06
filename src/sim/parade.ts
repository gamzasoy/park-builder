import { hash32 } from '../core/hash';
import { DAY_TICKS } from './economy';
import { think } from './guest';
import type { Tile } from './map';
import { connected } from './pathfinding';
import type { World } from './world';

/** 퍼레이드 비용 / 행렬이 1틱에 나아가는 거리(타일) / 행렬 길이(칸) */
export const PARADE_COST = 800;
export const PARADE_SPEED = 0.08;
/** 행렬을 이루는 차례: 인형탈과 꽃차가 번갈아 선다 */
export const PARADE_UNITS = ['mascot', 'float', 'mascot', 'float', 'drum'] as const;
export type ParadeUnit = (typeof PARADE_UNITS)[number];
/** 앞뒤 행렬 사이 간격(타일) */
export const PARADE_GAP = 1.1;
/** 행진 경로의 최소·최대 길이(칸) */
export const PARADE_MIN_ROUTE = 6;
export const PARADE_MAX_ROUTE = 70;
/** 구경하는 반경(칸) / 행복이 오르는 주기(틱) / 오르는 양(아이는 두 배) */
export const PARADE_RADIUS = 3;
export const PARADE_CHEER_EVERY = 10;
export const PARADE_CHEER = 1;
/** 퍼레이드 중 입장 확률 배수 */
export const PARADE_SPAWN_FACTOR = 1.3;

export interface Parade {
  start: number;
  end: number;
  /** 공원 입구에서 출발해 길을 따라 도는 경로(이웃한 칸끼리 이어져 있다) */
  route: Tile[];
}

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * 공원 입구에서 출발해 아직 지나지 않은 가장 가까운 길로 차례로 옮겨 가는 행진 경로.
 * 길이는 PARADE_MAX_ROUTE 칸까지. 같은 길 구성이면 언제나 같은 경로다.
 */
export function paradeRoute(world: World): Tile[] {
  const m = world.map;
  const n = m.width * m.height;
  const seen = new Uint8Array(n);
  let cur = m.index(m.gate.x, m.gate.y);
  seen[cur] = 1;
  const route: Tile[] = [{ x: m.gate.x, y: m.gate.y }];
  const prev = new Int32Array(n);
  while (route.length < PARADE_MAX_ROUTE) {
    // 지금 칸에서 BFS로 아직 지나지 않은 가장 가까운 길을 찾는다
    prev.fill(-1);
    prev[cur] = cur;
    const queue = [cur];
    let goal = -1;
    for (let head = 0; head < queue.length && goal < 0; head++) {
      const c = queue[head];
      const cx = c % m.width;
      const cy = (c / m.width) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!connected(m, cx, cy, nx, ny)) continue;
        const ni = m.index(nx, ny);
        if (prev[ni] !== -1) continue;
        prev[ni] = c;
        if (!seen[ni]) { goal = ni; break; }
        queue.push(ni);
      }
    }
    if (goal < 0) break;
    const leg: number[] = [];
    for (let i = goal; i !== cur; i = prev[i]) leg.push(i);
    leg.reverse();
    for (const i of leg) {
      if (route.length >= PARADE_MAX_ROUTE) break;
      seen[i] = 1;
      route.push({ x: i % m.width, y: (i / m.width) | 0 });
    }
    cur = goal;
  }
  return route;
}

/** 행렬이 끝까지 지나가는 데 걸리는 틱 */
export function paradeTicks(routeLen: number): number {
  return Math.ceil((routeLen - 1 + PARADE_GAP * (PARADE_UNITS.length - 1)) / PARADE_SPEED);
}

/** 퍼레이드를 시작한다. 할 수 없으면 이유를, 성공하면 null을 반환 */
export function startParade(world: World): string | null {
  if (world.status === 'won' || world.status === 'lost') return '게임이 끝났습니다';
  if (world.parade) return '이미 퍼레이드 중입니다';
  const day = Math.floor(world.tick / DAY_TICKS);
  if (world.lastParadeDay === day) return '퍼레이드는 하루에 한 번만 할 수 있습니다';
  if (world.money < PARADE_COST) return '돈이 부족합니다';
  const route = paradeRoute(world);
  if (route.length < PARADE_MIN_ROUTE) return `행진할 길이 부족합니다 (입구에서 이어진 길 ${PARADE_MIN_ROUTE}칸 이상 필요)`;
  world.transact('parade', -PARADE_COST);
  world.lastParadeDay = day;
  world.stats.parades = (world.stats.parades ?? 0) + 1;
  world.parade = { start: world.tick, end: world.tick + paradeTicks(route.length), route };
  return null;
}

/** 경로 위 거리 d(타일)의 위치. 경로 밖(아직 출발 전이거나 이미 도착)이면 null */
export function routePos(route: readonly Tile[], d: number): { x: number; y: number; dir: number } | null {
  if (d < 0 || d > route.length - 1 || route.length === 0) return null;
  const i = Math.min(route.length - 2, Math.floor(d));
  if (i < 0) return { x: route[0].x + 0.5, y: route[0].y + 0.5, dir: 0 };
  const a = route[i];
  const b = route[i + 1];
  const f = d - i;
  return { x: a.x + 0.5 + (b.x - a.x) * f, y: a.y + 0.5 + (b.y - a.y) * f, dir: b.x - a.x + (b.y - a.y) * 2 };
}

/** 행렬 각 차례의 위치(행렬 맨 앞이 0번). 아직 출발하지 않았거나 이미 도착한 차례는 null */
export function paradeUnits(p: Parade, time: number): ({ x: number; y: number; dir: number; unit: ParadeUnit } | null)[] {
  const lead = (time - p.start) * PARADE_SPEED;
  return PARADE_UNITS.map((unit, i) => {
    const pos = routePos(p.route, lead - i * PARADE_GAP);
    return pos ? { ...pos, unit } : null;
  });
}

/** 매 틱: 행렬 가까이 있는 손님의 기분이 오르고, 끝나면 퍼레이드를 닫는다 */
export function updateParade(world: World): void {
  const p = world.parade;
  if (!p) return;
  const t = world.tick;
  if (t >= p.end) {
    world.parade = null;
    return;
  }
  if ((t - p.start) % PARADE_CHEER_EVERY !== 0) return;
  const units = paradeUnits(p, t).filter((u) => u !== null);
  if (!units.length) return;
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone') continue;
    if (!units.some((u) => Math.max(Math.abs(u.x - g.x), Math.abs(u.y - g.y)) <= PARADE_RADIUS)) continue;
    g.needs.happiness = Math.min(100, g.needs.happiness + PARADE_CHEER * (g.kid ? 2 : 1));
    if (!g.thought && hash32(g.id, t, 47) % 3 === 0) think(g, 'parade');
  }
}
