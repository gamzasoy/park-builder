import type { Guest } from '../sim/guest';
import type { Staff } from '../sim/staff';
import type { Vec2 } from './iso';

/** 같은 길 위에서 손님이 한 점에 겹치지 않도록 하는 고정 오프셋(타일 단위, 렌더 전용) */
export function laneOffset(id: number, salt: number): number {
  return (((id * salt) % 100) / 100 - 0.5) * 0.3;
}

/** 화면에 그려지는 손님의 타일 좌표. 클릭 선택(picking)도 같은 위치를 쓴다. */
export function guestDisplayPos(g: Guest, alpha: number): Vec2 {
  if (g.state === 'queueing') {
    // 입구 타일 안에서 순번별로 3x3 격자로 흩어 줄 선 모습을 표현
    return {
      x: g.x + ((g.slot % 3) - 1) * 0.22,
      y: g.y + ((((g.slot / 3) | 0) % 3) - 1) * 0.22,
    };
  }
  return {
    x: g.px + (g.x - g.px) * alpha + laneOffset(g.id, 7919),
    y: g.py + (g.y - g.py) * alpha + laneOffset(g.id, 104729),
  };
}

/** 화면에 그려지는 직원의 타일 좌표(틱 사이 보간). 클릭 선택도 같은 위치를 쓴다. */
export function staffDisplayPos(s: Staff, alpha: number): Vec2 {
  return { x: s.px + (s.x - s.px) * alpha, y: s.py + (s.y - s.py) * alpha };
}
