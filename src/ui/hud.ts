import type { ToolController } from '../input/tools';
import type { World } from '../sim/world';

export const won = (n: number): string => `₩${n.toLocaleString('ko-KR')}`;

const HINTS: Record<string, string> = {
  none: '아래 툴바에서 도구를 고르세요',
  path: '길: 드래그로 직선 설치 (Esc 취소)',
  build: '클릭해 설치 · R 회전 · 노란 칸이 입구 (Esc 취소)',
  demolish: '철거: 건물이나 길을 클릭 (환급 50%)',
};

export class Hud {
  private money = document.getElementById('money')!;
  private hint = document.getElementById('hint')!;
  private lastMoney = NaN;
  private lastHint = '';

  constructor(private world: World, private tools: ToolController) {}

  update(): void {
    if (this.world.money !== this.lastMoney) {
      this.lastMoney = this.world.money;
      this.money.textContent = won(this.world.money);
    }
    const text = performance.now() < this.tools.messageUntil
      ? this.tools.message
      : HINTS[this.tools.tool.kind];
    if (text !== this.lastHint) {
      this.lastHint = text;
      this.hint.textContent = text;
    }
  }
}
