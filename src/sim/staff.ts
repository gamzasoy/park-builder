import { hash32 } from '../core/hash';
import type { Tile } from './map';
import { advance, setPath, type Walker } from './guest';
import { buildingDef } from './coaster';
import { INSPECT_BELOW, MAX_RELIABILITY } from './ride';
import type { Building, World } from './world';

/** 직원 종류. janitor는 쓰레기를, mechanic은 놀이기구 고장·점검을 맡는다. */
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
  /** 정비공이 맡은 일(수리/점검). 일이 없으면 undefined */
  job?: 'repair' | 'inspect';
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

/** 정비공 작업 시간(틱)과 회복량 */
export const REPAIR_TICKS = 60;
export const REPAIR_GAIN = 30;
export const INSPECT_TICKS = 30;
export const INSPECT_GAIN = 10;

export function updateStaff(world: World, s: Staff): void {
  s.px = s.x;
  s.py = s.y;
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
    if (--s.timer <= 0) {
      finishJob(world, s);
      s.state = 'idle';
      s.target = null;
    }
    return;
  }

  if (s.state === 'walking') {
    if (s.target && !jobValid(world, s) && s.pathIdx < s.path.length) {
      // 다른 직원이 이미 처리했거나 필요가 사라졌다
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
    if (s.target && jobValid(world, s)) {
      s.state = 'working';
      s.timer = jobTicks(s);
    } else {
      s.state = 'idle';
      s.target = null;
    }
    return;
  }

  // idle: 일거리를 찾아 간다. 없으면 근처를 배회.
  if ((world.tick + s.id) % THINK_EVERY !== 0) return;
  const found = s.kind === 'janitor' ? findLitterJob(world, s) : findRideJob(world, s);
  if (found) {
    if (found.length <= 1) {
      s.target = found[0];
      s.state = 'working';
      s.timer = jobTicks(s);
      return;
    }
    s.target = found[found.length - 1];
    setPath(world, s, found);
    s.state = 'walking';
    return;
  }
  wander(world, s);
}

/** 목표 타일이 가리키는 놀이기구(입구가 그 타일인 것). 고장 난 것을 우선한다. */
function rideAtEntrance(world: World, t: Tile): Building | null {
  let found: Building | null = null;
  for (const b of world.buildings.values()) {
    if (b.entrance.x !== t.x || b.entrance.y !== t.y || buildingDef(b).kind !== 'ride') continue;
    if (b.broken) return b;
    found ??= b;
  }
  return found;
}

/** 지금 목표에 할 일이 남아 있는가 */
function jobValid(world: World, s: Staff): boolean {
  const t = s.target;
  if (!t) return false;
  if (s.kind === 'janitor') return world.map.litterAt(t.x, t.y) > 0;
  const b = rideAtEntrance(world, t);
  if (!b) return false;
  return s.job === 'repair' ? b.broken : !b.broken && b.reliability < INSPECT_BELOW;
}

function jobTicks(s: Staff): number {
  if (s.kind === 'janitor') return SWEEP_TICKS;
  return s.job === 'repair' ? REPAIR_TICKS : INSPECT_TICKS;
}

function finishJob(world: World, s: Staff): void {
  const t = s.target!;
  const m = world.map;
  if (s.kind === 'janitor') {
    m.litter[m.index(t.x, t.y)] = 0;
    return;
  }
  const b = rideAtEntrance(world, t);
  if (!b) return;
  if (b.broken) {
    b.broken = false;
    b.brokenTicks = 0;
    b.reliability = Math.min(MAX_RELIABILITY, b.reliability + REPAIR_GAIN);
  } else {
    b.reliability = Math.min(MAX_RELIABILITY, b.reliability + INSPECT_GAIN);
  }
  s.job = undefined;
}

function findLitterJob(world: World, s: Staff): Tile[] | null {
  const m = world.map;
  const claimed = new Set<number>();
  for (const o of world.staff) if (o !== s && o.kind === 'janitor' && o.target) claimed.add(m.index(o.target.x, o.target.y));
  return nearestDirty(world, s.tile, claimed);
}

/** 고장 난 놀이기구(가까운 순) → 없으면 신뢰도가 가장 낮은 놀이기구를 점검 */
function findRideJob(world: World, s: Staff): Tile[] | null {
  const claimed = new Set<number>();
  const m = world.map;
  for (const o of world.staff) if (o !== s && o.kind === 'mechanic' && o.target) claimed.add(m.index(o.target.x, o.target.y));
  const free = (b: Building): boolean => !claimed.has(m.index(b.entrance.x, b.entrance.y));

  let best: readonly Tile[] | null = null;
  for (const b of world.buildings.values()) {
    if (!b.broken || !free(b)) continue;
    const path = world.network.findPath(s.tile, b.entrance);
    if (path && (!best || path.length < best.length)) best = path;
  }
  if (best) {
    s.job = 'repair';
    return [...best];
  }

  let weakest: Building | null = null;
  for (const b of world.buildings.values()) {
    if (buildingDef(b).kind !== 'ride' || b.reliability >= INSPECT_BELOW || !free(b)) continue;
    if (weakest && b.reliability >= weakest.reliability) continue; // 동률이면 id가 작은 쪽
    if (world.network.findPath(s.tile, b.entrance)) weakest = b;
  }
  if (weakest) {
    s.job = 'inspect';
    return [...world.network.findPath(s.tile, weakest.entrance)!];
  }
  return null;
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
