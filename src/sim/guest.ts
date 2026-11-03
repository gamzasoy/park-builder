import { BIN } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import { buildingDef } from './coaster';
import { fairPrice } from './economy';
import type { Tile } from './map';
import { isRaining, RAIN_DRAIN, RAIN_DRAIN_EVERY, RAIN_RIDE_PENALTY } from './weather';
import type { Building, World } from './world';

/** 틱당 이동 거리(타일). 10틱/초 → 초당 2타일 */
export const GUEST_SPEED = 0.2;
const DECIDE_EVERY = 5; // 목표 재선택 주기(틱)
const IDLE_GIVE_UP = 150; // 갈 곳이 없을 때 퇴장까지 대기 틱
const MAX_AGE = 9000; // 최대 체류 틱
const MIN_SCORE = 20;
/** 비 오는 날 우산이 없는 손님이 우산 가게에 매기는 점수 */
export const UMBRELLA_SCORE = 70;

/** 대기열 최대 길이: 이보다 길면 손님이 포기 */
export const MAX_QUEUE = 15;
/** 대기열에서 참는 최대 틱 */
export const PATIENCE = 400;

/** 머리 위 말풍선에 표시되는 생각 */
export type Thought =
  | 'hungry' | 'thirsty' | 'toilet' | 'tired' | 'unhappy'
  | 'fun' | 'tooIntense' | 'queueFull' | 'waited' | 'broke' | 'tooOld' | 'bored' | 'expensive' | 'scenery' | 'litter' | 'broken' | 'rain';
/** 생각이 머무는 시간(틱) */
export const THOUGHT_TICKS = 60;
const NEED_CHECK_EVERY = 30;
/** 걷는 길 옆(8칸)에 나무·꽃이 있으면 이 주기마다 행복도가 오른다 */
export const SCENERY_EVERY = 30;
export const SCENERY_GAIN = 1;

/** 먹거리를 산 손님이 쓰레기를 버리기까지 걸리는 틱(최소~최대, 손님 id·틱으로 결정) */
export const TRASH_MIN = 30;
export const TRASH_MAX = 80;
/** 쓰레기통을 찾는 반경(타일) */
export const BIN_RADIUS = 3;
/** 주변 쓰레기를 살피는 주기(틱) / 반경(타일) / 불쾌해지는 쓰레기 합 */
export const LITTER_EVERY = 30;
export const LITTER_RADIUS = 2;
export const LITTER_LIMIT = 4;
export const LITTER_PENALTY = 1;

/** idle 대기 / walking·leaving 이동 / queueing 입구 앞 줄서기 / visiting 시설 안(숨김) */
export type GuestState = 'idle' | 'walking' | 'queueing' | 'visiting' | 'leaving' | 'gone';

/** hunger/thirst/toilet: 0(괜찮음)~100(한계), energy: 100(충분)~0, happiness: 0~100 */
export interface Needs {
  happiness: number;
  hunger: number;
  thirst: number;
  toilet: number;
  energy: number;
}

export interface Guest {
  id: number;
  /** 타일 좌표계의 현재 위치(타일 중앙 = 정수 + 0.5) */
  x: number;
  y: number;
  /** 직전 틱 위치(렌더 보간용) */
  px: number;
  py: number;
  /** 마지막으로 도달한 길 타일 */
  tile: Tile;
  state: GuestState;
  needs: Needs;
  money: number;
  path: readonly Tile[];
  pathIdx: number;
  /** 경로를 계산한 시점의 map.version */
  pathVersion: number;
  /** 목표 건물 id */
  target: number | null;
  /** idle·queueing 대기 틱 / visiting 남은 틱 */
  timer: number;
  /** 대기열 내 순번(렌더 위치용) */
  slot: number;
  age: number;
  /** 최근 방문한 건물 id (같은 시설 반복 방지) */
  visited: number[];
  /** 외형 색 인덱스 */
  look: number;
  /** 현재 떠올린 생각(말풍선) */
  thought: Thought | null;
  thoughtTimer: number;
  /** 쓰레기를 버리기까지 남은 틱(0 = 들고 있지 않음) */
  trash: number;
  /** 우산을 샀는가 */
  umbrella: boolean;
}

export function createGuest(world: World): Guest {
  const c = world.map.gate;
  const r = world.rng;
  return {
    id: world.nextGuestId++,
    x: c.x + 0.5,
    y: c.y + 0.5,
    px: c.x + 0.5,
    py: c.y + 0.5,
    tile: { x: c.x, y: c.y },
    state: 'idle',
    needs: {
      happiness: r.int(70, 90),
      hunger: r.int(0, 30),
      thirst: r.int(0, 30),
      toilet: r.int(0, 20),
      energy: r.int(80, 100),
    },
    money: r.int(40, 120),
    path: [],
    pathIdx: 0,
    pathVersion: -1,
    target: null,
    timer: 0,
    slot: 0,
    age: 0,
    visited: [],
    look: r.int(0, 7),
    thought: null,
    thoughtTimer: 0,
    trash: 0,
    umbrella: false,
  };
}

export function think(g: Guest, t: Thought): void {
  g.thought = t;
  g.thoughtTimer = THOUGHT_TICKS;
}

/** 가장 급한 욕구에서 나오는 생각 */
function needThought(g: Guest): Thought | null {
  const n = g.needs;
  if (n.hunger > 80) return 'hungry';
  if (n.thirst > 80) return 'thirsty';
  if (n.toilet > 80) return 'toilet';
  if (n.energy < 20) return 'tired';
  if (n.happiness < 25) return 'unhappy';
  return null;
}

/** 현재 타일 주변 8칸에 장식이 있는지 */
export function nearScenery(world: World, t: Tile): boolean {
  const m = world.map;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (dx || dy) {
        const k = m.sceneryAt(t.x + dx, t.y + dy);
        if (k !== 0 && k !== BIN) return true;
      }
  }
  return false;
}

/** 경치 보너스: 걷는 동안 주기적으로 주변을 보고 기분이 조금 좋아진다(RNG를 쓰지 않는다) */
function tickScenery(world: World, g: Guest): void {
  if (g.state !== 'walking' && g.state !== 'leaving') return;
  const phase = (world.tick + g.id) % SCENERY_EVERY;
  if (phase !== SCENERY_EVERY >> 1 || !nearScenery(world, g.tile)) return;
  g.needs.happiness = clamp(g.needs.happiness + SCENERY_GAIN);
  if (g.thought === null && (world.tick + g.id) % (SCENERY_EVERY * 8) === SCENERY_EVERY >> 1) think(g, 'scenery');
}

/** 쓰레기를 버릴 시간이 되면 근처 쓰레기통에, 없으면 지금 서 있는 길에 버린다 */
function tickTrash(world: World, g: Guest): void {
  if (g.trash <= 0 || g.state === 'visiting' || g.state === 'gone') return;
  if (--g.trash > 0) return;
  const m = world.map;
  for (let dy = -BIN_RADIUS; dy <= BIN_RADIUS; dy++) {
    for (let dx = -BIN_RADIUS; dx <= BIN_RADIUS; dx++) if (m.sceneryAt(g.tile.x + dx, g.tile.y + dy) === BIN) return;
  }
  if (!m.isPath(g.tile.x, g.tile.y)) return;
  const i = m.index(g.tile.x, g.tile.y);
  m.litter[i] = Math.min(3, m.litter[i] + 1);
}

/** 주변 길에 쓰레기가 많으면 기분이 나빠진다(RNG를 쓰지 않는다) */
function tickLitter(world: World, g: Guest): void {
  if (g.state === 'visiting' || g.state === 'gone') return;
  if ((world.tick + g.id) % LITTER_EVERY !== 7) return;
  const m = world.map;
  let sum = 0;
  for (let dy = -LITTER_RADIUS; dy <= LITTER_RADIUS; dy++) {
    for (let dx = -LITTER_RADIUS; dx <= LITTER_RADIUS; dx++) sum += m.litterAt(g.tile.x + dx, g.tile.y + dy);
  }
  if (sum < LITTER_LIMIT) return;
  g.needs.happiness = clamp(g.needs.happiness - LITTER_PENALTY);
  if (g.thought === null) think(g, 'litter');
}

/** 비를 맞으면(우산 없이 시설 밖) 기분이 조금씩 나빠진다(RNG를 쓰지 않는다) */
function tickRain(world: World, g: Guest): void {
  if (g.umbrella || g.state === 'visiting' || g.state === 'gone' || !isRaining(world)) return;
  if ((world.tick + g.id) % RAIN_DRAIN_EVERY !== 13) return;
  g.needs.happiness = clamp(g.needs.happiness - RAIN_DRAIN);
  if (g.thought === null) think(g, 'rain');
}

function tickThought(world: World, g: Guest): void {
  if (g.thoughtTimer > 0 && --g.thoughtTimer === 0) g.thought = null;
  if (g.thought === null && (world.tick + g.id) % NEED_CHECK_EVERY === 0) {
    const t = needThought(g);
    if (t) think(g, t);
  }
}

export function updateGuest(world: World, g: Guest): void {
  g.px = g.x;
  g.py = g.y;
  g.age++;
  tickNeeds(g);
  tickThought(world, g);
  tickScenery(world, g);
  tickTrash(world, g);
  tickLitter(world, g);
  tickRain(world, g);

  switch (g.state) {
    case 'idle': return idle(world, g);
    case 'walking':
    case 'leaving': return walk(world, g);
    case 'queueing': return queueing(world, g);
    case 'visiting':
      // 시설 쪽(venue)이 타이머와 해제를 관리. 시설이 사라졌다면 풀어 준다.
      if (g.target === null || !world.buildings.has(g.target)) goIdle(g);
      return;
    case 'gone': return;
  }
}

function tickNeeds(g: Guest): void {
  const n = g.needs;
  n.hunger = Math.min(100, n.hunger + 0.04);
  n.thirst = Math.min(100, n.thirst + 0.05);
  n.toilet = Math.min(100, n.toilet + 0.03);
  n.energy = Math.max(0, n.energy - 0.02);

  let unhappy = 0;
  if (n.hunger > 80) unhappy += 0.05;
  if (n.thirst > 80) unhappy += 0.05;
  if (n.toilet > 80) unhappy += 0.05;
  if (n.energy < 20) unhappy += 0.03;
  n.happiness = clamp(n.happiness - unhappy);
}

const clamp = (v: number): number => Math.max(0, Math.min(100, v));

/** 공원을 떠나기로 한 이유(없으면 null). 말풍선에도 쓰인다. */
function leaveCause(g: Guest): Thought | null {
  if (g.needs.happiness < 12) return 'unhappy';
  if (g.needs.energy < 8) return 'tired';
  if (g.money < 10) return 'broke';
  if (g.age > MAX_AGE) return 'tooOld';
  return null;
}

/** 운영 중인 시설 중 적정가보다 비싼 곳이 있는가 */
function anyOverpriced(world: World): boolean {
  for (const b of world.buildings.values()) {
    if (world.network.isOperational(b) && b.price > fairPrice(buildingDef(b))) return true;
  }
  return false;
}

function idle(world: World, g: Guest): void {
  g.timer++;
  const cause = leaveCause(g);
  if (cause) {
    think(g, cause);
    return startLeaving(world, g);
  }
  if ((world.tick + g.id) % DECIDE_EVERY !== 0) return;

  const pick = pickTarget(world, g);
  if (pick) {
    g.target = pick.b.id;
    setPath(world, g, pick.path);
    g.state = 'walking';
    g.timer = 0;
  } else if (g.timer > IDLE_GIVE_UP) {
    think(g, anyOverpriced(world) ? 'expensive' : 'bored');
    startLeaving(world, g);
  }
}

/** 욕구·재미·거리·요금을 점수화해 가장 좋은 운영 중인 시설을 고른다. */
export function pickTarget(world: World, g: Guest): { b: Building; path: readonly Tile[] } | null {
  let best: { b: Building; path: readonly Tile[] } | null = null;
  let bestScore = MIN_SCORE;

  for (const b of world.buildings.values()) {
    if (!world.network.isOperational(b)) continue;
    const def = buildingDef(b);
    if (b.price > g.money || b.queue.length >= MAX_QUEUE) continue;
    const path = world.network.findPath(g.tile, b.entrance);
    if (!path) continue;

    let score: number;
    if (def.kind === 'shop') {
      if (def.umbrella) {
        // 비 올 때 우산이 없는 손님만 원한다
        if (!isRaining(world) || g.umbrella) continue;
        score = UMBRELLA_SCORE;
      } else {
        if (!def.serves) continue;
        const need = g.needs[def.serves];
        if (need < 40) continue;
        score = need * (def.serves === 'toilet' ? 1.4 : 1.1);
      }
    } else {
      if (g.needs.energy < 20) continue;
      score = (def.fun ?? 0) + world.rng.next() * 20 - (g.visited.includes(b.id) ? 35 : 0);
      if (def.outdoor && isRaining(world) && !g.umbrella) score -= RAIN_RIDE_PENALTY;
    }
    // 거리·줄·요금 부담, 그리고 적정가를 넘는 만큼 추가 감점
    score -= path.length * 0.4 + b.queue.length * 3 + b.price * 0.3 + Math.max(0, b.price - fairPrice(def));

    if (score > bestScore) {
      bestScore = score;
      best = { b, path };
    }
  }
  return best;
}

/** 길 위를 걷는 개체(손님·직원)가 공유하는 이동 상태 */
export interface Walker {
  x: number;
  y: number;
  tile: Tile;
  path: readonly Tile[];
  pathIdx: number;
  pathVersion: number;
}

export function setPath(world: World, g: Walker, path: readonly Tile[]): void {
  g.path = path;
  g.pathIdx = 1;
  g.pathVersion = world.map.version;
}

function startLeaving(world: World, g: Guest): void {
  const path = world.network.findPath(g.tile, world.map.gate);
  g.target = null;
  if (!path) return despawn(world, g);
  setPath(world, g, path);
  g.state = 'leaving';
}

function despawn(world: World, g: Guest): void {
  leaveQueue(world, g);
  g.state = 'gone';
  world.stats.left++;
}

export function goIdle(g: Guest): void {
  g.state = 'idle';
  g.target = null;
  g.timer = 0;
}

function walk(world: World, g: Guest): void {
  if (g.state === 'walking') {
    if (g.target === null || !world.buildings.has(g.target)) return goIdle(g); // 철거됨
  }
  if (g.pathVersion !== world.map.version && !replan(world, g)) return;

  if (!advance(g, GUEST_SPEED)) return;
  if (g.state === 'leaving') despawn(world, g);
  else arrive(world, g);
}

/** 길이 바뀌었을 때 현재 타일에서 경로를 다시 계산. 계속 걸을 수 있으면 true. */
function replan(world: World, g: Guest): boolean {
  if (!world.map.isPath(g.tile.x, g.tile.y)) {
    despawn(world, g); // 서 있던 길이 철거됨
    return false;
  }
  if (g.state === 'leaving') {
    const path = world.network.findPath(g.tile, world.map.gate);
    if (!path) { despawn(world, g); return false; }
    setPath(world, g, path);
    return true;
  }
  const b = g.target !== null ? world.buildings.get(g.target) : undefined;
  const path = b && world.network.isOperational(b) ? world.network.findPath(g.tile, b.entrance) : null;
  if (!path) { goIdle(g); return false; }
  setPath(world, g, path);
  return true;
}

/** 경로를 따라 dist만큼 이동. 경로 끝에 도달했으면 true. */
export function advance(g: Walker, dist: number): boolean {
  while (dist > 0 && g.pathIdx < g.path.length) {
    const t = g.path[g.pathIdx];
    const tx = t.x + 0.5;
    const ty = t.y + 0.5;
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d <= dist) {
      g.x = tx;
      g.y = ty;
      g.tile = t;
      g.pathIdx++;
      dist -= d;
    } else {
      g.x += (dx / d) * dist;
      g.y += (dy / d) * dist;
      dist = 0;
    }
  }
  return g.pathIdx >= g.path.length;
}

/** 입구에 도착: 줄을 선다. 요금은 탑승/구매 시점에 시설(venue)이 받는다. */
function arrive(world: World, g: Guest): void {
  const b = g.target !== null ? world.buildings.get(g.target) : undefined;
  if (!b || !world.network.isOperational(b)) return goIdle(g);
  if (b.price > g.money) return goIdle(g);
  if (b.queue.length >= MAX_QUEUE) {
    // 줄이 너무 길어 포기
    g.needs.happiness = clamp(g.needs.happiness - 3);
    think(g, 'queueFull');
    remember(g, b.id);
    return goIdle(g);
  }
  b.queue.push(g.id);
  g.slot = b.queue.length - 1;
  g.state = 'queueing';
  g.timer = 0;
}

function queueing(world: World, g: Guest): void {
  // 서 있는 길이 철거되면 사라짐
  if (g.pathVersion !== world.map.version) {
    g.pathVersion = world.map.version;
    if (!world.map.isPath(g.tile.x, g.tile.y)) return despawn(world, g);
  }
  if (++g.timer > PATIENCE) {
    leaveQueue(world, g);
    g.needs.happiness = clamp(g.needs.happiness - 8);
    think(g, 'waited');
    if (g.target !== null) remember(g, g.target);
    goIdle(g);
  }
}

function leaveQueue(world: World, g: Guest): void {
  if (g.state !== 'queueing' || g.target === null) return;
  const b = world.buildings.get(g.target);
  const i = b ? b.queue.indexOf(g.id) : -1;
  if (b && i >= 0) b.queue.splice(i, 1);
}

/** 최근 방문 목록에 기록(최대 5개) */
export function remember(g: Guest, buildingId: number): void {
  g.visited.push(buildingId);
  if (g.visited.length > 5) g.visited.shift();
}

/** 이용을 마친 손님에게 시설 효과를 적용 */
export function applyEffects(g: Guest, def: BuildingDef): void {
  const n = g.needs;
  if (def.kind === 'ride') {
    // 강도가 너무 높은 코스터는 덜 즐겁고, 멀미가 심하면 에너지가 더 깎인다(일반 놀이기구는 둘 다 0)
    const intensity = def.intensity ?? 0;
    const gain = (def.fun ?? 0) * 0.25 * (intensity > 75 ? 0.5 : 1);
    n.happiness = clamp(n.happiness + gain);
    n.energy = clamp(n.energy - 6 - (def.nausea ?? 0) * 0.1);
    n.hunger = clamp(n.hunger + 4);
    n.thirst = clamp(n.thirst + 4);
    think(g, intensity > 85 ? 'tooIntense' : 'fun');
  } else if (def.umbrella) {
    g.umbrella = true;
    n.happiness = clamp(n.happiness + 4);
  } else if (def.serves) {
    n[def.serves] = clamp(n[def.serves] - 70);
    n.happiness = clamp(n.happiness + 6);
  }
}
