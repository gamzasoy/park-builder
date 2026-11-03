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
