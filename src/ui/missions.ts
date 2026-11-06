import { ACTIVE_SLOTS, activeMissions, MISSIONS } from '../sim/missions';
import type { World } from '../sim/world';
import { won } from './hud';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const setText = (el: HTMLElement, t: string): void => { if (el.textContent !== t) el.textContent = t; };
const num = (n: number): string => n.toLocaleString('ko-KR');

interface Row { li: HTMLLIElement; title: HTMLElement; bar: HTMLElement; count: HTMLElement; reward: HTMLElement }

/** 보너스 미션 카드: 진행 중인 미션과 진행도, 상금. HUD의 `미션` 버튼으로 연다. */
export class MissionPanel {
  private root = $('missions');
  private count = $('m-count');
  private done = $('m-done');
  private btn = $('missions-btn');
  private rows: Row[] = [];

  constructor(private world: World) {
    const list = $('m-list');
    for (let i = 0; i < ACTIVE_SLOTS; i++) {
      const li = document.createElement('li');
      const title = document.createElement('b');
      const barWrap = document.createElement('div');
      barWrap.className = 'm-bar';
      const bar = document.createElement('i');
      barWrap.append(bar);
      const meta = document.createElement('div');
      meta.className = 'm-meta';
      const count = document.createElement('span');
      const reward = document.createElement('span');
      reward.className = 'm-reward';
      meta.append(count, reward);
      li.append(title, barWrap, meta);
      list.append(li);
      this.rows.push({ li, title, bar, count, reward });
    }
    $('m-close').addEventListener('click', () => this.toggle(false));
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(open = this.root.hidden): void {
    this.root.hidden = !open;
  }

  update(): void {
    const w = this.world;
    const total = MISSIONS.length;
    const doneCount = w.missions.completed.length;
    setText(this.btn, `미션 ${doneCount}/${total}`);
    if (this.root.hidden) return;

    setText(this.count, `${doneCount}/${total}`);
    const active = activeMissions(w);
    this.rows.forEach((r, i) => {
      const m = active[i];
      r.li.hidden = !m;
      if (!m) return;
      const p = Math.min(m.target, m.progress(w));
      setText(r.title, m.title);
      const pct = `${Math.round((p / m.target) * 100)}%`;
      if (r.bar.style.width !== pct) r.bar.style.width = pct;
      setText(r.count, `${num(p)} / ${num(m.target)}${m.unit}`);
      setText(r.reward, `상금 ${won(m.reward)}`);
    });
    setText(this.done, active.length === 0 ? '🎉 모든 미션을 달성했어요!' : `달성한 미션 ${doneCount}개 · 하나를 깨면 다음 미션이 열려요`);
  }
}
