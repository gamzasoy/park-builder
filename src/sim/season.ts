import { dateOf } from './economy';

/** 계절: 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울. 화면 연출(나무 색·눈·낙엽·꽃잎)에 쓴다 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function seasonOf(tick: number): Season {
  const m = dateOf(Math.max(0, Math.floor(tick))).month;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

export const SEASON_VIEW: Record<Season, { icon: string; label: string }> = {
  spring: { icon: '🌸', label: '봄' },
  summer: { icon: '🌿', label: '여름' },
  autumn: { icon: '🍁', label: '가을' },
  winter: { icon: '❄️', label: '겨울' },
};
