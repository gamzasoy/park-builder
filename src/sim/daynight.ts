import { DAY_TICKS } from './economy';

/**
 * 낮과 밤. 하루(DAY_TICKS)는 오전 9시에 시작해 밤 11시에 끝난다.
 * 시뮬레이션 상태가 아니라 틱에서 바로 계산하므로 저장할 것이 없다.
 */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 23;
/** 어두워지기 시작하는 시각 / 완전히 어두워지는 시각 / 가장 어두울 때의 정도(0~1) */
export const DUSK_HOUR = 18;
export const NIGHT_HOUR = 21;
export const MAX_DARK = 0.5;
/** 새 날이 밝아 오는 시간(틱) */
const DAWN_TICKS = 25;

/** 틱 시점의 시각(시, 분). 분은 10분 단위 */
export function clockOf(tick: number): { hour: number; minute: number } {
  const t = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  const minutes = OPEN_HOUR * 60 + Math.floor((t / DAY_TICKS) * (CLOSE_HOUR - OPEN_HOUR) * 6) * 10;
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

/** 어둠의 정도 0(낮)~MAX_DARK(밤). 소수 틱(렌더 보간)도 받는다 */
export function darknessAt(tick: number): number {
  const t = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  if (t < DAWN_TICKS) return MAX_DARK * (1 - t / DAWN_TICKS);
  const hour = OPEN_HOUR + (t / DAY_TICKS) * (CLOSE_HOUR - OPEN_HOUR);
  if (hour <= DUSK_HOUR) return 0;
  return MAX_DARK * Math.min(1, (hour - DUSK_HOUR) / (NIGHT_HOUR - DUSK_HOUR));
}

/** 밤인가(불꽃놀이 효과 2배 등) */
export const isNight = (tick: number): boolean => darknessAt(tick) >= MAX_DARK * 0.6;
