import { hash32 } from '../core/hash';
import { isNight } from './daynight';
import { dateOf, DAY_TICKS } from './economy';
import { think, type Thought } from './guest';
import { seasonOf, type Season } from './season';
import type { World } from './world';

/**
 * 계절 축제: 계절마다 한 번 돈을 내고 FESTIVAL_TICKS(3일) 동안 연다.
 * 공통: 손님이 더 몰려오고(FESTIVAL_SPAWN_FACTOR), FESTIVAL_CHEER_EVERY 틱마다 공원의 모든 손님 기분이 오른다.
 * 계절마다 특별 효과가 하나씩 있다(FESTIVALS의 perk). 길가 장식·입구 깃발·색종이는 renderer가 그린다.
 */
export const FESTIVAL_COST = 2000;
export const FESTIVAL_DAYS = 3;
export const FESTIVAL_TICKS = FESTIVAL_DAYS * DAY_TICKS;
export const FESTIVAL_SPAWN_FACTOR = 1.4;
/** 크리스마스 축제: 밤에는 불빛을 보러 손님이 이만큼 더 온다(공통 배수 대신) */
export const XMAS_NIGHT_SPAWN_FACTOR = 2;
export const FESTIVAL_CHEER_EVERY = 30;
export const FESTIVAL_CHEER = 1;
/** 벚꽃 축제: 기분 상승 배수 / 할로윈 축제: 아이 기분 상승 배수 / 물놀이 축제: 오를 때마다 줄어드는 갈증 */
export const BLOSSOM_CHEER = 2;
export const HALLOWEEN_KID_CHEER = 3;
export const SPLASH_COOL = 4;

export interface FestivalInfo {
  name: string;
  /** 툴바 버튼에 들어가는 짧은 이름 */
  short: string;
  icon: string;
  /** 축제 동안 손님 말풍선 */
  thought: Thought;
  /** 계절 특별 효과 한 줄 */
  perk: string;
}

export const FESTIVALS: Record<Season, FestivalInfo> = {
  spring: { name: '벚꽃 축제', short: '벚꽃축제', icon: '🌸', thought: 'blossom', perk: '꽃구경 덕분에 손님 기분이 두 배로 올라요' },
  summer: { name: '물놀이 축제', short: '물놀이', icon: '💦', thought: 'splash', perk: '시원한 물보라 덕분에 손님이 덜 목말라요' },
  autumn: { name: '할로윈 축제', short: '할로윈', icon: '🎃', thought: 'candy', perk: '사탕을 받은 아이 손님들이 무척 신나요(아이 기분 3배)' },
  winter: { name: '크리스마스 축제', short: '크리스마스', icon: '🎄', thought: 'xmas', perk: '반짝이는 불빛을 보러 밤에 손님이 두 배로 몰려와요' },
};

export interface Festival {
  season: Season;
  start: number;
  end: number;
}

/** 해·계절마다 하나인 번호(같은 계절에 두 번 열지 못하게). 겨울 1·2월은 앞 해 12월과 같은 겨울로 친다 */
export function seasonKey(tick: number): number {
  const d = dateOf(Math.max(0, Math.floor(tick)));
  const s = seasonOf(tick);
  const year = s === 'winter' && d.month <= 2 ? d.year - 1 : d.year;
  return year * 4 + ['spring', 'summer', 'autumn', 'winter'].indexOf(s);
}

/** 지금 축제를 열 수 없는 이유(열 수 있으면 null). 버튼 안내에도 쓴다 */
export function festivalBlocker(world: World): string | null {
  if (world.status === 'won' || world.status === 'lost') return '게임이 끝났습니다';
  if (world.festival) return `이미 ${FESTIVALS[world.festival.season].name} 중입니다`;
  if (world.lastFestivalKey === seasonKey(world.tick)) return '축제는 계절마다 한 번만 열 수 있어요. 다음 계절을 기다려 주세요';
  if (world.money < FESTIVAL_COST) return '돈이 부족합니다';
  return null;
}

/** 지금 계절의 축제를 연다. 할 수 없으면 이유를, 성공하면 null을 반환 */
export function startFestival(world: World): string | null {
  const err = festivalBlocker(world);
  if (err) return err;
  world.transact('festival', -FESTIVAL_COST);
  world.lastFestivalKey = seasonKey(world.tick);
  world.stats.festivals = (world.stats.festivals ?? 0) + 1;
  world.festival = { season: seasonOf(world.tick), start: world.tick, end: world.tick + FESTIVAL_TICKS };
  return null;
}

/** 축제 중 입장 확률 배수 */
export function festivalSpawnFactor(world: World): number {
  const f = world.festival;
  if (!f) return 1;
  if (f.season === 'winter' && isNight(world.tick)) return XMAS_NIGHT_SPAWN_FACTOR;
  return FESTIVAL_SPAWN_FACTOR;
}

/** 매 틱: 손님 기분을 올리고 계절 효과를 준다. 끝나면 축제를 닫는다 */
export function updateFestival(world: World): void {
  const f = world.festival;
  if (!f) return;
  const t = world.tick;
  if (t >= f.end) {
    world.festival = null;
    return;
  }
  if ((t - f.start) % FESTIVAL_CHEER_EVERY !== 0) return;
  const info = FESTIVALS[f.season];
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone' || g.thief) continue;
    let gain = FESTIVAL_CHEER;
    if (f.season === 'spring') gain *= BLOSSOM_CHEER;
    if (f.season === 'autumn' && g.kid) gain *= HALLOWEEN_KID_CHEER;
    g.needs.happiness = Math.min(100, g.needs.happiness + gain);
    if (f.season === 'summer') g.needs.thirst = Math.max(0, g.needs.thirst - SPLASH_COOL);
    if (!g.thought && hash32(g.id, t, 151) % 6 === 0) think(g, info.thought);
  }
}
