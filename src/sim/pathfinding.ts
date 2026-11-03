import type { Tile, TileMap } from './map';
import type { Building } from './world';

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MAX_CACHE = 4000;

/**
 * 길 타일 위의 4방향 그래프.
 * - 공원 입구에서 닿을 수 있는 타일 집합(reach)과 BFS 최단 경로를 제공
 * - 결과는 map.version이 바뀌면(길 설치/철거) 전부 무효화
 */
export class PathNetwork {
  private seenVersion = -1;
  private reach: Uint8Array;
  private cache = new Map<number, readonly Tile[] | null>();

  constructor(private map: TileMap) {
    this.reach = new Uint8Array(map.width * map.height);
  }

  /** 공원 입구에서 길을 따라 도달 가능한가 */
  isReachable(x: number, y: number): boolean {
    this.sync();
    return this.map.inBounds(x, y) && this.reach[this.map.index(x, y)] === 1;
  }

  /** 건물이 운영 가능한가: 입구 타일이 공원 입구와 이어진 길이어야 하고, 롤러코스터는 트랙도 완성돼야 함 */
  isOperational(b: Building): boolean {
    if (b.track && !b.track.ok) return false;
    return this.isReachable(b.entrance.x, b.entrance.y);
  }

  /** from→to 최단 경로(양 끝 포함). 둘 다 길이어야 하며 이어져 있지 않으면 null. 결과는 읽기 전용. */
  findPath(from: Tile, to: Tile): readonly Tile[] | null {
    this.sync();
    const map = this.map;
    if (!map.isPath(from.x, from.y) || !map.isPath(to.x, to.y)) return null;

    const key = map.index(from.x, from.y) * map.width * map.height + map.index(to.x, to.y);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const result = this.bfs(from, to);
    if (this.cache.size >= MAX_CACHE) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }

  private sync(): void {
    if (this.seenVersion === this.map.version) return;
    this.seenVersion = this.map.version;
    this.cache.clear();
    this.reach.fill(0);

    const map = this.map;
    const queue: number[] = [map.index(map.gate.x, map.gate.y)];
    this.reach[queue[0]] = 1;
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const cx = cur % map.width;
      const cy = (cur / map.width) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!map.isPath(nx, ny)) continue;
        const ni = map.index(nx, ny);
        if (this.reach[ni]) continue;
        this.reach[ni] = 1;
        queue.push(ni);
      }
    }
  }

  private bfs(from: Tile, to: Tile): readonly Tile[] | null {
    const map = this.map;
    const start = map.index(from.x, from.y);
    const goal = map.index(to.x, to.y);
    if (start === goal) return [{ x: from.x, y: from.y }];

    const prev = new Int32Array(map.width * map.height).fill(-1);
    prev[start] = start;
    const queue: number[] = [start];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const cx = cur % map.width;
      const cy = (cur / map.width) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!map.isPath(nx, ny)) continue;
        const ni = map.index(nx, ny);
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        if (ni === goal) return this.unwind(prev, start, goal);
        queue.push(ni);
      }
    }
    return null;
  }

  private unwind(prev: Int32Array, start: number, goal: number): Tile[] {
    const out: Tile[] = [];
    for (let i = goal; ; i = prev[i]) {
      out.push({ x: i % this.map.width, y: (i / this.map.width) | 0 });
      if (i === start) break;
    }
    return out.reverse();
  }
}
