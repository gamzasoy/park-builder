import { describe, expect, it } from 'vitest';
import { GameLoop } from '../src/core/loop';

function make() {
  let n = 0;
  const loop = new GameLoop(() => { n++; }, () => {});
  return { loop, count: () => n };
}

describe('GameLoop.advance', () => {
  it('runs one tick per 100ms at 1x', () => {
    const { loop, count } = make();
    expect(loop.advance(350)).toBe(3);
    expect(count()).toBe(3);
  });
  it('carries remainder across calls', () => {
    const { loop } = make();
    loop.advance(60);
    expect(loop.advance(60)).toBe(1);
  });
  it('scales with speed and pauses at 0', () => {
    const { loop } = make();
    loop.speed = 4;
    expect(loop.advance(100)).toBe(4);
    loop.speed = 0;
    expect(loop.advance(1000)).toBe(0);
  });
  it('caps ticks per frame', () => {
    const { loop } = make();
    loop.speed = 4;
    expect(loop.advance(250)).toBe(10);
    expect(loop.advance(10000)).toBe(20);
  });
});
