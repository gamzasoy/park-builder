import type { Speed } from '../core/loop';
import type { ToolController } from '../input/tools';
import { dateOf, setEntranceFee } from '../sim/economy';
import type { World } from '../sim/world';
import { Stepper } from './stepper';

export const won = (n: number): string => `₩${n.toLocaleString('ko-KR')}`;
/** 부호 포함 금액: +₩1,200 / −₩300 */
export const signedWon = (n: number): string => (n < 0 ? `−${won(-n)}` : `+${won(n)}`);

const HINTS: Record<string, string> = {
  none: '건물을 클릭하면 정보와 요금을 볼 수 있습니다 · 아래 툴바에서 도구를 고르세요',
  path: '길: 드래그로 직선 설치 (Esc 취소)',
  build: '클릭해 설치 · R 회전 · 입구(노란 칸)를 길에 이어야 운영됩니다 (Esc 취소)',
  demolish: '철거: 건물이나 길을 클릭 (환급 50%)',
};

const SPEEDS: Speed[] = [0, 1, 2, 4];

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export class Hud {
  private money = document.getElementById('money')!;
  private date = document.getElementById('date')!;
  private guests = document.getElementById('guests')!;
  private rating = document.getElementById('rating')!;
  private hint = document.getElementById('hint')!;
  private speedButtons = new Map<Speed, HTMLButtonElement>();
  private fee: Stepper;
  private shownSpeed: Speed | -1 = -1;

  constructor(
    private world: World,
    private tools: ToolController,
    private clock: { speed: Speed },
    onFinance: () => void,
  ) {
    for (const s of SPEEDS) {
      const b = document.querySelector<HTMLButtonElement>(`button[data-speed="${s}"]`)!;
      b.addEventListener('click', () => { b.blur(); this.clock.speed = s; });
      this.speedButtons.set(s, b);
    }
    this.fee = new Stepper(1, 5, (d) => setEntranceFee(this.world, this.world.entranceFee + d));
    document.getElementById('fee-ctl')!.append(this.fee.el);
    document.getElementById('finance-btn')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      onFinance();
    });
  }

  update(): void {
    const w = this.world;
    setText(this.money, won(w.money));
    this.money.classList.toggle('neg', w.money < 0);

    const d = dateOf(w.tick);
    setText(this.date, `${d.year}년차 ${d.month}월 ${d.day}일`);
    setText(this.guests, `손님 ${w.guests.length}명`);

    const r = Math.round(w.rating);
    setText(this.rating, `평점 ${r}`);
    this.rating.dataset.level = r < 300 ? 'low' : r < 600 ? 'mid' : 'high';
    const p = w.ratingParts;
    this.rating.title =
      `기본 ${Math.round(p.base)} · 만족도 ${Math.round(p.satisfaction)} · 다양성 ${Math.round(p.variety)}` +
      ` · 흐름 ${Math.round(p.flow)} · 불만 −${Math.round(p.complaints)}`;

    if (this.clock.speed !== this.shownSpeed) {
      this.shownSpeed = this.clock.speed;
      for (const [s, b] of this.speedButtons) b.classList.toggle('active', s === this.clock.speed);
    }

    this.fee.text = won(w.entranceFee);

    const text = performance.now() < this.tools.messageUntil ? this.tools.message : HINTS[this.tools.tool.kind];
    setText(this.hint, text);
  }
}
