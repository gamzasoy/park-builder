import { Rng } from '../core/rng';
import type { Guest } from './guest';
import { TileMap, type Tile } from './map';
import { PathNetwork } from './pathfinding';

export const START_MONEY = 30000;

export interface Building {
  id: number;
  defId: string;
  /** 회전 후 풋프린트의 좌상단(최소 x, y)과 크기 */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  entrance: Tile;
  /** 입구 앞 대기열(손님 id, 앞이 먼저) */
  queue: number[];
  /** 이용 중인 손님 id */
  inside: number[];
  /** 놀이기구 사이클 단계 (매점은 항상 'idle') */
  phase: 'idle' | 'loading' | 'running';
  timer: number;
  /** 누적 이용 손님 수 / 누적 수익 */
  served: number;
  income: number;
}

export class World {
  readonly map = new TileMap();
  readonly network = new PathNetwork(this.map);
  money = START_MONEY;
  readonly buildings = new Map<number, Building>();
  nextBuildingId = 1;

  guests: Guest[] = [];
  /** 틱마다 재구성되는 id 조회용(저장 대상 아님) */
  guestById = new Map<number, Guest>();
  nextGuestId = 1;
  /** 시뮬레이션 틱 카운터 */
  tick = 0;
  rng = new Rng(12345);
  stats = { entered: 0, left: 0 };
}
