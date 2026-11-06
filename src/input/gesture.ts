/**
 * 터치 제스처 상태기. DOM을 모르는 순수 로직이라 단위 테스트가 가능하다.
 *
 * - 한 손가락 + 건설 도구: down → move* → up (미리보기가 손가락을 따라간다)
 * - 한 손가락 + 선택 모드: 거의 안 움직이면 tap, 움직이면 pan
 * - 한 손가락 + 선택 모드에서 길게 누르기: longPress()로 건설 입력(build)으로 바꿔, 이후 move/up이 나온다(건물 끌어 옮기기)
 * - 두 손가락: 핀치 줌(중점 기준) + 중점 이동 팬. 닿는 순간 진행 중이던 한 손가락 건설은 cancel
 */

export type GestureAction =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up'; x: number; y: number }
  | { type: 'cancel' }
  | { type: 'tap'; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; x: number; y: number; factor: number };

/** 이 거리(px) 안에서 뗀 터치는 탭, 넘으면 드래그 */
export const TAP_SLOP = 10;

type State = 'idle' | 'build' | 'pending' | 'pan' | 'pinch' | 'ignore';

interface P {
  x: number;
  y: number;
}

export class TouchGesture {
  private pts = new Map<number, P>();
  private state: State = 'idle';
  private start: P = { x: 0, y: 0 };
  private last: P = { x: 0, y: 0 };
  private lastDist = 0;
  private lastMid: P = { x: 0, y: 0 };

  /** @param buildMode 건설 도구가 켜져 있으면 true (한 손가락이 건설 입력이 된다) */
  constructor(private buildMode: () => boolean) {}

  get active(): boolean {
    return this.pts.size > 0;
  }

  private pair(): [P, P] {
    const [a, b] = [...this.pts.values()];
    return [a, b];
  }

  private measure(): { mid: P; dist: number } {
    const [a, b] = this.pair();
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  down(id: number, x: number, y: number): GestureAction[] {
    this.pts.set(id, { x, y });
    const out: GestureAction[] = [];
    if (this.pts.size === 1) {
      this.start = { x, y };
      this.last = { x, y };
      if (this.buildMode()) {
        this.state = 'build';
        out.push({ type: 'down', x, y });
      } else {
        this.state = 'pending';
      }
    } else if (this.pts.size === 2) {
      if (this.state === 'build') out.push({ type: 'cancel' });
      this.state = 'pinch';
      const m = this.measure();
      this.lastMid = m.mid;
      this.lastDist = m.dist;
    } else {
      this.state = 'ignore';
    }
    return out;
  }

  move(id: number, x: number, y: number): GestureAction[] {
    const p = this.pts.get(id);
    if (!p) return [];
    p.x = x;
    p.y = y;
    const out: GestureAction[] = [];
    switch (this.state) {
      case 'build':
        out.push({ type: 'move', x, y });
        break;
      case 'pending':
        if (Math.hypot(x - this.start.x, y - this.start.y) > TAP_SLOP) {
          this.state = 'pan';
          // 슬롭을 넘긴 순간 시작점부터의 이동량을 한 번에 반영해 끊김이 없게 한다
          out.push({ type: 'pan', dx: x - this.start.x, dy: y - this.start.y });
          this.last = { x, y };
        }
        break;
      case 'pan':
        out.push({ type: 'pan', dx: x - this.last.x, dy: y - this.last.y });
        this.last = { x, y };
        break;
      case 'pinch': {
        const m = this.measure();
        out.push({ type: 'pan', dx: m.mid.x - this.lastMid.x, dy: m.mid.y - this.lastMid.y });
        if (this.lastDist > 0 && m.dist > 0) {
          out.push({ type: 'zoom', x: m.mid.x, y: m.mid.y, factor: m.dist / this.lastDist });
        }
        this.lastMid = m.mid;
        this.lastDist = m.dist;
        break;
      }
      default:
        break;
    }
    return out;
  }

  up(id: number, x: number, y: number): GestureAction[] {
    if (!this.pts.has(id)) return [];
    this.pts.delete(id);
    const out: GestureAction[] = [];
    if (this.state === 'build') out.push({ type: 'up', x, y });
    else if (this.state === 'pending') out.push({ type: 'tap', x, y });
    // 핀치 중 한 손가락이 떨어지면 남은 손가락은 모두 뗄 때까지 무시(갑작스런 팬 방지)
    if (this.pts.size === 0) this.state = 'idle';
    else if (this.state === 'pinch') this.state = 'ignore';
    return out;
  }

  /** 한 손가락으로 움직이지 않고 누르고 있는가(길게 누르기 판정 대상) */
  get holding(): boolean {
    return this.state === 'pending' && this.pts.size === 1;
  }

  /** 길게 누르기가 인정되면 그 손가락을 건설 입력으로 바꾼다. 바뀌었으면 true */
  longPress(): boolean {
    if (!this.holding) return false;
    this.state = 'build';
    return true;
  }

  /** 시스템이 터치를 가로챈 경우(pointercancel). 진행 중인 건설은 취소한다. */
  cancel(id: number): GestureAction[] {
    if (!this.pts.has(id)) return [];
    this.pts.delete(id);
    const out: GestureAction[] = [];
    if (this.state === 'build') out.push({ type: 'cancel' });
    if (this.pts.size === 0) this.state = 'idle';
    else this.state = 'ignore';
    return out;
  }
}
