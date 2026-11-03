import type { ToolController } from '../input/tools';
import type { TestRun } from '../render/testrun';
import {
  MAX_HEIGHT, MAX_PIECES, PIECE_COST, stationTiles, TRACK_LABEL, TRACK_TYPES, type TrackType,
} from '../sim/coaster';
import { canAppendPiece } from '../sim/trackedit';
import type { World } from '../sim/world';
import { won } from './hud';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const setText = (el: HTMLElement, t: string): void => { if (el.textContent !== t) el.textContent = t; };

/** 팔레트 버튼에 표시하는 단축키(키 바인딩은 main.ts) */
export const TRACK_KEY_HINT: Record<TrackType, string> = {
  straight: '↑', left: '←', right: '→', up: 'PgUp', down: 'PgDn', lift: 'C', brake: 'B', loop: 'L',
};

/** 롤러코스터 트랙 편집 바: 조각 팔레트, 되돌리기, 실시간 스탯과 오류 */
export class TrackEditor {
  private root = $('track-bar');
  private info = $('t-info');
  private stats = $('t-stats');
  private msg = $('t-msg');
  private pieceBtns = new Map<TrackType, HTMLButtonElement>();
  private undoBtn: HTMLButtonElement;

  constructor(private world: World, private tools: ToolController, private testRun: TestRun) {
    const row = $('t-buttons');
    for (const type of TRACK_TYPES) {
      const b = document.createElement('button');
      b.innerHTML = `<span>${TRACK_LABEL[type]}</span><small>${TRACK_KEY_HINT[type]} · ${won(PIECE_COST[type])}</small>`;
      b.addEventListener('click', () => { b.blur(); this.tools.placeTrackPiece(type); });
      this.pieceBtns.set(type, b);
      row.append(b);
    }
    this.undoBtn = this.action(row, '되돌리기', 'Backspace', () => this.tools.undoTrackPiece());
    this.action(row, '전부 지우기', '', () => this.tools.clearTrackPieces());
    this.action(row, '시운전', '', () => {
      const b = this.tools.trackBuilding;
      if (b && this.testRun.start(b)) this.tools.notify(this.testRun.result);
      else this.tools.notify('시운전할 트랙이 없습니다');
    });
    const done = this.action(row, '편집 종료', 'Enter/Esc', () => this.tools.endTrackEdit());
    done.classList.add('primary');
  }

  private action(row: HTMLElement, label: string, hint: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.innerHTML = `<span>${label}</span>${hint ? `<small>${hint}</small>` : ''}`;
    b.addEventListener('click', () => { b.blur(); fn(); });
    row.append(b);
    return b;
  }

  update(): void {
    const b = this.tools.trackBuilding;
    const t = b?.track;
    if (!b || !t) {
      if (!this.root.hidden) this.root.hidden = true;
      return;
    }
    if (this.root.hidden) this.root.hidden = false;

    for (const [type, btn] of this.pieceBtns) btn.disabled = !canAppendPiece(this.world, b, type).ok;
    this.undoBtn.disabled = t.pieces.length === 0;

    setText(this.info, `조각 ${t.pieces.length}/${MAX_PIECES} · 현재 높이 ${t.cursor.h}/${MAX_HEIGHT} · 쓴 돈 ${won(t.spent)}`);
    const s = t.stats;
    setText(
      this.stats,
      s ? `재미 ${s.fun} · 강도 ${s.intensity} · 멀미 ${s.nausea} · 최고 ${s.maxSpeed}km/h · 낙차 ${s.maxDrop} · 한 바퀴 ${(s.duration / 10).toFixed(0)}초${s.loops ? ` · 루프 ${s.loops}` : ''}` : '조각을 이어 붙이면 재미·강도·멀미가 계산됩니다',
    );

    let text: string;
    let bad = false;
    if (t.error) {
      text = t.error;
      bad = true;
    } else {
      const s0 = stationTiles(b)[0];
      const dist = Math.abs(t.cursor.x - s0.x) + Math.abs(t.cursor.y - s0.y);
      text = `역의 시작 칸까지 ${dist}칸 — 높이 0에서 같은 방향으로 들어와야 완성됩니다 (흰 화살표 = 다음 조각 위치)`;
    }
    setText(this.msg, text);
    this.msg.dataset.bad = bad ? '1' : '0';
  }
}
