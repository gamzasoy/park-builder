import type { Speed } from '../core/loop';
import type { ToolController } from '../input/tools';
import { dateOf, setEntranceFee } from '../sim/economy';
import { GOAL, goalProgress } from '../sim/goals';
import { BUS_GUESTS } from '../sim/events';
import { clockOf, isNight } from '../sim/daynight';
import type { World } from '../sim/world';
import { Stepper } from './stepper';

export interface HudActions {
  onFinance: () => void;
  onMissions: () => void;
  onSave: () => void;
  onNewGame: () => void;
}

export const won = (n: number): string => `₩${n.toLocaleString('ko-KR')}`;
/** 부호 포함 금액: +₩1,200 / −₩300 */
export const signedWon = (n: number): string => (n < 0 ? `−${won(-n)}` : `+${won(n)}`);

const HINTS: Record<string, string> = {
  none: '건물·손님·직원을 클릭하면 정보를 볼 수 있습니다 · 아래 툴바에서 도구를 고르세요',
  path: '길: 드래그로 직선 설치 (Esc 취소)',
  build: '클릭해 설치 · R 회전 · 입구(노란 칸)를 길에 이어야 운영됩니다 (Esc 취소)',
  demolish: '철거: 건물·길(환급 50%)이나 나무·꽃(무료)을 클릭',
  terrain: '지형: 클릭하거나 드래그해 한 칸씩 올리거나 내리기 (높이 0~4, 이웃 칸과 1단계 차이까지, 길·건물·입구 칸은 불가 · Esc 취소)',
  scenery: '나무·꽃·쓰레기통: 빈 잔디를 클릭하거나 드래그해 놓기 · 길가의 나무는 손님 기분을 좋게 하고, 쓰레기통은 근처 3칸의 쓰레기를 받아 줍니다 (Esc 취소)',
};

const WEATHER_VIEW = {
  sunny: { icon: '☀️', label: '맑음', tip: '맑음: 손님이 평소처럼 찾아옵니다' },
  cloudy: { icon: '☁️', label: '흐림', tip: '흐림: 영향 없음' },
  rain: { icon: '🌧', label: '비', tip: '비: 손님 입장 −30% · 우산 없는 손님은 실외 놀이기구를 꺼리고 기분이 나빠집니다 · 우산 가게가 도움이 됩니다' },
} as const;

/** 랜덤 이벤트·불꽃놀이 표시(날씨 옆) */
export const EVENT_VIEW = {
  bus: { icon: '🚌', label: '관광버스', tip: `단체 관광버스: 손님 ${BUS_GUESTS}명이 한꺼번에 입장했습니다` },
  heatwave: { icon: '🔥', label: '폭염', tip: '폭염: 손님이 평소보다 훨씬 빨리 목말라집니다 · 음료·아이스크림을 준비하세요' },
  hype: { icon: '📸', label: '입소문', tip: '인기 블로거 방문: 잠시 동안 손님 입장이 2배' },
  blackout: { icon: '⚡', label: '정전', tip: '정전: 잠시 동안 놀이기구가 새 손님을 태우지 못합니다 · 줄 선 손님은 기다리다 지칩니다' },
  vip: { icon: '👑', label: 'VIP 방문', tip: 'VIP 손님: 왕관을 쓴 손님이 타고 싶은 놀이기구를 태워 주면 상금을 받습니다' },
  fireworks: { icon: '🎆', label: '불꽃놀이', tip: '불꽃놀이: 공원 모든 손님의 기분이 오르고, 구경하러 손님이 더 옵니다' },
} as const;

const SPEEDS: Speed[] = [0, 1, 2, 4];

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export class Hud {
  private money = document.getElementById('money')!;
  private date = document.getElementById('date')!;
  private guests = document.getElementById('guests')!;
  private rating = document.getElementById('rating')!;
  private weather = document.getElementById('weather')!;
  private hint = document.getElementById('hint')!;
  private goal = document.getElementById('goal')!;
  private hudEl = document.getElementById('hud')!;
  private hudH = -1;
  private speedButtons = new Map<Speed, HTMLButtonElement>();
  private fee: Stepper;
  private shownSpeed: Speed | -1 = -1;

  constructor(
    private world: World,
    private tools: ToolController,
    private clock: { speed: Speed },
    actions: HudActions,
  ) {
    for (const s of SPEEDS) {
      const b = document.querySelector<HTMLButtonElement>(`button[data-speed="${s}"]`)!;
      b.addEventListener('click', () => { b.blur(); this.clock.speed = s; });
      this.speedButtons.set(s, b);
    }
    this.fee = new Stepper(1, 5, (d) => setEntranceFee(this.world, this.world.entranceFee + d));
    document.getElementById('fee-ctl')!.append(this.fee.el);
    const wire = (id: string, fn: () => void): void => {
      document.getElementById(id)!.addEventListener('click', (e) => {
        (e.currentTarget as HTMLElement).blur();
        fn();
      });
    };
    wire('finance-btn', actions.onFinance);
    wire('missions-btn', actions.onMissions);
    wire('save-btn', actions.onSave);
    wire('new-btn', actions.onNewGame);
  }

  update(): void {
    const w = this.world;
    setText(this.money, won(w.money));
    this.money.classList.toggle('neg', w.money < 0);

    const d = dateOf(w.tick);
    const c = clockOf(w.tick);
    const moon = isNight(w.tick) ? ' 🌙' : '';
    setText(this.date, `${d.year}년차 ${d.month}월 ${d.day}일 ${c.hour}:${String(c.minute).padStart(2, '0')}${moon}`);
    setText(this.guests, `손님 ${w.guests.length}명`);

    const r = Math.round(w.rating);
    setText(this.rating, `평점 ${r}`);
    this.rating.dataset.level = r < 300 ? 'low' : r < 600 ? 'mid' : 'high';
    const p = w.ratingParts;
    this.rating.title =
      `기본 ${Math.round(p.base)} · 만족도 ${Math.round(p.satisfaction)} · 다양성 ${Math.round(p.variety)}` +
      ` · 흐름 ${Math.round(p.flow)} · 불만 −${Math.round(p.complaints)}` +
      ` · 청결 ${Math.round(p.cleanliness)}`;

    const wv = WEATHER_VIEW[w.weather.kind];
    const ev = w.event ? EVENT_VIEW[w.event.kind] : null;
    const show = w.fireworks ? EVENT_VIEW.fireworks : null;
    setText(this.weather, [`${wv.icon} ${wv.label}`, ev && `${ev.icon} ${ev.label}`, show && `${show.icon} ${show.label}`].filter(Boolean).join(' · '));
    const tip = [wv.tip, ev?.tip, show?.tip].filter(Boolean).join('\n');
    // 노란 쪽지와 카드가 HUD 아래에 오도록 실제 높이를 CSS에 알린다
    const h = this.hudEl.offsetHeight;
    if (h !== this.hudH) {
      this.hudH = h;
      document.documentElement.style.setProperty('--hud-h', `${h}px`);
    }
    if (this.weather.title !== tip) this.weather.title = tip;

    if (this.clock.speed !== this.shownSpeed) {
      this.shownSpeed = this.clock.speed;
      for (const [s, b] of this.speedButtons) b.classList.toggle('active', s === this.clock.speed);
    }

    this.fee.text = won(w.entranceFee);

    this.updateGoal();

    const text = performance.now() < this.tools.messageUntil ? this.tools.message : HINTS[this.tools.tool.kind];
    setText(this.hint, text);
  }

  private updateGoal(): void {
    const w = this.world;
    if (w.status === 'won') return setText(this.goal, '목표 달성');
    if (w.status === 'lost') return setText(this.goal, '게임 종료');
    if (w.status === 'sandbox') return setText(this.goal, '자유 모드');

    const p = goalProgress(w);
    const mark = (ok: boolean): string => (ok ? '✓' : '');
    setText(
      this.goal,
      `목표 ${GOAL.months}개월 내 · 손님 ${p.guests}/${GOAL.guests}${mark(p.guestsMet)}` +
        ` · 평점 ${p.rating}/${GOAL.rating}${mark(p.ratingMet)}` +
        ` · 유지 ${Math.round(p.hold * 100)}% · 남은 ${p.remainingDays}일`,
    );
  }
}
