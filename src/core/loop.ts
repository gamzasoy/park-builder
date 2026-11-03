/** 고정 틱 시뮬레이션 + requestAnimationFrame 렌더 루프. 속도 배율/일시정지 지원. */
export const TICKS_PER_SECOND = 10;
const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 20; // 탭 비활성 후 복귀 시 폭주 방지

export type Speed = 0 | 1 | 2 | 4;

export class GameLoop {
  speed: Speed = 1;
  private acc = 0;
  private last = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly update: () => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** 경과 시간(ms)만큼 틱을 진행하고 실행한 틱 수를 반환. 테스트용으로 분리. */
  advance(elapsedMs: number): number {
    this.acc += elapsedMs * this.speed;
    let ticks = 0;
    while (this.acc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      this.update();
      this.acc -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.acc = 0;
    return ticks;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min(now - this.last, 250);
    this.last = now;
    this.advance(elapsed);
    this.render(this.acc / TICK_MS);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
