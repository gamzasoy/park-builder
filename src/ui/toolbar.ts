import { RIDES, SHOPS } from '../data';
import { SCENERY, type SceneryDef } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import type { Tool, ToolController } from '../input/tools';
import { PATH_COST } from '../sim/building';
import { WAGE } from '../sim/economy';
import { FIREWORKS_COST } from '../sim/events';
import { STAFF_KINDS, STAFF_NAME, type StaffKind } from '../sim/staff';

/** 툴바가 한 화면 폭에 들어가도록 버튼에는 짧은 이름을 쓴다(전체 이름은 툴팁) */
const STAFF_LABEL: Record<StaffKind, string> = { janitor: '청소부', mechanic: '정비공', entertainer: '인형탈', vendor: '판매원' };
import { won } from './hud';
import { buildingIcon, demolishIcon, fireworksIcon, pathIcon, sceneryIcon, staffIcon, terrainIcon } from './icons';
import { TERRAIN_COST } from '../sim/terrain';

export class Toolbar {
  private buttons = new Map<string, HTMLButtonElement>();
  private activeKey = '';
  private hintKey: string | null = null;

  constructor(
    private root: HTMLElement,
    private tools: ToolController,
    onHire: (kind: StaffKind) => void,
    onFireworks: () => void,
  ) {
    this.group('기본', [
      this.button('path', '길', PATH_COST, { kind: 'path' }, pathIcon()),
      this.button('demolish', '철거', undefined, { kind: 'demolish' }, demolishIcon()),
    ]);
    this.group('놀이기구', RIDES.map((d) => this.defButton(d)));
    // 직원은 놀이기구 줄의 남는 자리에 둬서 넓은 화면에서 툴바가 두 줄을 넘지 않게 한다
    this.group('직원 고용', STAFF_KINDS.map((k) => this.hireButton(k, STAFF_LABEL[k], onHire)));
    this.group('공연', [this.actionButton('fireworks', '불꽃놀이', `불꽃놀이 (${won(FIREWORKS_COST)}, 하루 한 번)`, won(FIREWORKS_COST), fireworksIcon(), onFireworks)]);
    this.group('매점', SHOPS.map((d) => this.defButton(d)));
    this.group('장식', SCENERY.map((d) => this.sceneryButton(d)));
    this.group('지형', [
      this.button('terrain:raise', '지형 올리기', TERRAIN_COST, { kind: 'terrain', mode: 'raise' }, terrainIcon('raise')),
      this.button('terrain:lower', '지형 내리기', TERRAIN_COST, { kind: 'terrain', mode: 'lower' }, terrainIcon('lower')),
    ]);
  }

  /** 매 프레임 호출: 선택된 도구(Esc 해제 포함)에 맞춰 하이라이트 갱신 */
  sync(): void {
    const key = this.tools.toolKey;
    if (key === this.activeKey) return;
    this.buttons.get(this.activeKey)?.classList.remove('active');
    this.buttons.get(key)?.classList.add('active');
    this.activeKey = key;
  }

  /** 초반 안내: 누를 버튼을 깜빡여 알려 준다(null이면 해제) */
  setHint(key: string | null): void {
    if (key === this.hintKey) return;
    if (this.hintKey) this.buttons.get(this.hintKey)?.classList.remove('hint');
    if (key) this.buttons.get(key)?.classList.add('hint');
    this.hintKey = key;
  }

  private defButton(d: BuildingDef): HTMLButtonElement {
    return this.button(`build:${d.id}`, d.name, d.cost, { kind: 'build', def: d }, buildingIcon(d.id));
  }

  private sceneryButton(d: SceneryDef): HTMLButtonElement {
    return this.button(`scenery:${d.id}`, d.name, d.cost, { kind: 'scenery', def: d }, sceneryIcon(d));
  }

  /** 도구가 아니라 즉시 실행되는 버튼 */
  private actionButton(key: string, label: string, title: string, small: string, icon: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.dataset.tool = key;
    b.title = title;
    b.innerHTML = `<img src="${icon}" alt="" width="44" height="40"><span>${label}</span><small>${small}</small>`;
    b.addEventListener('click', () => {
      b.blur();
      run();
    });
    this.buttons.set(key, b);
    return b;
  }

  /** 도구가 아니라 즉시 실행되는 버튼: 눌러서 직원을 고용한다 */
  private hireButton(kind: StaffKind, label: string, onHire: (kind: StaffKind) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.dataset.tool = `hire:${kind}`;
    b.title = `${STAFF_NAME[kind]} 고용 (하루 급여 ${won(WAGE[kind])})`;
    b.innerHTML = `<img src="${staffIcon(kind)}" alt="" width="44" height="40"><span>${label}</span><small>${won(WAGE[kind])}/일</small>`;
    b.addEventListener('click', () => {
      b.blur();
      onHire(kind);
    });
    this.buttons.set(`hire:${kind}`, b);
    return b;
  }

  private button(key: string, label: string, cost: number | undefined, tool: Tool, icon = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.dataset.tool = key;
    b.title = cost !== undefined ? `${label} (${won(cost)})` : label;
    b.innerHTML =
      (icon ? `<img src="${icon}" alt="" width="44" height="40">` : '') +
      `<span>${label}</span>${cost !== undefined ? `<small>${won(cost)}</small>` : ''}`;
    b.addEventListener('click', () => {
      b.blur(); // Space 단축키(일시정지)가 버튼을 다시 누르지 않도록
      // 같은 도구를 다시 누르면 해제
      this.tools.setTool(this.tools.toolKey === key ? { kind: 'none' } : tool);
    });
    this.buttons.set(key, b);
    return b;
  }

  private group(title: string, items: HTMLButtonElement[]): void {
    const g = document.createElement('div');
    g.className = 'group';
    const h = document.createElement('div');
    h.className = 'title';
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'row';
    row.append(...items);
    g.append(h, row);
    this.root.append(g);
  }
}
