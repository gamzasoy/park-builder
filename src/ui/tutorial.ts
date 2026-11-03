import { defaultStorage } from '../save/save';
import { basicsDone, currentStep, STEPS } from '../sim/tutorial';
import type { World } from '../sim/world';
import type { Toolbar } from './toolbar';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const setText = (el: HTMLElement, t: string): void => { if (el.textContent !== t) el.textContent = t; };

const PREF_KEY = 'park-builder-tutorial';
/** 기본 과정을 마친 뒤 카드가 저절로 사라지기까지(ms) */
const CELEBRATE_MS = 8000;

interface Prefs { collapsed: boolean; hidden: boolean }

/** 시작 가이드 카드: 단계 체크리스트, 현재 단계 설명, 해당 툴바 버튼 깜빡임 */
export class TutorialPanel {
  private root = $('tutorial');
  private count = $('tu-count');
  private body = $('tu-body');
  private text = $('tu-text');
  private foldBtn = $<HTMLButtonElement>('tu-fold');
  private items = new Map<string, HTMLLIElement>();
  private prefs: Prefs;
  private wasDone: boolean;
  private celebrateUntil = 0;

  constructor(private world: World, private toolbar: Toolbar) {
    const list = $('tu-list');
    for (const s of STEPS) {
      const li = document.createElement('li');
      li.textContent = s.title;
      this.items.set(s.id, li);
      list.append(li);
    }

    this.prefs = this.loadPrefs();
    // 이미 끝낸 공원을 불러왔다면 카드를 열지 않는다(축하도 하지 않는다)
    this.wasDone = basicsDone(world);
    if (this.wasDone) this.prefs.hidden = true;

    this.foldBtn.addEventListener('click', () => { this.prefs.collapsed = !this.prefs.collapsed; this.savePrefs(); });
    $('tu-close').addEventListener('click', () => { this.prefs.hidden = true; this.celebrateUntil = 0; this.savePrefs(); });
    $('help-btn').addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.toggle();
    });
  }

  /** 새 게임: 처음부터 다시 안내 */
  reset(): void {
    this.prefs.hidden = false;
    this.wasDone = false;
    this.celebrateUntil = 0;
    this.savePrefs();
  }

  toggle(): void {
    this.prefs.hidden = !this.prefs.hidden;
    if (!this.prefs.hidden) this.prefs.collapsed = false;
    this.celebrateUntil = 0;
    this.savePrefs();
  }

  update(): void {
    const w = this.world;
    const nowDone = basicsDone(w);
    if (nowDone && !this.wasDone) {
      // 이번 세션에서 막 기본 과정을 마쳤다: 축하하고 잠시 뒤 숨긴다
      this.celebrateUntil = performance.now() + CELEBRATE_MS;
      this.prefs.hidden = false;
      this.prefs.collapsed = false;
    }
    this.wasDone = nowDone;
    if (this.celebrateUntil && performance.now() > this.celebrateUntil) {
      this.celebrateUntil = 0;
      this.prefs.hidden = true;
      this.savePrefs();
    }

    const step = currentStep(w);
    this.toolbar.setHint(!this.prefs.hidden && step && !nowDone ? step.tool ?? null : null);
    // 선택 과제는 기본 과정 후에도 툴바 힌트가 필요 없다(카드를 다시 열었을 때만 안내)

    if (this.root.hidden !== this.prefs.hidden) this.root.hidden = this.prefs.hidden;
    if (this.prefs.hidden) return;

    const required = STEPS.filter((s) => !s.optional);
    const doneCount = required.filter((s) => w.tutorial.completed.includes(s.id)).length;
    setText(this.count, `${doneCount}/${required.length}`);
    for (const s of STEPS) {
      const li = this.items.get(s.id)!;
      const isDone = w.tutorial.completed.includes(s.id);
      li.classList.toggle('done', isDone);
      li.classList.toggle('current', step?.id === s.id);
    }
    this.body.hidden = this.prefs.collapsed;
    setText(this.foldBtn, this.prefs.collapsed ? '▸' : '▾');

    if (this.celebrateUntil) setText(this.text, '🎉 기본 과정을 마쳤어요! 이제 공원을 키워 목표를 달성해 보세요.');
    else if (step) setText(this.text, step.text);
    else setText(this.text, '모든 안내를 마쳤어요. 멋진 공원을 만들어 주세요!');
  }

  private loadPrefs(): Prefs {
    try {
      const raw = defaultStorage()?.getItem(PREF_KEY);
      const o = raw ? JSON.parse(raw) : null;
      return { collapsed: o?.collapsed === true, hidden: o?.hidden === true };
    } catch {
      return { collapsed: false, hidden: false };
    }
  }

  private savePrefs(): void {
    try { defaultStorage()?.setItem(PREF_KEY, JSON.stringify(this.prefs)); } catch { /* 저장소 사용 불가는 무시 */ }
  }
}
