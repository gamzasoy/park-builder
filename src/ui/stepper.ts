/** 입력창 대신 쓰는 숫자 조절 버튼 묶음: « ‹ [값] › » (큰 단계 / 작은 단계). 입력창은 WASD·숫자 단축키와 충돌한다. */
export class Stepper {
  readonly el = document.createElement('span');
  private value = document.createElement('b');

  constructor(small: number, large: number, onChange: (delta: number) => void) {
    this.el.className = 'stepper';
    const btn = (label: string, delta: number): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { b.blur(); onChange(delta); });
      return b;
    };
    this.el.append(btn('«', -large), btn('‹', -small), this.value, btn('›', small), btn('»', large));
  }

  set text(t: string) {
    if (this.value.textContent !== t) this.value.textContent = t;
  }
}
