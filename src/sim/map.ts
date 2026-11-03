import { OAK, PINE } from '../data/scenery';

export const MAP_SIZE = 48;
/** 지형 높이 상한(0 = 평지). 코스터 트랙 높이(MAX_HEIGHT)와 같은 단위의 절대 높이 */
export const MAX_TERRAIN = 4;

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
  /**
   * 지형 높이(0~MAX_TERRAIN), 타일당 1단계. 이름이 `height`가 아닌 것은 `height`가 맵 세로 크기라서다.
   * 읽기는 heightAt, 쓰기는 setHeight(version을 올려 지면 캐시·길찾기 캐시를 무효화).
   */
  readonly terrain: Uint8Array;
  /** 공원 입구(맵 아래쪽 가장자리 중앙). 항상 길이며 철거 불가 */
  readonly gate: Tile;
  /** 길 구성이 바뀔 때마다 증가 — 길찾기 캐시 무효화에 사용 */
  version = 0;

  constructor(public readonly width = MAP_SIZE, public readonly height = MAP_SIZE) {
    this.path = new Uint8Array(width * height);
    this.occupant = new Int32Array(width * height);
    this.scenery = new Uint8Array(width * height);
    this.litter = new Uint8Array(width * height);
    this.terrain = new Uint8Array(width * height);
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

  /** 타일의 지형 높이. 맵 밖은 0 */
  heightAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.terrain[this.index(x, y)] : 0;
  }

  /** 지형 높이를 0~MAX_TERRAIN으로 맞춰 쓴다. 바뀌었을 때만 version을 올린다. 규칙 검사(canChangeTerrain)는 호출한 쪽 몫. */
  setHeight(x: number, y: number, h: number): void {
    if (!this.inBounds(x, y)) return;
    const v = Math.max(0, Math.min(MAX_TERRAIN, Math.round(h)));
    const i = this.index(x, y);
    if (this.terrain[i] === v) return;
    this.terrain[i] = v;
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

/**
 * 연속 좌표(타일 단위, 타일 (tx,ty)의 중심이 (tx+0.5, ty+0.5))의 지면 높이.
 * 타일 중심의 높이를 쌍선형 보간한다. 경사로(높이차 1인 이웃 길) 위를 걷는 손님·직원의 높이에 쓴다.
 */
export function groundHeightAt(map: TileMap, x: number, y: number): number {
  const fx = Math.max(0, Math.min(map.width - 1, x - 0.5));
  const fy = Math.max(0, Math.min(map.height - 1, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(map.width - 1, x0 + 1);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = map.heightAt(x0, y0) * (1 - tx) + map.heightAt(x1, y0) * tx;
  const bot = map.heightAt(x0, y1) * (1 - tx) + map.heightAt(x1, y1) * tx;
  return top * (1 - ty) + bot * ty;
}
