export const MAP_SIZE = 48;

export interface Tile { x: number; y: number }

export class TileMap {
  /** 1 = 길 */
  readonly path: Uint8Array;
  /** 건물 id (0 = 비어 있음) */
  readonly occupant: Int32Array;
  /** 공원 입구(맵 아래쪽 가장자리 중앙). 항상 길이며 철거 불가 */
  readonly gate: Tile;
  /** 길 구성이 바뀔 때마다 증가 — 길찾기 캐시 무효화에 사용 */
  version = 0;

  constructor(public readonly width = MAP_SIZE, public readonly height = MAP_SIZE) {
    this.path = new Uint8Array(width * height);
    this.occupant = new Int32Array(width * height);
    this.gate = { x: Math.floor(width / 2), y: height - 1 };
    this.path[this.index(this.gate.x, this.gate.y)] = 1;
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
    this.version++;
  }

  isGate(x: number, y: number): boolean {
    return x === this.gate.x && y === this.gate.y;
  }
}
