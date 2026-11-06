import { hash32 } from '../core/hash';
import type { Tile } from './map';
import { advance, setPath, think, TRASH_MAX, TRASH_MIN, type Walker } from './guest';
import { buildingDef } from './coaster';
import { connected } from './pathfinding';
import { INSPECT_BELOW, MAX_RELIABILITY } from './ride';
import type { Building, World } from './world';
import { guardCatch, isSpotted } from './thief';

/**
 * 직원 종류. janitor는 쓰레기를, mechanic은 놀이기구 고장·점검을 맡는다.
 * entertainer는 긴 줄 앞에서 공연해 손님 기분과 인내심을 살리고, vendor는 걸어 다니며 음료를 판다.
 * security(경비원)는 순찰하며 곁의 소매치기를 잡고, 들킨 도둑을 쫓아간다(sim/thief.ts).
 */
export type StaffKind = 'janitor' | 'mechanic' | 'entertainer' | 'vendor' | 'security';
export const STAFF_KINDS: readonly StaffKind[] = ['janitor', 'mechanic', 'entertainer', 'vendor', 'security'];
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

export const STAFF_NAME: Record<StaffKind, string> = { janitor: '청소부', mechanic: '정비공', entertainer: '인형탈 연기자', vendor: '음료 판매원', security: '경비원' };

/** 연기자: 이 길이 이상인 줄을 찾아가 SHOW_TICKS 동안 공연한다 */
export const SHOW_QUEUE = 3;
export const SHOW_TICKS = 100;
/** 공연 효과: CHEER_EVERY 틱마다 반경 CHEER_RADIUS 칸 안 손님의 행복 +1, 줄 선 손님은 기다린 시간 −CHEER_PATIENCE */
export const CHEER_EVERY = 10;
export const CHEER_RADIUS = 3;
export const CHEER_PATIENCE = 20;
/** 판매원: 갈증이 VENDOR_THIRST 이상인 손님을 찾아가 VENDOR_PRICE에 음료를 판다(갈증 −VENDOR_QUENCH) */
export const VENDOR_THIRST = 50;
export const VENDOR_PRICE = 5;
export const VENDOR_QUENCH = 50;
/** 판매원이 손님을 찾는 범위(가로+세로 칸) / 판매 거리 / 한 번 멈춰 서는 틱 */
const VENDOR_SEEK = 12;
const VENDOR_REACH = 1.5;
const VENDOR_PAUSE = 10;

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

  if (s.kind === 'entertainer' && s.state === 'working' && (world.tick + s.id) % CHEER_EVERY === 0) cheer(world, s);
  if (s.kind === 'vendor' && (world.tick + s.id) % THINK_EVERY === 0) sell(world, s);
  if (s.kind === 'security') return patrol(world, s);

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
  const found =
    s.kind === 'janitor' ? findLitterJob(world, s)
    : s.kind === 'mechanic' ? findRideJob(world, s)
    : s.kind === 'entertainer' ? findShowJob(world, s)
    : findCustomer(world, s);
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
  if (s.kind === 'entertainer' || s.kind === 'vendor') return true;
  const b = rideAtEntrance(world, t);
  if (!b) return false;
  return s.job === 'repair' ? b.broken : !b.broken && b.reliability < INSPECT_BELOW;
}

function jobTicks(s: Staff): number {
  if (s.kind === 'janitor') return SWEEP_TICKS;
  if (s.kind === 'entertainer') return SHOW_TICKS;
  if (s.kind === 'vendor') return VENDOR_PAUSE;
  return s.job === 'repair' ? REPAIR_TICKS : INSPECT_TICKS;
}

function finishJob(world: World, s: Staff): void {
  const t = s.target!;
  const m = world.map;
  if (s.kind === 'janitor') {
    m.litter[m.index(t.x, t.y)] = 0;
    return;
  }
  if (s.kind !== 'mechanic') return;
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

/** 다른 연기자가 맡지 않은 가장 긴 줄(SHOW_QUEUE 이상)의 입구까지 경로 */
function findShowJob(world: World, s: Staff): Tile[] | null {
  const m = world.map;
  const claimed = new Set<number>();
  for (const o of world.staff) if (o !== s && o.kind === 'entertainer' && o.target) claimed.add(m.index(o.target.x, o.target.y));
  let best: Building | null = null;
  for (const b of world.buildings.values()) {
    if (b.queue.length < SHOW_QUEUE || claimed.has(m.index(b.entrance.x, b.entrance.y))) continue;
    if (best && b.queue.length <= best.queue.length) continue;
    if (world.network.findPath(s.tile, b.entrance)) best = b;
  }
  return best ? [...world.network.findPath(s.tile, best.entrance)!] : null;
}

/** 음료를 살 수 있는 상태의 목마른 손님인가 */
function wantsDrink(g: { state: string; money: number; needs: { thirst: number } }): boolean {
  return (g.state === 'idle' || g.state === 'walking' || g.state === 'queueing') && g.needs.thirst >= VENDOR_THIRST && g.money >= VENDOR_PRICE;
}

/** 가까운(VENDOR_SEEK 안) 목마른 손님이 서 있는 길까지 경로 */
function findCustomer(world: World, s: Staff): Tile[] | null {
  let best: readonly Tile[] | null = null;
  for (const g of world.guests) {
    if (!wantsDrink(g) || Math.abs(g.tile.x - s.tile.x) + Math.abs(g.tile.y - s.tile.y) > VENDOR_SEEK) continue;
    const path = world.network.findPath(s.tile, g.tile);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best ? [...best] : null;
}

/** 공연: 주변 손님의 기분을 올리고, 줄 선 손님은 기다린 시간을 덜어 준다 */
function cheer(world: World, s: Staff): void {
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone' || g.state === 'leaving') continue;
    if (Math.abs(g.x - s.x) > CHEER_RADIUS || Math.abs(g.y - s.y) > CHEER_RADIUS) continue;
    g.needs.happiness = Math.min(100, g.needs.happiness + 1);
    if (g.state === 'queueing') g.timer = Math.max(0, g.timer - CHEER_PATIENCE);
    if (!g.thought) think(g, 'show');
  }
}

/** 판매원 바로 옆의 목마른 손님 한 명에게 음료를 판다 */
function sell(world: World, s: Staff): void {
  for (const g of world.guests) {
    if (!wantsDrink(g) || Math.hypot(g.x - s.x, g.y - s.y) > VENDOR_REACH) continue;
    g.money -= VENDOR_PRICE;
    world.transact('shops', VENDOR_PRICE);
    g.needs.thirst = Math.max(0, g.needs.thirst - VENDOR_QUENCH);
    g.needs.happiness = Math.min(100, g.needs.happiness + 3);
    if (g.trash === 0) g.trash = TRASH_MIN + (hash32(g.id, world.tick, 11) % (TRASH_MAX - TRASH_MIN + 1));
    return;
  }
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
      if (!connected(m, cx, cy, nx, ny)) continue;
      const ni = m.index(nx, ny);
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return null;
}

/** 경비원이 걷는 속도(도둑을 쫓을 때) / 쫓을 도둑을 다시 찾는 주기(틱) */
export const GUARD_SPEED = 0.22;
const GUARD_REPLAN = 10;

/** 경비원: 곁의 도둑을 잡고, 들킨 도둑이 있으면 쫓아가고(경로는 주기적으로 다시 잡는다), 없으면 순찰한다 */
function patrol(world: World, s: Staff): void {
  if (guardCatch(world, s)) {
    s.state = 'idle';
    s.target = null;
    return;
  }
  const replan = (world.tick + s.id) % GUARD_REPLAN === 0;
  if (s.state === 'walking') {
    if (s.pathVersion !== world.map.version) {
      s.state = 'idle';
      s.target = null;
    } else if (advance(s, s.target ? GUARD_SPEED : STAFF_SPEED)) {
      s.state = 'idle';
      s.target = null;
    }
    // 순찰 중인 한 칸은 마저 걷고, 쫓는 중이면 주기마다 도둑 위치로 경로를 다시 잡는다
    if (s.state === 'walking' && !(replan && s.target)) return;
  } else if (!replan && (world.tick + s.id) % THINK_EVERY !== 0) {
    return;
  }
  // 들킨 도둑 중 가장 가까운 곳으로
  let best: readonly Tile[] | null = null;
  for (const g of world.guests) {
    if (!isSpotted(world, g) || g.state === 'gone') continue;
    const path = world.network.findPath(s.tile, g.tile);
    if (path && (!best || path.length < best.length)) best = path;
  }
  if (best && best.length >= 2) {
    s.target = best[best.length - 1];
    setPath(world, s, best);
    s.state = 'walking';
    return;
  }
  s.state = 'idle';
  s.target = null;
  wander(world, s);
}

/** 이웃한 길 한 칸으로 느긋하게 걷는다(RNG 대신 해시로 방향을 정한다) */
function wander(world: World, s: Staff): void {
  const m = world.map;
  const opts: Tile[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    if (connected(m, s.tile.x, s.tile.y, s.tile.x + dx, s.tile.y + dy)) opts.push({ x: s.tile.x + dx, y: s.tile.y + dy });
  }
  if (opts.length === 0) return;
  const next = opts[hash32(s.id, world.tick, 3) % opts.length];
  s.target = null;
  setPath(world, s, [s.tile, next]);
  s.state = 'walking';
}
