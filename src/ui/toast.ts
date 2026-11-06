/**
 * 큰 알림(토스트): 이벤트·미션 달성·VIP처럼 놓치면 안 되는 소식을 화면 위쪽 가운데에 카드로 띄운다.
 * 아이콘·색(종류별)·나타나는 애니메이션·남은 시간 막대가 있고, × 버튼으로 바로 닫는다. 최대 MAX_TOASTS개를 쌓는다.
 * 카드 자체는 클릭을 통과시켜, 알림이 떠 있어도 그 아래 공원을 누를 수 있다.
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
    const x = document.createElement('button');
    x.className = 't-close';
    x.textContent = '×';
    x.title = '닫기';
    x.addEventListener('click', () => this.dismiss(el));
    el.append(i, body, bar, x);
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

// ---------------------------------------------------------------- 실패 말풍선

/** 마지막으로 누르거나 움직인 포인터 위치(화면 좌표). 실패 말풍선을 그 자리에 띄운다 */
let pointer: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  const track = (e: PointerEvent): void => { pointer = { x: e.clientX, y: e.clientY }; };
  window.addEventListener('pointerdown', track, { capture: true, passive: true });
  window.addEventListener('pointermove', track, { capture: true, passive: true });
}

const FLOAT_MS = 1600;

/** 방금 누른 자리(포인터 위치)에서 빨간 말풍선이 떠올랐다 사라진다. 포인터 위치를 모르면 화면 가운데 */
export function floatError(text: string): void {
  const el = document.createElement('div');
  el.className = 'float-err';
  el.textContent = (text.includes('돈') ? '💸 ' : '⛔ ') + text;
  const x = pointer?.x ?? window.innerWidth / 2;
  const y = pointer?.y ?? window.innerHeight / 2;
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  document.body.append(el);
  // 화면 밖으로 나가지 않게 가로 위치를 보정
  const r = el.getBoundingClientRect();
  const over = r.right - (window.innerWidth - 8);
  if (over > 0) el.style.left = `${Math.round(x - over)}px`;
  else if (r.left < 8) el.style.left = `${Math.round(x + (8 - r.left))}px`;
  setTimeout(() => el.remove(), FLOAT_MS);
}
