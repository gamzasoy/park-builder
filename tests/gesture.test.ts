import { describe, expect, it } from 'vitest';
import { TAP_SLOP, TouchGesture } from '../src/input/gesture';

const mk = (build: boolean) => new TouchGesture(() => build);

describe('TouchGesture - 선택 모드', () => {
  it('거의 움직이지 않고 떼면 탭', () => {
    const g = mk(false);
    expect(g.down(1, 100, 100)).toEqual([]);
    expect(g.move(1, 103, 102)).toEqual([]);
    expect(g.up(1, 103, 102)).toEqual([{ type: 'tap', x: 103, y: 102 }]);
  });

  it('슬롭을 넘기면 팬이 되고 탭은 발생하지 않는다', () => {
    const g = mk(false);
    g.down(1, 100, 100);
    const a = g.move(1, 100 + TAP_SLOP + 5, 100);
    expect(a).toEqual([{ type: 'pan', dx: TAP_SLOP + 5, dy: 0 }]);
    expect(g.move(1, 130, 110)).toEqual([{ type: 'pan', dx: 130 - (100 + TAP_SLOP + 5), dy: 10 }]);
    expect(g.up(1, 130, 110)).toEqual([]);
  });
});

describe('TouchGesture - 건설 모드', () => {
  it('down → move → up 이 그대로 전달된다', () => {
    const g = mk(true);
    expect(g.down(1, 10, 10)).toEqual([{ type: 'down', x: 10, y: 10 }]);
    expect(g.move(1, 50, 60)).toEqual([{ type: 'move', x: 50, y: 60 }]);
    expect(g.up(1, 50, 60)).toEqual([{ type: 'up', x: 50, y: 60 }]);
  });

  it('두 번째 손가락이 닿으면 진행 중인 건설을 취소하고 핀치로 넘어간다', () => {
    const g = mk(true);
    g.down(1, 100, 100);
    expect(g.down(2, 200, 100)).toEqual([{ type: 'cancel' }]);
    // 두 손가락을 벌리면 줌 인
    const z = g.move(2, 300, 100);
    expect(z).toContainEqual({ type: 'zoom', x: 200, y: 100, factor: 2 });
    // 손가락을 떼도 up(건설 확정)이 나오면 안 된다
    expect(g.up(2, 300, 100)).toEqual([]);
    expect(g.up(1, 100, 100)).toEqual([]);
  });

  it('pointercancel 이면 건설을 취소한다', () => {
    const g = mk(true);
    g.down(1, 5, 5);
    expect(g.cancel(1)).toEqual([{ type: 'cancel' }]);
    expect(g.active).toBe(false);
  });
});

describe('TouchGesture - 핀치', () => {
  it('좁히면 factor < 1, 중점이 움직이면 팬도 같이 나온다', () => {
    const g = mk(false);
    g.down(1, 100, 100);
    g.down(2, 300, 100);
    const out = g.move(2, 200, 100); // 거리 200 → 100, 중점 (200,100) → (150,100)
    expect(out).toContainEqual({ type: 'pan', dx: -50, dy: 0 });
    expect(out).toContainEqual({ type: 'zoom', x: 150, y: 100, factor: 0.5 });
  });

  it('핀치 후 남은 한 손가락은 모두 뗄 때까지 무시(탭도 팬도 없음)', () => {
    const g = mk(false);
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    expect(g.up(2, 200, 100)).toEqual([]);
    expect(g.move(1, 300, 300)).toEqual([]);
    expect(g.up(1, 300, 300)).toEqual([]);
    // 이후 새 터치는 정상 동작
    g.down(3, 5, 5);
    expect(g.up(3, 5, 5)).toEqual([{ type: 'tap', x: 5, y: 5 }]);
  });
});
