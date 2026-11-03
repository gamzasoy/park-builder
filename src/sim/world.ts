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
}

export class World {
  readonly map = new TileMap();
  readonly network = new PathNetwork(this.map);
  money = START_MONEY;
  readonly buildings = new Map<number, Building>();
  nextBuildingId = 1;

  guests: Guest[] = [];
  nextGuestId = 1;
  /** 시뮬레이션 틱 카운터 */
  tick = 0;
  rng = new Rng(12345);
  stats = { entered: 0, left: 0 };
}
