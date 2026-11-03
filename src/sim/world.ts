import { TileMap, type Tile } from './map';

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
  money = START_MONEY;
  readonly buildings = new Map<number, Building>();
  nextBuildingId = 1;
}
