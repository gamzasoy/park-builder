import { hash32 } from '../core/hash';
import type { Tile } from './map';
import { advance, setPath, type Walker } from './guest';
import type { World } from './world';

/** 직원 종류. mechanic(정비공)은 이후 단계에서 쓴다(지금은 고용·행동이 없다). */
export type StaffKind = 'janitor' | 'mechanic';
/** idle 대기 / walking 이동 / working 작업 중(제자리) */
export type StaffState = 'idle' | 'walking' | 'working';

export const STAFF_SPEED = 0.16;
/** 청소에 걸리는 틱 */
export const SWEEP_TICKS = 20;
/** 한 번에 고용할 수 있는 직원 수 상한 */
export const MAX_STAFF = 30;
/** 일거리를 찾는 주기(틱, 직원 id로 어긋나게 한다) */
const THINK_EVERY = 5;

export interface Staff extends Walker {
  id: number;
  kind: StaffKind;
  /** 타일 좌표계의 현재 위치(타일 중앙 = 정수 + 0.5) */
  x: number;
  y: number;
  /** 직전 틱 위치(렌더 보간용) */
  px: number;
  py: number;
  state: StaffState;
  /** 이동·작업 목표 타일(배회 중이면 null) */
  target: Tile | null;
  /** 작업 남은 틱 */
  timer: number;
}

export const STAFF_NAME: Record<StaffKind, string> = { janitor: '청소부', mechanic: '정비공' };

/** 공원 입구에 직원을 새로 세운다. 상한이면 null. */
export function hireStaff(world: World, kind: StaffKind): Staff | null {
  if (world.staff.length >= MAX_STAFF) return null;
  const c = world.map.gate;
  const s: Staff = {
    id: world.nextStaffId++,
    kind,
    x: c.x + 0.5,
    y: c.y + 0.5,
    px: c.x + 0.5,
    py: c.y + 0.5,
    tile: { x: c.x, y: c.y },
    path: [],
    pathIdx: 0,
    pathVersion: world.map.version,
    state: 'idle',
    target: null,
    timer: 0,
  };
  world.staff.push(s);
  return s;
}

export function fireStaff(world: World, id: number): boolean {
  const i = world.staff.findIndex((s) => s.id === id);
  if (i < 0) return false;
  world.staff.splice(i, 1);
  return true;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function updateStaff(world: World, s: Staff): void {
  s.px = s.x;
  s.py = s.y;
  if (s.kind === 'janitor') updateJanitor(world, s);
}

function updateJanitor(world: World, s: Staff): void {
  const m = world.map;
  // 서 있던 길이 철거되면 입구로 돌아온다
  if (!m.isPath(s.tile.x, s.tile.y)) {
    const c = m.gate;
    s.x = s.px = c.x + 0.5;
    s.y = s.py = c.y + 0.5;
    s.tile = { x: c.x, y: c.y };
    s.path = [];
    s.pathIdx = 0;
    s.state = 'idle';
    s.target = null;
  }

  if (s.state === 'working') {
    const t = s.target!;
    if (--s.timer <= 0) {
      m.litter[m.index(t.x, t.y)] = 0;
      s.state = 'idle';
      s.target = null;
    }
    return;
  }

  if (s.state === 'walking') {
    if (s.target && m.litterAt(s.target.x, s.target.y) === 0 && s.pathIdx < s.path.length) {
      // 다른 청소부가 이미 치웠다
      s.state = 'idle';
      s.target = null;
      return;
    }
    if (s.pathVersion !== m.version) {
      const path = s.target ? world.network.findPath(s.tile, s.target) : null;
      if (!path) {
        s.state = 'idle';
        s.target = null;
        return;
      }
      setPath(world, s, path);
    }
    if (!advance(s, STAFF_SPEED)) return;
    if (s.target && m.litterAt(s.target.x, s.target.y) > 0) {
      s.state = 'working';
      s.timer = SWEEP_TICKS;
    } else {
      s.state = 'idle';
      s.target = null;
    }
    return;
  }

  // idle: 가까운 더러운 길을 찾아 간다. 없으면 근처를 배회.
  if ((world.tick + s.id) % THINK_EVERY !== 0) return;
  const claimed = new Set<number>();
  for (const o of world.staff) if (o !== s && o.target) claimed.add(m.index(o.target.x, o.target.y));
  const found = nearestDirty(world, s.tile, claimed);
  if (found) {
    if (found.length <= 1) {
      s.target = found[0];
      s.state = 'working';
      s.timer = SWEEP_TICKS;
      return;
    }
    s.target = found[found.length - 1];
    setPath(world, s, found);
    s.state = 'walking';
    return;
  }
  wander(world, s);
}

/** 길을 따라 BFS로 가장 가까운(다른 직원이 맡지 않은) 쓰레기 있는 길 타일까지의 경로 */
function nearestDirty(world: World, from: Tile, claimed: ReadonlySet<number>): Tile[] | null {
  const m = world.map;
  const start = m.index(from.x, from.y);
  const prev = new Int32Array(m.width * m.height).fill(-1);
  prev[start] = start;
  const queue: number[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (m.litter[cur] > 0 && !claimed.has(cur)) {
      const out: Tile[] = [];
      for (let i = cur; ; i = prev[i]) {
        out.push({ x: i % m.width, y: (i / m.width) | 0 });
        if (i === start) break;
      }
      return out.reverse();
    }
    const cx = cur % m.width;
    const cy = (cur / m.width) | 0;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!m.isPath(nx, ny)) continue;
      const ni = m.index(nx, ny);
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return null;
}

/** 이웃한 길 한 칸으로 느긋하게 걷는다(RNG 대신 해시로 방향을 정한다) */
function wander(world: World, s: Staff): void {
  const m = world.map;
  const opts: Tile[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    if (m.isPath(s.tile.x + dx, s.tile.y + dy)) opts.push({ x: s.tile.x + dx, y: s.tile.y + dy });
  }
  if (opts.length === 0) return;
  const next = opts[hash32(s.id, world.tick, 3) % opts.length];
  s.target = null;
  setPath(world, s, [s.tile, next]);
  s.state = 'walking';
}
