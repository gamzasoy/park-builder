import { hash32 } from '../core/hash';
import { buildingDef } from './coaster';
import { DAY_TICKS } from './economy';
import { advance, GUEST_SPEED, remember, setPath, startLeaving, think, type Guest } from './guest';
import type { Staff } from './staff';
import type { World } from './world';

/**
 * 소매치기: 평범한 손님처럼 입장해 붐비는 곳을 돌아다니며 손님 지갑을 털고, 기념품·풍선 가게에서 물건을 훔친다.
 * 훔치는 순간 들켜서(SPOTTED_TICKS 동안) 머리 위에 ❗가 뜨고, 그때 누르면 잡을 수 있다.
 * 경비원은 근처(GUARD_CATCH 칸)의 도둑을 들키지 않았어도 잡고, 들킨 도둑을 쫓아간다. 경비원 가까이에서는 훔치지 않는다.
 */

/** 손님이 이만큼 이상일 때부터 / 혼자 오는 손님 중 도둑 비율(%) / 동시에 공원에 있는 도둑 수 상한 */
export const THIEF_MIN_GUESTS = 25;
export const THIEF_PCT = 4;
export const MAX_THIEVES = 1;
/** 도둑이 한 번 나타나면 이만큼(틱, 게임 속 2일) 지나야 다음 도둑이 들어온다(너무 잦지 않게) */
export const THIEF_GAP = 2 * DAY_TICKS;
/** 훔칠 기회를 엿보는 주기(틱) / 성공 확률(%) / 손님 지갑에서 훔치는 돈(최소, 더해지는 폭) */
export const THIEF_TRY_EVERY = 15;
export const THIEF_TRY_PCT = 40;
export const STEAL_MIN = 15;
export const STEAL_SPREAD = 16;
/** 훔칠 수 있는 거리(칸) / 피해 손님이 갖고 있어야 하는 최소 돈 / 피해 손님 행복 감소 */
export const STEAL_REACH = 1.3;
export const VICTIM_MIN_MONEY = 20;
export const VICTIM_UPSET = 12;
/** 가게 물건 훔치기: 공원이 잃는 돈 */
export const SHOPLIFT_LOSS = 40;
/** 한 번 훔치면 들킨 채로 있는 틱 / 도둑이 공원에 머무는 최대 틱 / 이만큼 훔치면 달아난다 */
export const SPOTTED_TICKS = 200;
export const THIEF_MAX_AGE = 3000;
export const THIEF_MAX_THEFTS = 4;
/** 경비원: 이 거리(칸) 안의 도둑을 잡는다 / 이 거리 안에서는 도둑이 훔치지 않는다 */
export const GUARD_CATCH = 1.6;
export const GUARD_DETER = 4;
/** 도둑을 잡으면 받는 현상금(되찾은 가게 물건 값은 따로 돌려받는다) */
export const THIEF_BOUNTY = 150;

/** 지금 공원에 있는 도둑 수 */
export function thiefCount(world: World): number {
  let n = 0;
  for (const g of world.guests) if (g.thief && g.state !== 'gone') n++;
  return n;
}

/** 막 입장한 혼자 온 손님을 (손님 id로 정해지는 확률로) 도둑으로 만든다 */
export function maybeThief(world: World, g: Guest): boolean {
  if (world.guests.length < THIEF_MIN_GUESTS || thiefCount(world) >= MAX_THIEVES) return false;
  if (world.tick - (world.stats.lastThiefAt ?? -THIEF_GAP) < THIEF_GAP) return false;
  if (hash32(g.id, 0, 101) % 100 >= THIEF_PCT) return false;
  world.stats.lastThiefAt = world.tick;
  g.thief = true;
  g.loot = 0;
  g.thefts = 0;
  return true;
}

export const isSpotted = (world: World, g: Guest): boolean => !!g.thief && (g.spotted ?? -1) > world.tick;

function guardNear(world: World, x: number, y: number, r: number): boolean {
  return world.staff.some((s) => s.kind === 'security' && Math.hypot(s.x - x, s.y - y) <= r);
}

/** 도둑의 한 틱(걷기·떠나기 이동은 guest.ts가, 여기서는 배회와 도둑질을 맡는다) */
export function updateThief(world: World, g: Guest): void {
  if (g.age > THIEF_MAX_AGE || (g.thefts ?? 0) >= THIEF_MAX_THEFTS) return startLeaving(world, g);
  if ((world.tick + g.id) % THIEF_TRY_EVERY === 0) tryToSteal(world, g);

  if (g.state === 'walking') {
    // 길이 바뀌면 다시 고른다
    if (g.pathVersion !== world.map.version) {
      g.state = 'idle';
      return;
    }
    if (advance(g, GUEST_SPEED * 0.9)) g.state = 'idle';
    return;
  }
  // idle: 손님이 많은 곳(아무 손님 하나)으로 슬슬 걸어간다
  if ((world.tick + g.id) % 5 !== 0) return;
  const marks = world.guests.filter((o) => o !== g && !o.thief && (o.state === 'walking' || o.state === 'queueing' || o.state === 'idle'));
  if (!marks.length) return;
  const mark = marks[hash32(g.id, world.tick, 103) % marks.length];
  const path = world.network.findPath(g.tile, mark.tile);
  if (!path || path.length < 2) return;
  setPath(world, g, path);
  g.target = null;
  g.state = 'walking';
}

/** 가까운 손님의 지갑이나 가까운 기념품·풍선 가게를 노린다. 경비원이 가까이 있으면 참는다 */
function tryToSteal(world: World, g: Guest): void {
  if (guardNear(world, g.x, g.y, GUARD_DETER)) return;
  if (hash32(g.id, world.tick, 107) % 100 >= THIEF_TRY_PCT) return;
  // 가게: 입구 바로 옆을 지날 때 한 번씩
  for (const b of world.buildings.values()) {
    const def = buildingDef(b);
    if (!(def.souvenir || def.balloon) || g.visited.includes(b.id) || !world.network.isOperational(b)) continue;
    if (Math.abs(b.entrance.x + 0.5 - g.x) > 1.2 || Math.abs(b.entrance.y + 0.5 - g.y) > 1.2) continue;
    remember(g, b.id);
    world.transact('theft', -SHOPLIFT_LOSS);
    g.shoplifted = (g.shoplifted ?? 0) + SHOPLIFT_LOSS;
    return caughtInTheAct(world, g, true);
  }
  let victim: Guest | null = null;
  let best = STEAL_REACH;
  for (const o of world.guests) {
    if (o === g || o.thief || o.kid || o.money < VICTIM_MIN_MONEY) continue;
    if (o.state !== 'walking' && o.state !== 'queueing' && o.state !== 'idle') continue;
    const d = Math.hypot(o.x - g.x, o.y - g.y);
    if (d <= best) {
      best = d;
      victim = o;
    }
  }
  if (!victim) return;
  const amount = Math.min(victim.money - 5, STEAL_MIN + (hash32(g.id, world.tick, 109) % STEAL_SPREAD));
  victim.money -= amount;
  victim.needs.happiness = Math.max(0, victim.needs.happiness - VICTIM_UPSET);
  think(victim, 'robbed');
  g.loot = (g.loot ?? 0) + amount;
  caughtInTheAct(world, g, false);
}

function caughtInTheAct(world: World, g: Guest, shop: boolean): void {
  g.thefts = (g.thefts ?? 0) + 1;
  g.spotted = world.tick + SPOTTED_TICKS;
  world.stats.thefts = (world.stats.thefts ?? 0) + 1;
  if (shop) world.stats.shoplifts = (world.stats.shoplifts ?? 0) + 1;
}

/** 도둑을 잡는다(플레이어가 들킨 도둑을 누르거나 경비원이 붙잡음). 현상금과 훔친 가게 물건 값을 받는다. 잡았으면 true */
export function catchThief(world: World, g: Guest): boolean {
  if (!g.thief || g.state === 'gone') return false;
  world.transact('missions', THIEF_BOUNTY);
  if (g.shoplifted) world.transact('theft', g.shoplifted);
  g.state = 'gone';
  g.thief = false;
  world.stats.caught = (world.stats.caught ?? 0) + 1;
  world.lastCatch = { loot: (g.loot ?? 0) + (g.shoplifted ?? 0), tick: world.tick };
  // 구경하던 손님들이 박수를 친다
  for (const o of world.guests) {
    if (o === g || o.state === 'visiting' || o.state === 'gone' || Math.hypot(o.x - g.x, o.y - g.y) > 4) continue;
    o.needs.happiness = Math.min(100, o.needs.happiness + 3);
    think(o, 'caught');
  }
  return true;
}

/** 경비원의 한 틱: 곁의 도둑을 잡는다. 잡았으면 true */
export function guardCatch(world: World, s: Staff): boolean {
  for (const g of world.guests) {
    if (!g.thief || g.state === 'gone' || g.state === 'visiting') continue;
    if (Math.hypot(g.x - s.x, g.y - s.y) <= GUARD_CATCH) return catchThief(world, g);
  }
  return false;
}
