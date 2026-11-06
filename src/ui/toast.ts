/**
 * 큰 알림(토스트): 이벤트·미션 달성·VIP처럼 놓치면 안 되는 소식을 화면 위쪽 가운데에 카드로 띄운다.
 * 아이콘·색(종류별)·나타나는 애니메이션·남은 시간 막대가 있고, 누르면 바로 닫힌다. 최대 MAX_TOASTS개를 쌓는다.
 * 짧은 조작 안내(회전, 돈 부족 등)는 여기가 아니라 왼쪽 위 노란 쪽지(tools.notify)를 쓴다.
 */
export type ToastTone = 'event' | 'good' | 'bad' | 'info';

const MAX_TOASTS = 3;
const SHOW_MS = 5500;
const LEAVE_MS = 300;

export class Toasts {
  private root: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'toasts';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    document.body.append(this.root);
  }

  /** icon은 메시지 앞에 크게 보이는 이모지, title은 굵은 첫 줄, text는 설명 */
  show(icon: string, title: string, text = '', tone: ToastTone = 'event'): void {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    const i = document.createElement('span');
    i.className = 't-icon';
    i.textContent = icon;
    const body = document.createElement('div');
    body.className = 't-body';
    const b = document.createElement('b');
    b.textContent = title;
    body.append(b);
    if (text) {
      const p = document.createElement('span');
      p.textContent = text;
      body.append(p);
    }
    const bar = document.createElement('i');
    bar.className = 't-bar';
    bar.style.animationDuration = `${SHOW_MS}ms`;
    el.append(i, body, bar);
    el.addEventListener('click', () => this.dismiss(el));
    this.root.prepend(el);
    while (this.root.children.length > MAX_TOASTS) this.root.lastElementChild!.remove();
    setTimeout(() => this.dismiss(el), SHOW_MS);
  }

  private dismiss(el: HTMLElement): void {
    if (!el.isConnected || el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), LEAVE_MS);
  }
}
