import { hash32 } from '../core/hash';
import { FLOWERS, OAK, PINE } from '../data/scenery';
import { buildingDef } from './coaster';
import { goIdle, think } from './guest';
import { stormAt, stormOfDay } from './weather';
import { DAY_TICKS } from './economy';
import type { World } from './world';

/** 폭풍이 지나간 뒤: 길가(2칸 안) 나무·꽃이 쓰러질 확률(%) / 길에 잔해가 쌓일 확률(%) / 실외 놀이기구 신뢰도 감소 */
export const STORM_TREE_PCT = 8;
export const STORM_DEBRIS_PCT = 12;
export const STORM_WEAR = 15;
/** 폭풍 중 비를 맞는 손님의 행복 감소 배수(우산도 소용없다) */
export const STORM_DRAIN = 2;

export interface StormDamage {
  /** 쓰러진 나무·꽃 / 잔해가 쌓인 길 / 신뢰도가 깎인 실외 놀이기구 */
  trees: number;
  debris: number;
  rides: number;
  tick: number;
}

/**
 * 매 틱: 폭풍 상태를 갱신한다. 시작하면 실외 놀이기구 줄을 흩어 보내고(운행 중이던 것은 마저 돈다),
 * 끝나면 피해를 남긴다. 폭풍은 (날씨 시드, 날짜)로 정해지므로 저장하지 않는다.
 */
export function updateStorm(world: World): void {
  const t = world.tick;
  world.storm = stormAt(world.weatherSeed, t);
  if (world.storm && t === world.storm.start) {
    world.stats.storms = (world.stats.storms ?? 0) + 1;
    for (const b of world.buildings.values()) {
      // 줄 선 손님만 흩어진다. 타고 있던 손님은 운행이 끝나면 내린다
      if (!buildingDef(b).outdoor) continue;
      for (const id of b.queue) {
        const g = world.guestById.get(id);
        if (!g || g.state !== 'queueing') continue;
        goIdle(g);
        think(g, 'storm');
      }
      b.queue.length = 0;
    }
  }
  const today = stormOfDay(world.weatherSeed, Math.floor(t / DAY_TICKS));
  if (today && t === today.end) world.stormDamage = applyStormDamage(world, Math.floor(t / DAY_TICKS));
}

/** 폭풍 피해: 길가의 나무·꽃이 쓰러지고, 길에 잔해(쓰레기)가 쌓이고, 실외 놀이기구가 낡는다. 결정적이다 */
export function applyStormDamage(world: World, day: number): StormDamage {
  const m = world.map;
  const seed = world.weatherSeed;
  let trees = 0;
  let debris = 0;
  let rides = 0;
  const nearPath = (x: number, y: number): boolean => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (m.isPath(x + dx, y + dy)) return true;
    return false;
  };
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = m.index(x, y);
      const k = m.scenery[i];
      if ((k === PINE || k === OAK || k === FLOWERS) && nearPath(x, y) && hash32(seed ^ i, day, 217) % 100 < STORM_TREE_PCT) {
        m.scenery[i] = 0;
        trees++;
      }
      if (m.path[i] === 1 && !m.isGate(x, y) && hash32(seed ^ i, day, 219) % 100 < STORM_DEBRIS_PCT && m.litter[i] < 3) {
        m.litter[i]++;
        debris++;
      }
    }
  }
  for (const b of world.buildings.values()) {
    const def = buildingDef(b);
    if (def.kind !== 'ride' || !def.outdoor) continue;
    b.reliability = Math.max(0, b.reliability - STORM_WEAR);
    rides++;
  }
  return { trees, debris, rides, tick: world.tick };
}
