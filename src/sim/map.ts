import { OAK, PINE } from '../data/scenery';

export const MAP_SIZE = 48;

export interface Tile { x: number; y: number }

/** 좌표 → 0~1 사이의 고정된 의사 난수(시뮬레이션 RNG를 쓰지 않아 결정성에 영향이 없다) */
export function tileHash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class TileMap {
  /** 1 = 길 */
  readonly path: Uint8Array;
  /** 건물 id (0 = 비어 있음) */
  readonly occupant: Int32Array;
  /** 장식 종류(0 = 없음, data/scenery.ts의 kind) */
  readonly scenery: Uint8Array;
  /** 길 위 쓰레기 양(0~3). 길 타일에만 쌓인다 */
  readonly litter: Uint8Array;
  /** 공원 입구(맵 아래쪽 가장자리 중앙). 항상 길이며 철거 불가 */
  readonly gate: Tile;
  /** 길 구성이 바뀔 때마다 증가 — 길찾기 캐시 무효화에 사용 */
  version = 0;

  constructor(public readonly width = MAP_SIZE, public readonly height = MAP_SIZE) {
    this.path = new Uint8Array(width * height);
    this.occupant = new Int32Array(width * height);
    this.scenery = new Uint8Array(width * height);
    this.litter = new Uint8Array(width * height);
    this.gate = { x: Math.floor(width / 2), y: height - 1 };
    this.path[this.index(this.gate.x, this.gate.y)] = 1;
    this.plantNaturalTrees();
  }

  /** 새 공원의 가장자리 숲. 입구 쪽(아래 가장자리)은 비워 둔다. */
  private plantNaturalTrees(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const edge = Math.min(x, y, this.width - 1 - x);
        if (edge > 2 || y >= this.height - 8) continue;
        const chance = [0.6, 0.4, 0.2][edge];
        if (tileHash(x, y) < chance) this.scenery[this.index(x, y)] = tileHash(x, y, 1) < 0.65 ? PINE : OAK;
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  isPath(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.path[this.index(x, y)] === 1;
  }

  setPath(x: number, y: number, on: boolean): void {
    this.path[this.index(x, y)] = on ? 1 : 0;
    if (on) this.scenery[this.index(x, y)] = 0;
    else this.litter[this.index(x, y)] = 0;
    this.version++;
  }

  isGate(x: number, y: number): boolean {
    return x === this.gate.x && y === this.gate.y;
  }

  litterAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.litter[this.index(x, y)] : 0;
  }

  sceneryAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.scenery[this.index(x, y)] : 0;
  }
}
