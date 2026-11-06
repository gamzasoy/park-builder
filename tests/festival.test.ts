import { describe, expect, it } from 'vitest';
import { deserializeWorld, serializeWorld } from '../src/save/save';
import { DAY_TICKS, DAYS_PER_MONTH } from '../src/sim/economy';
import {
  BLOSSOM_CHEER, FESTIVAL_CHEER, FESTIVAL_COST, FESTIVAL_SPAWN_FACTOR, FESTIVAL_TICKS, FESTIVALS, festivalSpawnFactor,
  HALLOWEEN_KID_CHEER, seasonKey, SPLASH_COOL, startFestival, updateFestival, XMAS_NIGHT_SPAWN_FACTOR,
} from '../src/sim/festival';
import { createGuest } from '../src/sim/guest';
import { isNight } from '../src/sim/daynight';
import { seasonOf } from '../src/sim/season';
import { World } from '../src/sim/world';

const MONTH = DAYS_PER_MONTH * DAY_TICKS;
/** m월(1~12) 첫날 아침의 틱 */
const monthTick = (m: number, year = 1): number => ((year - 1) * 12 + (m - 1)) * MONTH + 60;

function worldAt(tick: number): World {
  const w = new World();
  w.tick = tick;
  w.money = 100_000;
  return w;
}

describe('seasonal festival', () => {
  it('opens the current season\'s festival for a fee and runs FESTIVAL_TICKS', () => {
    const w = worldAt(monthTick(4));
    const money = w.money;
    expect(startFestival(w)).toBeNull();
    expect(w.festival).toEqual({ season: 'spring', start: w.tick, end: w.tick + FESTIVAL_TICKS });
    expect(w.money).toBe(money - FESTIVAL_COST);
    expect(w.ledger.festival).toBe(-FESTIVAL_COST);
    expect(w.stats.festivals).toBe(1);
    w.tick = w.festival!.end;
    updateFestival(w);
    expect(w.festival).toBeNull();
  });

  it('can be held once per season, again next season', () => {
    const w = worldAt(monthTick(6));
    expect(startFestival(w)).toBeNull();
    expect(startFestival(w)).toContain('이미');
    w.festival = null;
    w.tick = monthTick(8);
    expect(startFestival(w)).toContain('계절마다');
    w.tick = monthTick(9);
    expect(startFestival(w)).toBeNull();
    expect(w.festival!.season).toBe('autumn');
  });

  it('treats December and the next January–February as one winter', () => {
    expect(seasonKey(monthTick(12))).toBe(seasonKey(monthTick(1, 2)));
    expect(seasonKey(monthTick(2, 2))).toBe(seasonKey(monthTick(12)));
    expect(seasonKey(monthTick(3, 2))).not.toBe(seasonKey(monthTick(12)));
    // 1년차 1월(게임 시작)도 겨울 축제를 열 수 있다
    expect(startFestival(worldAt(monthTick(1)))).toBeNull();
  });

  it('needs money and refuses after the game ends', () => {
    const poor = worldAt(monthTick(4));
    poor.money = FESTIVAL_COST - 1;
    expect(startFestival(poor)).toContain('돈');
    const over = worldAt(monthTick(4));
    over.status = 'won';
    expect(startFestival(over)).not.toBeNull();
  });

  it('every season has a festival with its own thought', () => {
    const thoughts = new Set(Object.values(FESTIVALS).map((f) => f.thought));
    expect(thoughts.size).toBe(4);
    for (const m of [1, 4, 7, 10]) expect(FESTIVALS[seasonOf(monthTick(m))]).toBeDefined();
  });

  function cheerOnce(month: number, kid = false): { gain: number; thirst: number } {
    const w = worldAt(monthTick(month));
    startFestival(w);
    const g = createGuest(w);
    g.state = 'walking';
    g.kid = kid;
    g.needs.happiness = 50;
    g.needs.thirst = 50;
    w.guests.push(g);
    updateFestival(w); // 시작 틱에 한 번 오른다
    return { gain: g.needs.happiness - 50, thirst: g.needs.thirst };
  }

  it('cheers guests up, with a different perk each season', () => {
    expect(cheerOnce(4).gain).toBe(FESTIVAL_CHEER * BLOSSOM_CHEER); // 봄: 두 배
    expect(cheerOnce(7)).toEqual({ gain: FESTIVAL_CHEER, thirst: 50 - SPLASH_COOL }); // 여름: 갈증 해소
    expect(cheerOnce(10).gain).toBe(FESTIVAL_CHEER);
    expect(cheerOnce(10, true).gain).toBe(FESTIVAL_CHEER * HALLOWEEN_KID_CHEER); // 가을: 아이 세 배
    expect(cheerOnce(12)).toEqual({ gain: FESTIVAL_CHEER, thirst: 50 });
  });

  it('brings more guests, and Christmas lights draw crowds at night', () => {
    const w = worldAt(monthTick(12));
    expect(festivalSpawnFactor(w)).toBe(1);
    startFestival(w);
    expect(festivalSpawnFactor(w)).toBe(FESTIVAL_SPAWN_FACTOR);
    while (!isNight(w.tick)) w.tick++;
    expect(festivalSpawnFactor(w)).toBe(XMAS_NIGHT_SPAWN_FACTOR);
    const summer = worldAt(monthTick(7));
    startFestival(summer);
    while (!isNight(summer.tick)) summer.tick++;
    expect(festivalSpawnFactor(summer)).toBe(FESTIVAL_SPAWN_FACTOR);
  });

  it('survives save and load', () => {
    const w = worldAt(monthTick(10));
    startFestival(w);
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(back.festival).toEqual(w.festival);
    expect(back.lastFestivalKey).toBe(w.lastFestivalKey);
    expect(back.stats.festivals).toBe(1);
    // 축제 정보가 없는 옛 저장본
    const old = serializeWorld(worldAt(0)) as unknown as Record<string, unknown>;
    delete old.festival;
    delete old.lastFestivalKey;
    const fresh = deserializeWorld(JSON.parse(JSON.stringify(old)));
    expect(fresh.festival).toBeNull();
    expect(fresh.lastFestivalKey).toBe(-1);
  });
});
