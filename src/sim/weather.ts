import { hash32 } from '../core/hash';
import { DAY_TICKS } from './economy';
import type { World } from './world';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain';
export interface Weather {
  kind: WeatherKind;
  /** 이 날씨가 끝나는 틱(다음 날 시작) */
  untilTick: number;
}

/**
 * 기본 날씨 시드(new World()와 날씨 정보가 없는 이전 저장본). world.rng를 소비하지 않는다.
 * 이 시드는 처음 12일 동안 비가 오지 않는 값이라, 비를 가정하지 않는 짧은 시뮬레이션 테스트가 날씨에 흔들리지 않는다.
 * 실제 새 게임은 main.ts에서 무작위 시드를 쓴다.
 */
export const DEFAULT_WEATHER_SEED = 0x7e47e6;
/** 비 오는 날 입장 확률 배수 */
export const RAIN_SPAWN_FACTOR = 0.7;
/** 비 오는 날 우산 없는 손님이 실외 놀이기구에서 받는 감점 */
export const RAIN_RIDE_PENALTY = 30;
/** 비를 맞는 손님의 행복 감소 주기(틱) / 양 */
export const RAIN_DRAIN_EVERY = 30;
export const RAIN_DRAIN = 1;

const SUNNY = 0.55;
const CLOUDY = 0.8; // 누적: 맑음 55% · 흐림 25% · 비 20%

/** day 번째 날(0부터)의 날씨. 첫날은 항상 맑음. world.rng를 쓰지 않는 순수 함수. */
export function weatherKindOf(seed: number, day: number): WeatherKind {
  if (day <= 0) return 'sunny';
  const r = hash32(seed, day, 77) / 4294967296;
  return r < SUNNY ? 'sunny' : r < CLOUDY ? 'cloudy' : 'rain';
}

/** 틱 시점의 날씨(저장본에 날씨가 없을 때 복원용) */
export function weatherAtTick(seed: number, tick: number): Weather {
  const day = Math.floor(tick / DAY_TICKS);
  return { kind: weatherKindOf(seed, day), untilTick: (day + 1) * DAY_TICKS };
}

/** 하루 경계마다 날씨를 다시 정한다 */
export function updateWeather(world: World): void {
  if (world.tick < world.weather.untilTick) return;
  world.weather = weatherAtTick(world.weatherSeed, world.tick);
}

export const isRaining = (world: World): boolean => world.weather.kind === 'rain';

/** 비 온 다음 날 아침의 무지개가 떠 있는 시간(틱) */
export const RAINBOW_TICKS = 200;

/** 틱 시점에 무지개가 떠 있는가: 전날 비가 왔고 오늘은 비가 오지 않는 날의 아침 */
export function rainbowAt(seed: number, tick: number): boolean {
  const day = Math.floor(tick / DAY_TICKS);
  if (day < 1 || tick - day * DAY_TICKS >= RAINBOW_TICKS) return false;
  return weatherKindOf(seed, day - 1) === 'rain' && weatherKindOf(seed, day) !== 'rain';
}

// ---------------------------------------------------------------- 폭풍

/** 비 오는 날 폭풍이 몰아칠 확률(%) / 폭풍이 생기는 첫날 / 길이(틱) */
export const STORM_CHANCE = 35;
export const FIRST_STORM_DAY = 2;
export const STORM_TICKS = 240;
/** 폭풍 중 입장 확률 배수 */
export const STORM_SPAWN_FACTOR = 0.3;

export interface Storm {
  start: number;
  end: number;
}

/** day 번째 날의 폭풍(없으면 null). 비 오는 날에만, 날씨처럼 (시드, 날짜)로 정해진다 */
export function stormOfDay(seed: number, day: number): Storm | null {
  if (day < FIRST_STORM_DAY || weatherKindOf(seed, day) !== 'rain') return null;
  if (hash32(seed, day, 211) % 100 >= STORM_CHANCE) return null;
  const start = day * DAY_TICKS + 90 + (hash32(seed, day, 213) % 200);
  return { start, end: start + STORM_TICKS };
}

/** 틱 시점에 몰아치는 폭풍 */
export function stormAt(seed: number, tick: number): Storm | null {
  const s = stormOfDay(seed, Math.floor(tick / DAY_TICKS));
  return s && tick >= s.start && tick < s.end ? s : null;
}
