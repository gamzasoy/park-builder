export interface ModalButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface ModalContent {
  title: string;
  message?: string;
  rows?: [string, string][];
  /** 글자 입력칸(공원 이름 등). 버튼의 onClick에서 modal.inputValue로 읽는다 */
  input?: { value: string; maxLength: number; placeholder?: string; onEnter?: () => void };
  buttons: ModalButton[];
}

/** 화면 가운데 대화상자 하나를 재사용한다. 결과 화면과 확인창에 쓴다. */
export class Modal {
  private root = document.getElementById('modal')!;
  private title = document.getElementById('m-title')!;
  private message = document.getElementById('m-msg')!;
  private rows = document.getElementById('m-rows')!;
  private buttons = document.getElementById('m-buttons')!;
  private input = document.getElementById('m-input') as HTMLInputElement;
  private onEnter: (() => void) | undefined;
  /** 현재 표시 중인 대화상자의 종류(같은 종류를 중복해서 열지 않기 위한 표식) */
  kind = '';

  get inputValue(): string {
    return this.input.value;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(kind: string, c: ModalContent): void {
    this.kind = kind;
    this.title.textContent = c.title;
    this.message.textContent = c.message ?? '';
    this.message.hidden = !c.message;
    this.rows.replaceChildren(
      ...(c.rows ?? []).map(([k, v]) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        const td = document.createElement('td');
        th.textContent = k;
        td.textContent = v;
        tr.append(th, td);
        return tr;
      }),
    );
    this.buttons.replaceChildren(
      ...c.buttons.map((b) => {
        const el = document.createElement('button');
        el.textContent = b.label;
        el.className = b.primary ? 'primary' : '';
        el.addEventListener('click', () => { el.blur(); b.onClick(); });
        return el;
      }),
    );
    this.input.hidden = !c.input;
    this.onEnter = c.input?.onEnter;
    if (c.input) {
      this.input.value = c.input.value;
      this.input.maxLength = c.input.maxLength;
      this.input.placeholder = c.input.placeholder ?? '';
    }
    this.root.hidden = false;
    if (c.input) this.input.focus();
  }

  /** 입력칸에서 Enter를 누르면 기본 동작 실행 */
  bindInput(): void {
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onEnter?.();
      if (e.key === 'Escape') this.hide();
    });
  }

  hide(): void {
    this.root.hidden = true;
    this.kind = '';
  }
}
