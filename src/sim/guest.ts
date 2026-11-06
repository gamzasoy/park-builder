import { hash32 } from '../core/hash';
import { BIN, FOUNTAIN } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import { buildingDef } from './coaster';
import { fairPrice } from './economy';
import type { Tile } from './map';
import { HEAT_THIRST } from './events';
import { addReview, GRIPES } from './reviews';
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
/** 카페: 에너지가 이보다 낮은 손님만 찾는다 / 이용 후 회복량 */
export const REST_BELOW = 50;
export const REST_GAIN = 45;
/** 기념품 가게: 행복이 이 이상이고, 요금 말고도 이만큼 돈이 남는 손님만 산다 */
export const SOUVENIR_HAPPY = 70;
export const SOUVENIR_SPARE = 20;

/** 풍선 가게: 행복이 이 이상인 손님만 산다 / 아이와 함께 온 가족이 매기는 점수 / 혼자 온 손님의 기본 점수 */
export const BALLOON_HAPPY = 50;
export const BALLOON_FAMILY_SCORE = 60;
export const BALLOON_SCORE = 28;
/** 풍선 색 가짓수(렌더러가 같은 수의 색을 쓴다) */
export const BALLOON_COLORS = 6;
/** 풍선을 놓칠지 살피는 주기(틱)와 확률(%) — 아이는 더 자주 놓친다 */
export const BALLOON_SLIP_EVERY = 50;
export const BALLOON_SLIP = 2;
export const BALLOON_SLIP_KID = 4;
/** 놓친 풍선이 하늘로 날아가는 연출 시간(틱) / 동시에 보여 주는 최대 수 */
export const FLOAT_TICKS = 90;
export const MAX_FLOATERS = 24;

/** 대기열 최대 길이: 이보다 길면 손님이 포기 */
export const MAX_QUEUE = 15;
/** 대기열에서 참는 최대 틱 */
export const PATIENCE = 400;

/** 머리 위 말풍선에 표시되는 생각 */
export type Thought =
  | 'hungry' | 'thirsty' | 'toilet' | 'tired' | 'unhappy'
  | 'fun' | 'tooIntense' | 'queueFull' | 'waited' | 'broke' | 'tooOld' | 'bored' | 'expensive' | 'scenery' | 'litter' | 'broken' | 'rain' | 'show' | 'fireworks' | 'fountain' | 'vipHappy' | 'vipSad' | 'rainbow'
  | 'lost' | 'lostKid' | 'reunited' | 'kidFun'
  | 'balloon' | 'balloonLost' | 'photo' | 'parade';
/** 생각이 머무는 시간(틱) */
export const THOUGHT_TICKS = 60;
const NEED_CHECK_EVERY = 30;
/** 걷는 길 옆(8칸)에 나무·꽃이 있으면 이 주기마다 행복도가 오른다 */
export const SCENERY_EVERY = 30;
export const SCENERY_GAIN = 1;
/** 분수 반경(칸)과 추가 행복 */
export const FOUNTAIN_RADIUS = 3;
export const FOUNTAIN_GAIN = 2;
/** VIP: 원하는 놀이기구에 더하는 점수 / 머무는 최대 틱 / 이뤄 주면 받는 상금 */
export const VIP_WISH_BONUS = 150;
export const VIP_TICKS = 1500;
export const VIP_REWARD = 1500;

/** 가족 손님: 아이가 탈 수 있는 최대 강도(키 제한) / 순한 기구(강도 이하)에 가족이 더하는 점수 */
export const KID_MAX_INTENSITY = 50;
export const KID_GENTLE_INTENSITY = 20;
export const FAMILY_GENTLE_BONUS = 15;
/** 아이가 놀이기구에서 얻는 재미 배율 */
export const KID_FUN_FACTOR = 1.3;
/** 미아: 부모를 따라 나설 때 길을 잃을 확률(%) / 이만큼 먼 길일 때만 / 찾지 못하면 이 틱 뒤 가족이 떠난다 */
export const LOST_CHANCE = 2;
/** 동시에 길을 잃은 아이는 이 수까지만(알림이 쏟아지지 않게) */
export const MAX_LOST = 2;
export const LOST_MIN_PATH = 6;
export const LOST_TICKS = 600;
/** 아이를 잃은 부모의 행복이 깎이는 주기(틱)와 양 */
export const LOST_DRAIN_EVERY = 20;
export const LOST_DRAIN = 1;
/** 미아를 찾아 주면 가족이 주는 사례금 / 오르는 행복 / 인형탈 연기자가 데려다주는 반경(칸) */
export const REUNITE_TIP = 200;
export const REUNITE_JOY = 15;
export const REUNITE_STAFF_RADIUS = 2;

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
  /** 들고 있는 풍선의 색(0~BALLOON_COLORS-1). 없으면 풍선이 없다 */
  balloon?: number;
  /** 마지막으로 탑승 사진을 산 코스터(건물 id) */
  photo?: number;
  /** 마지막으로 떠올린 불만(리뷰용) / 공원을 떠나기로 한 이유 */
  gripe?: Thought;
  leaveReason?: Thought;
  /** VIP 손님: 타고 싶은 놀이기구(def id)와 기한. 이뤄 주면 done */
  vip?: { wish: string; until: number; done: boolean };
  /** 가족 손님 — 부모: 함께 온 아이들의 id / 목표를 새로 고를 때마다 오르는 번호 */
  kids?: number[];
  trip?: number;
  /** 가족 손님 — 아이: 보호자 id / 마지막으로 따라간 보호자의 trip / 길을 잃었다면 가족이 포기하는 틱 */
  kid?: boolean;
  leader?: number;
  followed?: number;
  lostUntil?: number;
  /** 아이를 끝내 찾지 못한 보호자: 지금 하던 일을 마치면 집에 간다 */
  goHome?: boolean;
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

/** 손님의 담력(35~90): 이보다 강도가 높은 놀이기구는 꺼린다. id로 정해지므로 저장할 필요가 없다 */
export function thrillTolerance(g: Guest): number {
  if (g.kid) return kidTolerance(g);
  return 35 + (hash32(g.id, 0, 23) % 56);
}

/** 아이의 담력(20~49): 어른보다 겁이 많다 */
function kidTolerance(g: Guest): number {
  return 20 + (hash32(g.id, 0, 29) % 30);
}

/** 가족 조회는 매 틱 다시 만드는 world.guestById를 쓴다(공원을 떠난 아이는 없는 것으로 친다) */
/** 함께 다니는 아이들(공원을 떠나지 않았고 길을 잃지 않은) */
export function familyKids(world: World, g: Guest): Guest[] {
  if (!g.kids) return [];
  const out: Guest[] = [];
  for (const id of g.kids) {
    const k = world.guestById.get(id);
    if (k && k.state !== 'gone' && k.lostUntil === undefined) out.push(k);
  }
  return out;
}

/** 길을 잃은 아이가 있는가 */
export function hasLostKid(world: World, g: Guest): boolean {
  if (!g.kids) return false;
  return g.kids.some((id) => world.guestById.get(id)?.lostUntil !== undefined);
}

export function guestOf(world: World, id: number | undefined): Guest | undefined {
  if (id === undefined) return undefined;
  return world.guestById.get(id);
}

export function think(g: Guest, t: Thought): void {
  if (GRIPES.has(t)) g.gripe = t;
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
  if (phase !== SCENERY_EVERY >> 1) return;
  const fountain = nearFountain(world, g.tile);
  if (!fountain && !nearScenery(world, g.tile)) return;
  g.needs.happiness = clamp(g.needs.happiness + SCENERY_GAIN);
  if (fountain) g.needs.happiness = clamp(g.needs.happiness + FOUNTAIN_GAIN);
  if (g.thought === null && (world.tick + g.id) % (SCENERY_EVERY * 8) === SCENERY_EVERY >> 1) think(g, fountain ? 'fountain' : 'scenery');
}

/** 풍선을 든 손님은 가끔(손님 id·틱으로 결정) 풍선을 놓친다. 놓친 풍선은 하늘로 날아간다 */
function tickBalloon(world: World, g: Guest): void {
  if (g.balloon === undefined || g.state === 'visiting' || g.state === 'gone') return;
  if ((world.tick + g.id) % BALLOON_SLIP_EVERY !== 0) return;
  if (hash32(g.id, world.tick, 93) % 100 >= (g.kid ? BALLOON_SLIP_KID : BALLOON_SLIP)) return;
  if (world.floaters.length < MAX_FLOATERS) world.floaters.push({ x: g.x, y: g.y, color: g.balloon, tick: world.tick });
  g.balloon = undefined;
  g.needs.happiness = clamp(g.needs.happiness - (g.kid ? 6 : 3));
  world.stats.balloonsLost = (world.stats.balloonsLost ?? 0) + 1;
  think(g, 'balloonLost');
}

/** VIP가 기한 안에 소원을 이루지 못하면 실망하고 평범한 손님이 된다 */
function tickVip(world: World, g: Guest): void {
  if (!g.vip || g.vip.done || world.tick < g.vip.until) return;
  g.vip = undefined;
  g.needs.happiness = clamp(g.needs.happiness - 15);
  think(g, 'vipSad');
}

/** 반경 FOUNTAIN_RADIUS 칸 안에 분수가 있는지 */
export function nearFountain(world: World, t: Tile): boolean {
  const m = world.map;
  for (let dy = -FOUNTAIN_RADIUS; dy <= FOUNTAIN_RADIUS; dy++) {
    for (let dx = -FOUNTAIN_RADIUS; dx <= FOUNTAIN_RADIUS; dx++) if (m.sceneryAt(t.x + dx, t.y + dy) === FOUNTAIN) return true;
  }
  return false;
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
  if (g.kid) g.needs.energy = Math.max(0, g.needs.energy - 0.01); // 아이는 더 빨리 지친다
  if (world.event?.kind === 'heatwave') g.needs.thirst = Math.min(100, g.needs.thirst + HEAT_THIRST);
  tickThought(world, g);
  tickScenery(world, g);
  tickTrash(world, g);
  tickLitter(world, g);
  tickRain(world, g);
  tickVip(world, g);
  tickBalloon(world, g);
  tickLost(world, g);
  tickLostParent(world, g);

  switch (g.state) {
    case 'idle': return g.kid ? kidIdle(world, g) : idle(world, g);
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
function leaveCause(world: World, g: Guest): Thought | null {
  // 아이를 찾기 전에는 떠나지 않는다(찾지 못하면 tickLost가 가족을 내보낸다)
  if (hasLostKid(world, g)) return null;
  if (g.goHome) return 'lostKid';
  if (g.needs.happiness < 12) return 'unhappy';
  if (g.needs.energy < 8) return 'tired';
  if (g.money < 10) return 'broke';
  if (g.age > MAX_AGE) return 'tooOld';
  // 아이가 지치거나 울면 가족이 함께 집에 간다
  for (const k of familyKids(world, g)) {
    if (k.needs.happiness < 12) return 'unhappy';
    if (k.needs.energy < 8) return 'tired';
  }
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
  const cause = leaveCause(world, g);
  if (cause) {
    think(g, cause);
    return startLeaving(world, g);
  }
  if ((world.tick + g.id) % DECIDE_EVERY !== 0) return;

  const pick = pickTarget(world, g);
  if (pick) {
    g.target = pick.b.id;
    if (g.kids) g.trip = (g.trip ?? 0) + 1;
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
  // 가족은 가장 급한 사람의 욕구, 가장 겁 많은 사람의 담력에 맞춘다
  const kids = familyKids(world, g);
  const fam = kids.length ? [g, ...kids] : null;
  const need = (k: 'hunger' | 'thirst' | 'toilet'): number => (fam ? Math.max(...fam.map((m) => m.needs[k])) : g.needs[k]);
  const energy = fam ? Math.min(...fam.map((m) => m.needs.energy)) : g.needs.energy;
  const tolerance = fam ? Math.min(...fam.map(thrillTolerance)) : thrillTolerance(g);
  const wantsUmbrella = fam ? fam.some((m) => !m.umbrella) : !g.umbrella;
  const kidWantsBalloon = kids.some((k) => k.balloon === undefined);

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
        if (!isRaining(world) || !wantsUmbrella) continue;
        score = UMBRELLA_SCORE;
      } else if (def.balloon) {
        // 풍선이 없는 아이가 있는 가족은 꼭 들르고, 혼자 온 손님은 기분이 좋을 때 가끔 산다
        if (g.needs.happiness < BALLOON_HAPPY) continue;
        if (kidWantsBalloon) score = BALLOON_FAMILY_SCORE;
        else if (g.balloon === undefined && !fam) score = BALLOON_SCORE + (hash32(g.id, b.id, 91) % 16);
        else continue;
      } else if (def.rest) {
        if (energy >= REST_BELOW) continue;
        score = (100 - energy) * 1.1;
      } else if (def.souvenir) {
        // 한 번 들른 가게는 다시 찾지 않고, 기분 좋은 손님이 여윳돈이 있을 때만
        if (g.needs.happiness < SOUVENIR_HAPPY || g.money < b.price + SOUVENIR_SPARE || g.visited.includes(b.id)) continue;
        score = 30 + (g.needs.happiness - SOUVENIR_HAPPY) + world.rng.next() * 20;
      } else {
        if (!def.serves) continue;
        const n = need(def.serves);
        if (n < 40) continue;
        score = n * (def.serves === 'toilet' ? 1.4 : 1.1);
      }
    } else {
      if (energy < 20) continue;
      // 아이와 함께 온 가족은 키 제한(강도)에 걸리는 기구를 타지 않고, 순한 기구를 더 좋아한다
      if (fam && (def.intensity ?? 0) > KID_MAX_INTENSITY) continue;
      score = (def.fun ?? 0) + world.rng.next() * 20 - (g.visited.includes(b.id) ? 35 : 0);
      if (fam && (def.intensity ?? 0) <= KID_GENTLE_INTENSITY) score += FAMILY_GENTLE_BONUS;
      // 담력보다 무서운 기구는 꺼리고, 지친 손님은 멀미 나는 기구를 피한다
      score -= Math.max(0, (def.intensity ?? 0) - tolerance) * 1.2;
      if (energy < 50) score -= (def.nausea ?? 0) * 0.3;
      if (def.outdoor && isRaining(world) && !g.umbrella) score -= RAIN_RIDE_PENALTY;
      if (g.vip && !g.vip.done && def.id === g.vip.wish) score += VIP_WISH_BONUS;
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
  g.leaveReason = g.thought ?? undefined;
  // 부모가 나가면 함께 온 아이도 하던 일을 멈추고 따라 나간다(시설 안의 아이는 나온 뒤 kidIdle이 내보낸다)
  for (const k of familyKids(world, g)) {
    if (k.state === 'idle' || k.state === 'walking' || k.state === 'queueing') {
      leaveQueue(world, k);
      startLeaving(world, k);
    }
  }
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
  if (!g.kid) addReview(world, g); // 리뷰는 보호자가 가족을 대표해 남긴다
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
    const gain = (def.fun ?? 0) * 0.25 * (intensity > 75 ? 0.5 : 1) * (g.kid ? KID_FUN_FACTOR : 1);
    n.happiness = clamp(n.happiness + gain);
    n.energy = clamp(n.energy - 6 - (def.nausea ?? 0) * 0.1);
    n.hunger = clamp(n.hunger + 4);
    n.thirst = clamp(n.thirst + 4);
    think(g, intensity > 85 ? 'tooIntense' : g.kid ? 'kidFun' : 'fun');
  } else if (def.umbrella) {
    g.umbrella = true;
    n.happiness = clamp(n.happiness + 4);
  } else if (def.balloon) {
    if (g.balloon === undefined) g.balloon = (g.id * 7 + g.age) % BALLOON_COLORS;
    n.happiness = clamp(n.happiness + (g.kid ? 10 : 6));
    think(g, 'balloon');
  } else if (def.rest) {
    n.energy = clamp(n.energy + REST_GAIN);
    n.thirst = clamp(n.thirst - 20);
    n.happiness = clamp(n.happiness + 4);
  } else if (def.souvenir) {
    n.happiness = clamp(n.happiness + 10);
  } else if (def.serves) {
    n[def.serves] = clamp(n[def.serves] - 70);
    n.happiness = clamp(n.happiness + 6 + (def.joy ?? 0));
  }
}

/** 아이가 이용할 수 있는 시설인가(키 제한·요금·줄) */
function kidCanUse(world: World, k: Guest, b: Building): boolean {
  if (!world.network.isOperational(b) || b.price > k.money || b.queue.length >= MAX_QUEUE) return false;
  const def = buildingDef(b);
  if (def.kind === 'ride') return (def.intensity ?? 0) <= KID_MAX_INTENSITY;
  if (def.souvenir) return false; // 기념품은 보호자만 산다
  if (def.umbrella) return !k.umbrella;
  if (def.balloon) return k.balloon === undefined;
  return true;
}

/**
 * 아이는 스스로 갈 곳을 고르지 않고 보호자를 따라다닌다. 보호자가 새 목표를 고르면(trip이 바뀌면)
 * 같은 시설로 따라가고, 보호자가 떠나면 함께 떠난다. 따라 나설 때 가끔 길을 잃는다(미아).
 */
function kidIdle(world: World, k: Guest): void {
  if (k.lostUntil !== undefined) return; // 미아: 제자리에서 운다(tickLost)
  const p = guestOf(world, k.leader);
  if (!p || p.state === 'gone' || p.state === 'leaving') {
    if (k.thought === null) think(k, 'tooOld');
    return startLeaving(world, k);
  }
  if (p.trip === undefined || p.trip === k.followed || p.target === null) return;
  if (p.state !== 'walking' && p.state !== 'queueing' && p.state !== 'visiting') return;
  k.followed = p.trip;
  const b = world.buildings.get(p.target);
  if (!b || !kidCanUse(world, k, b)) return;
  const path = world.network.findPath(k.tile, b.entrance);
  if (!path) return;
  // 미아: 먼 길을 따라 나설 때 일정 확률로(아이 id·trip으로 결정) 부모를 놓친다
  if (path.length >= LOST_MIN_PATH && hash32(k.id, p.trip, 77) % 100 < LOST_CHANCE && lostCount(world) < MAX_LOST) {
    k.lostUntil = world.tick + LOST_TICKS;
    world.stats.lost = (world.stats.lost ?? 0) + 1;
    think(k, 'lost');
    think(p, 'lostKid');
    return;
  }
  k.target = b.id;
  setPath(world, k, path);
  k.state = 'walking';
  k.timer = 0;
}

function lostCount(world: World): number {
  let n = 0;
  for (const g of world.guests) if (g.lostUntil !== undefined) n++;
  return n;
}

/** 길 잃은 아이: 계속 울고, 근처의 인형탈 연기자가 데려다주거나, 기한이 지나면 가족이 실망해 떠난다 */
function tickLost(world: World, k: Guest): void {
  if (k.lostUntil === undefined) return;
  const parent = guestOf(world, k.leader);
  if (!parent || parent.state === 'gone') {
    // 보호자가 이미 공원을 나갔다면(길이 철거되는 등) 입구로 나가 만난다
    k.lostUntil = undefined;
    return startLeaving(world, k);
  }
  if (k.thought !== 'lost') think(k, 'lost');
  else k.thoughtTimer = THOUGHT_TICKS;
  if ((world.tick + k.id) % 10 === 0) {
    for (const s of world.staff) {
      if (s.kind === 'entertainer' && Math.abs(s.tile.x - k.tile.x) + Math.abs(s.tile.y - k.tile.y) <= REUNITE_STAFF_RADIUS) {
        reuniteKid(world, k);
        return;
      }
    }
  }
  if (world.tick < k.lostUntil) return;
  // 끝내 찾지 못함: 아이도 부모도 크게 실망하고 공원을 떠난다
  k.lostUntil = undefined;
  world.stats.lostGone = (world.stats.lostGone ?? 0) + 1;
  k.needs.happiness = clamp(k.needs.happiness - 30);
  const p = guestOf(world, k.leader);
  if (p && p.state !== 'gone') {
    p.needs.happiness = Math.min(p.needs.happiness, 8);
    p.goHome = true;
    think(p, 'lostKid');
    if (p.state === 'walking' || p.state === 'queueing') {
      leaveQueue(world, p);
      startLeaving(world, p);
    }
  }
  startLeaving(world, k);
}

/** 아이를 잃은 부모는 걱정으로 기분이 점점 나빠진다(RNG를 쓰지 않는다) */
function tickLostParent(world: World, p: Guest): void {
  if (!p.kids || (world.tick + p.id) % LOST_DRAIN_EVERY !== 0 || !hasLostKid(world, p)) return;
  p.needs.happiness = clamp(p.needs.happiness - LOST_DRAIN);
  if (p.thought === null) think(p, 'lostKid');
}

/** 길 잃은 아이를 보호자 곁으로 데려다준다. 사례금을 받으면 true */
export function reuniteKid(world: World, k: Guest): boolean {
  if (k.lostUntil === undefined) return false;
  k.lostUntil = undefined;
  const p = guestOf(world, k.leader);
  if (!p || p.state === 'gone' || p.state === 'leaving') {
    startLeaving(world, k);
    return false;
  }
  // 보호자가 서 있는(또는 이용 중인 시설 입구) 칸으로 옮긴다
  k.tile = { ...p.tile };
  k.x = k.px = p.tile.x + 0.5;
  k.y = k.py = p.tile.y + 0.5;
  k.path = [];
  k.pathIdx = 0;
  k.pathVersion = world.map.version;
  goIdle(k);
  k.followed = undefined; // 보호자가 가는 곳으로 바로 따라간다
  k.needs.happiness = clamp(k.needs.happiness + REUNITE_JOY);
  p.needs.happiness = clamp(p.needs.happiness + REUNITE_JOY);
  if (p.gripe === 'lostKid') p.gripe = undefined;
  think(k, 'reunited');
  think(p, 'reunited');
  world.transact('missions', REUNITE_TIP);
  world.stats.reunited = (world.stats.reunited ?? 0) + 1;
  return true;
}
