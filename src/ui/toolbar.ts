import { RIDES, SHOPS } from '../data';
import { SCENERY, type SceneryDef } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import type { Tool, ToolController } from '../input/tools';
import { PATH_COST } from '../sim/building';
import { won } from './hud';
import { buildingIcon, demolishIcon, pathIcon, sceneryIcon } from './icons';

export class Toolbar {
  private buttons = new Map<string, HTMLButtonElement>();
  private activeKey = '';
  private hintKey: string | null = null;

  constructor(private root: HTMLElement, private tools: ToolController) {
    this.group('기본', [
      this.button('path', '길', PATH_COST, { kind: 'path' }, pathIcon()),
      this.button('demolish', '철거', undefined, { kind: 'demolish' }, demolishIcon()),
    ]);
    this.group('놀이기구', RIDES.map((d) => this.defButton(d)));
    this.group('매점', SHOPS.map((d) => this.defButton(d)));
    this.group('장식', SCENERY.map((d) => this.sceneryButton(d)));
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
