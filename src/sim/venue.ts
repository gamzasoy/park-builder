import { hash32 } from '../core/hash';
import type { BuildingDef } from '../data/types';
import { applyEffects, goIdle, remember, think, TRASH_MAX, TRASH_MIN, VIP_REWARD, type Guest, type Thought } from './guest';
import { sellRidePhoto } from './photo';
import type { Building, World } from './world';

/** 대기열 맨 앞의 유효한 손님에게 요금을 받고 시설에 들인다. 들일 손님이 없으면 null. */
export function admit(world: World, b: Building, def: BuildingDef): Guest | null {
  while (b.queue.length > 0) {
    const id = b.queue.shift()!;
    const g = world.guestById.get(id);
    if (!g || g.state !== 'queueing') continue;
    if (g.money < b.price) { goIdle(g); continue; }

    g.money -= b.price;
    world.transact(def.kind === 'ride' ? 'rides' : 'shops', b.price);
    b.served++;
    b.income += b.price;
    g.state = 'visiting';
    g.timer = 0;
    b.inside.push(g.id);
    remember(g, b.id);
    return g;
  }
  return null;
}

/** 이용을 마친 손님을 내보내고 효과를 적용 */
export function release(world: World, b: Building, def: BuildingDef, id: number): void {
  const i = b.inside.indexOf(id);
  if (i >= 0) b.inside.splice(i, 1);
  const g = world.guestById.get(id);
  if (!g) return;
  applyEffects(g, def);
  // VIP의 소원을 이뤄 주면 상금
  if (g.vip && !g.vip.done && def.id === g.vip.wish) {
    g.vip.done = true;
    world.transact('missions', VIP_REWARD);
    world.stats.vips++;
    g.needs.happiness = Math.min(100, g.needs.happiness + 20);
    think(g, 'vipHappy');
  }
  // 롤러코스터: 낙하 지점에서 찍힌 사진을 내릴 때 판다
  if (def.coaster) sellRidePhoto(world, b, g);
  // 먹고 마신(커피 포함) 손님은 곧 쓰레기를 버린다(시점은 손님 id·틱으로 결정)
  if (def.serves === 'hunger' || def.serves === 'thirst' || def.rest) {
    g.trash = TRASH_MIN + (hash32(g.id, world.tick, 11) % (TRASH_MAX - TRASH_MIN + 1));
  }
  goIdle(g);
}

/** 대기열 순번을 손님에게 반영(렌더 위치용) */
export function renumberQueue(world: World, b: Building): void {
  b.queue.forEach((id, i) => {
    const g = world.guestById.get(id);
    if (g) g.slot = i;
  });
}

/** 철거 등으로 시설이 사라질 때 줄 서 있거나 이용 중인 손님을 모두 내보냄 */
export function evictAll(world: World, b: Building, thought?: Thought): void {
  for (const id of [...b.queue, ...b.inside]) {
    const g = world.guestById.get(id);
    if (!g) continue;
    goIdle(g);
    if (thought) think(g, thought);
  }
  b.queue.length = 0;
  b.inside.length = 0;
}
