import type { BuildingDef } from '../data/types';
import { hash32 } from '../core/hash';
import { admit, evictAll, release } from './venue';
import type { Building, World } from './world';

/** 정원이 차지 않아도 이 시간이 지나면 출발 */
export const LOAD_TICKS = 30;

/** 신뢰도 범위와 운행 한 번당 감소량 */
export const MAX_RELIABILITY = 100;
export const RELIABILITY_LOSS = 1.5;

/** 이 신뢰도보다 낮으면 정비공이 점검하러 간다 */
export const INSPECT_BELOW = 80;

/** 이번 운행 뒤 고장 날지 결정적으로 판정: hash(건물, 운행 횟수) 정규화 값 < (100-신뢰도)/400 */
export function breaksDown(b: Building): boolean {
  const roll = hash32(b.id, b.cycles, 7) / 0x100000000;
  return roll < (MAX_RELIABILITY - b.reliability) / 400;
}

/**
 * 놀이기구 사이클: idle → loading(탑승 대기, 정원 차거나 시간 초과 시 출발) → running → 하차 → idle.
 * 운영 불가(입구 끊김) 상태에서는 새 탑승을 받지 않고, 운행 중인 사이클만 마무리한다.
 */
export function updateRide(world: World, b: Building, def: BuildingDef): void {
  // 정전 중에는 새 손님을 태우지 못한다(운행 중인 사이클은 마무리)
  const operational = world.network.isOperational(b) && world.event?.kind !== 'blackout';
  if (b.broken) b.brokenTicks++;

  if (b.phase === 'idle' && operational && b.queue.length > 0) {
    b.phase = 'loading';
    b.timer = LOAD_TICKS;
  }

  if (b.phase === 'loading') {
    if (operational) {
      while (b.inside.length < def.capacity && admit(world, b, def)) { /* 탑승 */ }
    }
    b.timer--;
    if (b.inside.length >= def.capacity || (b.timer <= 0 && b.inside.length > 0)) {
      b.phase = 'running';
      b.timer = def.duration;
    } else if (b.timer <= 0) {
      b.phase = 'idle';
    }
  } else if (b.phase === 'running') {
    if (--b.timer <= 0) {
      for (const id of [...b.inside]) release(world, b, def, id);
      b.phase = 'idle';
      b.cycles++;
      b.reliability = Math.max(0, b.reliability - RELIABILITY_LOSS);
      if (breaksDown(b)) {
        b.broken = true;
        b.brokenTicks = 0;
        evictAll(world, b, 'broken'); // 줄 선 손님은 실망해서 돌아선다
      }
    }
  }
}
