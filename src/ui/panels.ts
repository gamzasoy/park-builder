import { getDef } from '../data';
import type { ToolController } from '../input/tools';
import { demolishAt, REFUND_RATE } from '../sim/building';
import { dailyUpkeep, fairPrice, setPrice } from '../sim/economy';
import type { Ledger, LedgerKey, World } from '../sim/world';
import { signedWon, won } from './hud';
import { Stepper } from './stepper';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const setText = (el: HTMLElement, t: string): void => { if (el.textContent !== t) el.textContent = t; };

const PHASE_TEXT = { idle: '대기 중', loading: '탑승 중', running: '운행 중' } as const;

/** 선택한 건물의 상태·통계·요금 조절·철거 */
export class BuildingPanel {
  private root = $('panel');
  private name = $('p-name');
  private status = $('p-status');
  private queue = $('p-queue');
  private served = $('p-served');
  private income = $('p-income');
  private upkeep = $('p-upkeep');
  private fair = $('p-fair');
  private price: Stepper;
  private demolishBtn = $<HTMLButtonElement>('p-demolish');

  constructor(private world: World, private tools: ToolController) {
    this.price = new Stepper(1, 5, (d) => {
      const b = this.current();
      if (b) setPrice(b, b.price + d);
    });
    $('p-price-ctl').append(this.price.el);
    $('p-close').addEventListener('click', () => { this.tools.selectedId = null; });
    this.demolishBtn.addEventListener('click', () => {
      const b = this.current();
      if (!b) return;
      demolishAt(this.world, b.x, b.y);
      this.tools.selectedId = null;
    });
  }

  private current() {
    return this.tools.selectedId !== null ? this.world.buildings.get(this.tools.selectedId) : undefined;
  }

  update(): void {
    const b = this.current();
    if (!b) {
      if (!this.root.hidden) this.root.hidden = true;
      return;
    }
    if (this.root.hidden) this.root.hidden = false;

    const def = getDef(b.defId);
    const operational = this.world.network.isOperational(b);
    setText(this.name, def.name);
    setText(this.status, !operational ? '운영 불가 (입구가 길과 끊김)' : def.kind === 'ride' ? PHASE_TEXT[b.phase] : '영업 중');
    this.status.dataset.ok = operational ? '1' : '0';
    setText(this.queue, `${b.queue.length}명 대기 · ${b.inside.length}/${def.capacity} 이용 중`);
    setText(this.served, `${b.served.toLocaleString('ko-KR')}명`);
    setText(this.income, won(b.income));
    setText(this.upkeep, won(def.upkeep));
    const fair = fairPrice(def);
    setText(this.fair, won(fair));
    this.price.text = won(b.price);
    this.price.el.classList.toggle('over', b.price > fair);
    setText(this.demolishBtn, `철거 (환급 ${won(Math.floor(def.cost * REFUND_RATE))})`);
  }
}

const ROWS: [LedgerKey, string][] = [
  ['entrance', '입장료'],
  ['rides', '놀이기구 수익'],
  ['shops', '매점 수익'],
  ['construction', '건설/철거'],
  ['upkeep', '유지비'],
];

/** 이번 달 진행 상황과 지난 달 보고서 */
export class FinancePanel {
  private root = $('finance');
  private cur: Record<string, HTMLElement> = {};
  private prev: Record<string, HTMLElement> = {};
  private prevHead = $('f-prev-head');
  private extra = $('f-extra');
  private seenReports = 0;

  constructor(private world: World) {
    const body = $('f-body');
    for (const [key, label] of [...ROWS, ['net' as LedgerKey, '합계']]) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = label;
      const a = document.createElement('td');
      const b = document.createElement('td');
      tr.append(th, a, b);
      if (key === ('net' as LedgerKey)) tr.className = 'total';
      body.append(tr);
      this.cur[key] = a;
      this.prev[key] = b;
    }
    $('f-close').addEventListener('click', () => this.toggle(false));
    this.seenReports = world.reports.length;
  }

  /** 불러오기/새 게임 후 보고서 개수를 다시 맞춰 자동 열림을 막는다 */
  sync(): void {
    this.seenReports = this.world.reports.length;
  }

  toggle(open = this.root.hidden): void {
    this.root.hidden = !open;
  }

  update(): void {
    const w = this.world;
    // 새 월간 보고서가 나오면 자동으로 연다
    if (w.reports.length !== this.seenReports) {
      if (w.reports.length > this.seenReports) this.toggle(true);
      this.seenReports = w.reports.length;
    }
    if (this.root.hidden) return;

    const sum = (l: Ledger): number => Object.values(l).reduce((a, b) => a + b, 0);
    for (const [key] of ROWS) setText(this.cur[key], signedWon(w.ledger[key]));
    setText(this.cur.net, signedWon(sum(w.ledger)));

    const last = w.reports[w.reports.length - 1];
    setText(this.prevHead, last ? `지난 달 (${last.year}년차 ${last.month}월)` : '지난 달');
    for (const [key] of ROWS) setText(this.prev[key], last ? signedWon(last.ledger[key]) : '–');
    setText(this.prev.net, last ? signedWon(last.net) : '–');

    setText(
      this.extra,
      `하루 유지비 ${won(dailyUpkeep(w))}` +
        (last ? ` · 지난 달 입장 ${last.entered}명 · 월말 평점 ${last.rating}` : ''),
    );
  }
}
