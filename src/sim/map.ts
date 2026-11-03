export const MAP_SIZE = 48;

export const enum Terrain {
  Grass = 0,
}

export class TileMap {
  readonly terrain: Uint8Array;

  constructor(public readonly width = MAP_SIZE, public readonly height = MAP_SIZE) {
    this.terrain = new Uint8Array(width * height); // 0 = Grass
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }
}
