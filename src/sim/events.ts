import { hash32 } from '../core/hash';
import { DAY_TICKS } from './economy';
import { think, VIP_TICKS, type Guest } from './guest';
import { buildingDef } from './coaster';
import { isNight } from './daynight';
import { admitGuest, MAX_GUESTS } from './spawner';
import { rainbowAt, weatherKindOf } from './weather';
import type { World } from './world';

// ---------------------------------------------------------------- 랜덤 이벤트

/**
 * 랜덤 이벤트. 날씨처럼 (날씨 시드, 날짜)로 정해지는 순수 함수라 저장할 필요가 없고 world.rng를 쓰지 않는다.
 * - bus: 단체 관광버스가 와서 손님이 한꺼번에 입장(시작할 때 한 번)
 * - heatwave: 폭염, 손님이 빨리 목말라진다(맑은 날에만)
 * - hype: 인기 블로거가 다녀가 손님 입장이 2배
 * - blackout: 정전, 놀이기구가 새 손님을 태우지 못한다(운행 중인 것은 마저 돈다)
 * - vip: VIP 손님이 와서 운영 중인 놀이기구 하나를 타고 싶어 한다. 기한 안에 태워 주면 상금
 */
export type EventKind = 'bus' | 'heatwave' | 'hype' | 'blackout' | 'vip';
export const EVENT_KINDS: readonly EventKind[] = ['bus', 'heatwave', 'hype', 'blackout', 'vip'];

export interface ParkEvent {
  kind: EventKind;
  /** 시작·종료 틱(종료 틱은 포함하지 않음) */
  start: number;
  end: number;
}

/** 이벤트가 생기는 첫날(0부터) / 하루에 이벤트가 생길 확률 */
export const FIRST_EVENT_DAY = 2;
export const EVENT_CHANCE = 0.4;
export const EVENT_TICKS: Record<EventKind, number> = { bus: 60, heatwave: 300, hype: 240, blackout: 80, vip: 60 };
/** 관광버스로 들어오는 손님 수 */
export const BUS_GUESTS = 20;
/** 무지개가 떠 있는 동안 손님 행복 +1 주기(틱) */
export const RAINBOW_CHEER_EVERY = 20;
/** VIP가 더 가지고 오는 돈 */
export const VIP_MONEY = 150;
/** 폭염 중 틱당 추가 갈증 */
export const HEAT_THIRST = 0.06;
/** 입소문 중 입장 확률 배수 */
export const HYPE_SPAWN_FACTOR = 2;

/**
 * 이벤트 유무를 정하는 해시 솔트. 기본 날씨 시드(DEFAULT_WEATHER_SEED, 테스트용)에서 처음 12일 동안
 * 이벤트가 없도록 고른 값이라, 짧은 시뮬레이션 테스트가 이벤트에 흔들리지 않는다.
 */
const EVENT_SALT = 446;

/** day 번째 날의 이벤트(없으면 null) */
export function eventOfDay(seed: number, day: number): ParkEvent | null {
  if (day < FIRST_EVENT_DAY) return null;
  if (hash32(seed, day, EVENT_SALT) / 4294967296 >= EVENT_CHANCE) return null;
  let kind = EVENT_KINDS[hash32(seed, day, 137) % EVENT_KINDS.length];
  if (kind === 'heatwave' && weatherKindOf(seed, day) !== 'sunny') kind = 'bus';
  const start = day * DAY_TICKS + 60 + (hash32(seed, day, 139) % 240);
  return { kind, start, end: start + EVENT_TICKS[kind] };
}

/** 틱 시점에 진행 중인 이벤트 */
export function eventAtTick(seed: number, tick: number): ParkEvent | null {
  const e = eventOfDay(seed, Math.floor(tick / DAY_TICKS));
  return e && tick >= e.start && tick < e.end ? e : null;
}

export const eventActive = (world: World, kind: EventKind): boolean => world.event?.kind === kind;

/** VIP 손님을 입장시킨다. 운영 중인 놀이기구 중 하나(틱 해시로 고름)를 소원으로 갖는다. 기구가 없으면 오지 않는다 */
export function spawnVip(world: World): Guest | null {
  const rides = [...new Set(
    [...world.buildings.values()].filter((b) => !b.broken && world.network.isOperational(b)).map((b) => buildingDef(b)).filter((d) => d.kind === 'ride').map((d) => d.id),
  )].sort();
  if (rides.length === 0 || world.guests.length >= MAX_GUESTS) return null;
  const g = admitGuest(world, true);
  if (!g) return null;
  g.money += VIP_MONEY;
  g.needs.happiness = Math.max(g.needs.happiness, 80);
  g.vip = { wish: rides[hash32(world.tick, world.guests.length, 53) % rides.length], until: world.tick + VIP_TICKS, done: false };
  return g;
}

// ---------------------------------------------------------------- 불꽃놀이

export const FIREWORKS_COST = 1500;
export const FIREWORKS_TICKS = 150;
/** 공연 중 CHEER 주기마다 모든 손님의 행복 +1 */
export const FIREWORKS_CHEER_EVERY = 10;
/** 공연 중 입장 확률 배수 */
export const FIREWORKS_SPAWN_FACTOR = 1.5;

export interface Fireworks {
  start: number;
  end: number;
  /** 발사 지점(타일 좌표) */
  x: number;
  y: number;
}

/** 불꽃놀이를 시작한다. 할 수 없으면 이유를, 성공하면 null을 반환 */
export function launchFireworks(world: World): string | null {
  if (world.status === 'won' || world.status === 'lost') return '게임이 끝났습니다';
  if (world.fireworks) return '이미 불꽃놀이 중입니다';
  const day = Math.floor(world.tick / DAY_TICKS);
  if (world.lastFireworksDay === day) return '불꽃놀이는 하루에 한 번만 할 수 있습니다';
  if (world.money < FIREWORKS_COST) return '돈이 부족합니다';

  // 운영 중인 시설들의 가운데 위로 쏜다(없으면 입구)
  let sx = 0, sy = 0, n = 0;
  for (const b of world.buildings.values()) {
    if (!world.network.isOperational(b)) continue;
    sx += b.x + b.w / 2;
    sy += b.y + b.h / 2;
    n++;
  }
  const gate = world.map.gate;
  world.transact('fireworks', -FIREWORKS_COST);
  world.lastFireworksDay = day;
  world.fireworks = {
    start: world.tick,
    end: world.tick + FIREWORKS_TICKS,
    x: n ? sx / n : gate.x + 0.5,
    y: n ? sy / n : gate.y + 0.5,
  };
  return null;
}

// ---------------------------------------------------------------- 매 틱

/** 오늘의 이벤트를 갱신하고, 관광버스 도착과 불꽃놀이 효과를 처리한다 */
export function updateEvents(world: World): void {
  const t = world.tick;
  world.event = eventAtTick(world.weatherSeed, t);
  if (world.event?.kind === 'bus' && t === world.event.start) {
    for (let i = 0; i < BUS_GUESTS && world.guests.length < MAX_GUESTS; i++) admitGuest(world);
  }
  if (world.event?.kind === 'vip' && t === world.event.start) spawnVip(world);
  // 무지개: 비 온 다음 날 아침, 바라보는 손님의 기분이 오른다
  if (t % RAINBOW_CHEER_EVERY === 0 && rainbowAt(world.weatherSeed, t)) {
    for (const g of world.guests) {
      if (g.state === 'visiting' || g.state === 'gone') continue;
      g.needs.happiness = Math.min(100, g.needs.happiness + 1);
      if (!g.thought && hash32(g.id, t, 43) % 6 === 0) think(g, 'rainbow');
    }
  }

  const fw = world.fireworks;
  if (!fw) return;
  if (t >= fw.end) {
    world.fireworks = null;
    return;
  }
  if ((t - fw.start) % FIREWORKS_CHEER_EVERY !== 0) return;
  // 밤하늘의 불꽃은 효과가 두 배
  const cheer = isNight(t) ? 2 : 1;
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone') continue;
    g.needs.happiness = Math.min(100, g.needs.happiness + cheer);
    if (!g.thought && hash32(g.id, t, 41) % 4 === 0) think(g, 'fireworks');
  }
}
