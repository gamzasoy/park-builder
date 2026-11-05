import { getDef } from '../data';
import { buildingDef } from '../sim/coaster';
import type { ToolController } from '../input/tools';
import type { TestRun } from '../render/testrun';
import { THOUGHT_TEXT } from '../render/thoughts';
import type { Guest } from '../sim/guest';
import { fireStaff, STAFF_NAME, type Staff } from '../sim/staff';
import { demolishAt, REFUND_RATE } from '../sim/building';
import { dailyUpkeep, fairPrice, setPrice, WAGE } from '../sim/economy';
import type { Ledger, LedgerKey, World } from '../sim/world';
import { signedWon, won } from './hud';
import { Stepper } from './stepper';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const setText = (el: HTMLElement, t: string): void => { if (el.textContent !== t) el.textContent = t; };

const NEED_LABEL = { hunger: '배고픔', thirst: '갈증', toilet: '화장실' } as const;
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
  private trait = $('p-trait');
  private wait = $('p-wait');
  private price: Stepper;
  private demolishBtn = $<HTMLButtonElement>('p-demolish');
  private editBtn = $<HTMLButtonElement>('p-edit');
  private testBtn = $<HTMLButtonElement>('p-test');
  private relRow = $('p-rel-row');
  private rel = $('p-rel');
  private thrillRow = $('p-thrill-row');
  private thrill = $('p-thrill');

  constructor(private world: World, private tools: ToolController, private testRun: TestRun) {
    this.price = new Stepper(1, 5, (d) => {
      const b = this.current();
      if (b) setPrice(b, b.price + d);
    });
    $('p-price-ctl').append(this.price.el);
    $('p-close').addEventListener('click', () => { this.tools.selectedId = null; });
    this.editBtn.addEventListener('click', () => {
      const b = this.current();
      if (b) this.tools.beginTrackEdit(b.id);
    });
    this.testBtn.addEventListener('click', () => {
      const b = this.current();
      if (b && this.testRun.start(b)) this.tools.notify(this.testRun.result);
      else this.tools.notify('시운전할 트랙이 없습니다');
    });
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

    const def = buildingDef(b);
    const operational = this.world.network.isOperational(b);
    const trackPending = !!b.track && !b.track.ok;
    setText(this.name, def.name);
    setText(
      this.status,
      b.broken
        ? '고장 (정비 대기)'
        : !operational
        ? (trackPending ? `운영 불가 (${b.track!.error ?? '트랙이 아직 완성되지 않음'})` : '운영 불가 (입구가 길과 끊김)')
        : def.kind === 'ride' ? PHASE_TEXT[b.phase] : '영업 중',
    );
    this.relRow.hidden = def.kind !== 'ride';
    if (def.kind === 'ride') setText(this.rel, `${Math.round(b.reliability)} / 100${b.broken ? ' · 고장' : ''}`);
    this.thrillRow.hidden = def.kind !== 'ride' || (!b.track && def.intensity === undefined);
    this.editBtn.hidden = !b.track;
    this.testBtn.hidden = !b.track;
    if (!this.thrillRow.hidden) {
      setText(this.thrill, def.intensity !== undefined ? `${def.intensity} / ${def.nausea ?? 0}` : '–');
    }
    this.status.dataset.ok = operational ? '1' : '0';
    setText(this.queue, `${b.queue.length}명 대기 · ${b.inside.length}/${def.capacity} 이용 중`);
    setText(
      this.trait,
      b.track && !b.track.ok
        ? `조각 ${b.track.pieces.length}개 · 미완성`
        : def.kind === 'ride'
        ? `재미 ${def.fun ?? 0} · 정원 ${def.capacity}명 · ${def.duration / 10}초`
        : def.umbrella
        ? `우산 판매(비 올 때) · 동시 ${def.capacity}명`
        : `${def.serves ? NEED_LABEL[def.serves] : ''} 해소 · 동시 ${def.capacity}명`,
    );
    // 대기 시간 추정: 놀이기구는 한 사이클에 정원만큼, 매점은 정원만큼 동시에 처리
    const seconds = Math.ceil(b.queue.length / def.capacity) * ((def.duration + (def.kind === 'ride' ? 5 : 0)) / 10);
    setText(this.wait, b.queue.length === 0 ? '없음' : `약 ${seconds}초`);
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
  ['wages', '직원 급여'],
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
      `하루 유지비 ${won(dailyUpkeep(w))} · 급여 ${won(WAGE * w.staff.length)}` +
        (last ? ` · 지난 달 입장 ${last.entered}명 · 월말 평점 ${last.rating}` : ''),
    );
  }
}

const STATE_TEXT: Record<Guest['state'], string> = {
  idle: '둘러보는 중',
  walking: '이동 중',
  queueing: '줄 서는 중',
  visiting: '이용 중',
  leaving: '퇴장하는 중',
  gone: '',
};

/** [이름, 값을 읽는 함수, 높을수록 나쁜 욕구인지] */
const BARS: [string, (g: Guest) => number, boolean][] = [
  ['행복', (g) => g.needs.happiness, false],
  ['에너지', (g) => g.needs.energy, false],
  ['배고픔', (g) => g.needs.hunger, true],
  ['갈증', (g) => g.needs.thirst, true],
  ['화장실', (g) => g.needs.toilet, true],
];

/** 선택한 손님의 상태·욕구·생각 */
export class GuestPanel {
  private root = document.createElement('div');
  private title = document.createElement('b');
  private state = document.createElement('span');
  private thought = document.createElement('span');
  private money = document.createElement('span');
  private stay = document.createElement('span');
  private bars: { fill: HTMLElement; bar: HTMLElement; read: (g: Guest) => number; bad: boolean }[] = [];

  constructor(private world: World, private tools: ToolController) {
    this.root.id = 'gpanel';
    this.root.className = 'card';
    this.root.hidden = true;

    const head = document.createElement('div');
    head.className = 'head';
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = '닫기 (Esc)';
    close.addEventListener('click', () => { this.tools.selectedGuestId = null; });
    head.append(this.title, close);
    this.root.append(head);

    const row = (label: string, value: HTMLElement): void => {
      const r = document.createElement('div');
      r.className = 'p-row';
      const l = document.createElement('span');
      l.textContent = label;
      r.append(l, value);
      this.root.append(r);
    };
    row('상태', this.state);
    row('생각', this.thought);
    row('소지금', this.money);
    row('체류 시간', this.stay);
    for (const [label, read, bad] of BARS) {
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('i');
      bar.append(fill);
      row(label, bar);
      this.bars.push({ fill, bar, read, bad });
    }
    document.body.append(this.root);
  }

  update(): void {
    const id = this.tools.selectedGuestId;
    const g = id !== null ? this.world.guests.find((x) => x.id === id) : undefined;
    if (!g) {
      if (id !== null) this.tools.selectedGuestId = null; // 퇴장한 손님
      if (!this.root.hidden) this.root.hidden = true;
      return;
    }
    if (this.root.hidden) this.root.hidden = false;

    setText(this.title, `손님 #${g.id}`);
    const target = g.target !== null ? this.world.buildings.get(g.target) : undefined;
    const targetName = target ? getDef(target.defId).name : '';
    setText(this.state, STATE_TEXT[g.state] + (targetName && g.state !== 'idle' && g.state !== 'leaving' ? ` · ${targetName}` : ''));
    setText(this.thought, g.thought ? THOUGHT_TEXT[g.thought] : '–');
    setText(this.money, won(g.money));
    const secs = Math.floor(g.age / 10);
    setText(this.stay, `${Math.floor(secs / 60)}분 ${secs % 60}초`);

    for (const { fill, bar, read, bad } of this.bars) {
      const v = Math.max(0, Math.min(100, read(g)));
      fill.style.width = `${v.toFixed(0)}%`;
      bar.classList.toggle('bad', bad ? v > 70 : v < 30);
    }
  }
}

const STAFF_STATE_TEXT: Record<Staff['state'], string> = {
  idle: '순찰 중',
  walking: '이동 중',
  working: '작업 중',
};

/** 선택한 직원의 상태와 해고 */
export class StaffPanel {
  private root = document.createElement('div');
  private title = document.createElement('b');
  private state = document.createElement('span');
  private wage = document.createElement('span');
  private fireBtn = document.createElement('button');

  constructor(private world: World, private tools: ToolController) {
    this.root.id = 'spanel';
    this.root.className = 'card';
    this.root.hidden = true;

    const head = document.createElement('div');
    head.className = 'head';
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = '닫기 (Esc)';
    close.addEventListener('click', () => { this.tools.selectedStaffId = null; });
    head.append(this.title, close);
    this.root.append(head);

    const row = (label: string, value: HTMLElement): void => {
      const r = document.createElement('div');
      r.className = 'p-row';
      const l = document.createElement('span');
      l.textContent = label;
      r.append(l, value);
      this.root.append(r);
    };
    row('상태', this.state);
    row('급여', this.wage);

    this.fireBtn.id = 's-fire';
    this.fireBtn.textContent = '해고';
    this.fireBtn.addEventListener('click', () => {
      const id = this.tools.selectedStaffId;
      if (id !== null) fireStaff(this.world, id);
      this.tools.selectedStaffId = null;
    });
    this.root.append(this.fireBtn);
    document.body.append(this.root);
  }

  update(): void {
    const id = this.tools.selectedStaffId;
    const s = id !== null ? this.world.staff.find((x) => x.id === id) : undefined;
    if (!s) {
      if (id !== null) this.tools.selectedStaffId = null; // 해고되었거나 불러오기로 사라진 직원
      if (!this.root.hidden) this.root.hidden = true;
      return;
    }
    if (this.root.hidden) this.root.hidden = false;
    setText(this.title, `${STAFF_NAME[s.kind]} #${s.id}`);
    setText(this.state, STAFF_STATE_TEXT[s.state]);
    setText(this.wage, `${won(WAGE)} / 일`);
  }
}
