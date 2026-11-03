/**
 * 정수 입력 → 32비트 부호 없는 해시. 시뮬레이션 RNG(world.rng)를 건드리지 않고
 * 결정적인 "무작위" 값이 필요할 때 쓴다(같은 입력이면 항상 같은 값).
 */
export function hash32(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
