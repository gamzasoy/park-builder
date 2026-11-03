export interface ModalButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface ModalContent {
  title: string;
  message?: string;
  rows?: [string, string][];
  buttons: ModalButton[];
}

/** 화면 가운데 대화상자 하나를 재사용한다. 결과 화면과 확인창에 쓴다. */
export class Modal {
  private root = document.getElementById('modal')!;
  private title = document.getElementById('m-title')!;
  private message = document.getElementById('m-msg')!;
  private rows = document.getElementById('m-rows')!;
  private buttons = document.getElementById('m-buttons')!;
  /** 현재 표시 중인 대화상자의 종류(같은 종류를 중복해서 열지 않기 위한 표식) */
  kind = '';

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
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.kind = '';
  }
}
