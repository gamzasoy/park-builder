import { RIDES, SHOPS } from '../data';
import { SCENERY, type SceneryDef } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import type { Tool, ToolController } from '../input/tools';
import { PATH_COST } from '../sim/building';
import { WAGE } from '../sim/economy';
import { FIREWORKS_COST } from '../sim/events';
import { PARADE_COST } from '../sim/parade';
import { FESTIVAL_COST, FESTIVAL_DAYS, FESTIVALS } from '../sim/festival';
import type { Season } from '../sim/season';
import { STAFF_KINDS, STAFF_NAME, type StaffKind } from '../sim/staff';

/** 툴바가 한 화면 폭에 들어가도록 버튼에는 짧은 이름을 쓴다(전체 이름은 툴팁) */
/** 이름이 긴 건물은 툴바에서 짧게 부른다(전체 이름은 툴팁) */
const SHORT_LABEL: Record<string, string> = { slide: '미끄럼틀' };
const STAFF_LABEL: Record<StaffKind, string> = { janitor: '청소부', mechanic: '정비공', entertainer: '인형탈', vendor: '판매원', security: '경비원' };
import { won } from './hud';
import { buildingIcon, demolishIcon, festivalIcon, fireworksIcon, paradeIcon, pathIcon, photoIcon, sceneryIcon, staffIcon, terrainIcon } from './icons';
import { TERRAIN_COST } from '../sim/terrain';

/** 휴대폰 화면의 그룹 탭에 붙는 아이콘 */
const GROUP_ICON: Record<string, string> = {
  기본: '🛤️', 놀이기구: '🎡', '직원 고용': '👷', 공연: '🎆', 매점: '🍔', 장식: '🌳', 지형: '⛰️', 특별: '📷',
};
const OPEN_GROUP_KEY = 'park-builder:toolbar-group';

/**
 * 아래 도구 막대. PC에서는 그룹을 모두 펼쳐 보여 주고, 휴대폰 가로 화면(CSS)에서는 맨 위의 그룹 탭으로
 * 한 그룹만 펼쳐 보여 준다(옆으로 길게 넘기지 않아도 되게).
 */
export class Toolbar {
  private buttons = new Map<string, HTMLButtonElement>();
  /** 휴대폰 화면의 그룹 탭과 그룹(같은 순서), 그룹마다 담긴 버튼 키 */
  private tabs: HTMLButtonElement[] = [];
  private groups: HTMLElement[] = [];
  private groupKeys: string[][] = [];
  private tabBar = document.createElement('div');
  private open = 0;
  private activeKey = '';
  private hintKey: string | null = null;

  constructor(
    private root: HTMLElement,
    private tools: ToolController,
    onHire: (kind: StaffKind) => void,
    onFireworks: () => void,
    onPhoto: () => void,
    onParade: () => void,
    onFestival: () => void,
  ) {
    this.tabBar.className = 'tb-tabs';
    this.root.append(this.tabBar);
    try { this.open = Number(localStorage.getItem(OPEN_GROUP_KEY) ?? 0) || 0; } catch { /* 저장소 사용 불가 */ }
    this.group('기본', [
      this.button('path', '길', PATH_COST, { kind: 'path' }, pathIcon()),
      this.button('demolish', '철거', undefined, { kind: 'demolish' }, demolishIcon()),
    ]);
    this.group('놀이기구', RIDES.map((d) => this.defButton(d)));
    // 직원은 놀이기구 줄의 남는 자리에 둬서 넓은 화면에서 툴바가 두 줄을 넘지 않게 한다
    this.group('직원 고용', STAFF_KINDS.map((k) => this.hireButton(k, STAFF_LABEL[k], onHire)));
    // 공연도 첫째 줄 남는 자리에 둔다(넓은 화면에서 툴바가 두 줄을 넘지 않게)
    this.group('공연', [
      this.actionButton('fireworks', '불꽃놀이', `불꽃놀이 (${won(FIREWORKS_COST)}, 하루 한 번, 밤엔 효과 2배)`, won(FIREWORKS_COST), fireworksIcon(), onFireworks),
      this.actionButton('parade', '퍼레이드', `퍼레이드 (${won(PARADE_COST)}, 하루 한 번): 인형탈과 꽃차가 길을 따라 행진하고, 지나가는 곳의 손님 기분이 오릅니다`, won(PARADE_COST), paradeIcon(), onParade),
    ]);
    this.group('매점', SHOPS.map((d) => this.defButton(d)));
    this.group('장식', SCENERY.map((d) => this.sceneryButton(d)));
    this.group('지형', [
      this.button('terrain:raise', '지형 올리기', TERRAIN_COST, { kind: 'terrain', mode: 'raise' }, terrainIcon('raise')),
      this.button('terrain:lower', '지형 내리기', TERRAIN_COST, { kind: 'terrain', mode: 'lower' }, terrainIcon('lower')),
    ]);
    // 둘째 줄 끝(지형 뒤)에 둬서 넓은 화면에서 툴바가 두 줄을 넘지 않게 한다
    this.group('특별', [
      this.actionButton('festival', '축제', '', won(FESTIVAL_COST), festivalIcon('spring'), onFestival),
      this.actionButton('photo', '기념사진', '기념사진: 지금 공원 모습을 이미지로 저장 (P)', '무료', photoIcon(), onPhoto),
    ]);
    this.openGroup(this.open);
  }

  /** 축제 버튼을 지금 계절의 축제로 맞춘다(계절이 바뀔 때만 다시 그린다) */
  private festivalSeason: Season | null = null;
  setFestival(season: Season): void {
    if (season === this.festivalSeason) return;
    this.festivalSeason = season;
    const b = this.buttons.get('festival');
    if (!b) return;
    const f = FESTIVALS[season];
    b.title = `${f.icon} ${f.name} (${won(FESTIVAL_COST)}, 계절마다 한 번, ${FESTIVAL_DAYS}일 동안): 길가에 축제 장식이 서고 손님이 더 몰려오며 모두의 기분이 올라요 · ${f.perk}`;
    const img = b.querySelector('img');
    const icon = festivalIcon(season);
    if (img && icon) img.src = icon;
    const label = b.querySelector('span');
    if (label) label.textContent = f.short;
  }

  /** 매 프레임 호출: 선택된 도구(Esc 해제 포함)에 맞춰 하이라이트 갱신 */
  sync(): void {
    const key = this.tools.toolKey;
    if (key === this.activeKey) return;
    this.buttons.get(this.activeKey)?.classList.remove('active');
    this.buttons.get(key)?.classList.add('active');
    this.activeKey = key;
  }

  /** 초반 안내: 누를 버튼을 깜빡여 알려 준다(null이면 해제). 휴대폰에서 접힌 그룹이면 그 그룹 탭도 깜빡인다 */
  setHint(key: string | null): void {
    if (key === this.hintKey) return;
    if (this.hintKey) this.buttons.get(this.hintKey)?.classList.remove('hint');
    if (key) this.buttons.get(key)?.classList.add('hint');
    this.hintKey = key;
    this.syncTabHint();
  }

  /** 휴대폰 화면에서 i번째 그룹만 펼친다(PC에서는 모든 그룹이 보여 겉보기 변화가 없다) */
  openGroup(i: number): void {
    this.open = Math.max(0, Math.min(this.groups.length - 1, i));
    this.groups.forEach((g, j) => g.classList.toggle('open', j === this.open));
    this.tabs.forEach((t, j) => {
      t.classList.toggle('active', j === this.open);
      t.setAttribute('aria-selected', String(j === this.open));
    });
    // 펼친 그룹은 처음부터 보이게
    this.groups[this.open]?.scrollTo?.({ left: 0 });
    try { localStorage.setItem(OPEN_GROUP_KEY, String(this.open)); } catch { /* 무시 */ }
    this.syncTabHint();
  }

  private syncTabHint(): void {
    const g = this.hintKey ? this.groupKeys.findIndex((keys) => keys.includes(this.hintKey!)) : -1;
    this.tabs.forEach((t, j) => t.classList.toggle('hint', j === g && j !== this.open));
  }

  private defButton(d: BuildingDef): HTMLButtonElement {
    const b = this.button(`build:${d.id}`, SHORT_LABEL[d.id] ?? d.name, d.cost, { kind: 'build', def: d }, buildingIcon(d.id));
    b.title = `${d.name} (${won(d.cost)})`;
    return b;
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
    const i = this.groups.length;
    const tab = document.createElement('button');
    tab.className = 'tb-tab';
    tab.dataset.group = String(i);
    tab.setAttribute('role', 'tab');
    tab.textContent = `${GROUP_ICON[title] ?? ''} ${title}`.trim();
    tab.addEventListener('click', () => {
      tab.blur();
      this.openGroup(i);
    });
    this.tabBar.append(tab);
    this.tabs.push(tab);
    this.groupKeys.push(items.map((b) => b.dataset.tool ?? ''));

    const g = document.createElement('div');
    g.className = 'group';
    g.dataset.group = String(i);
    this.groups.push(g);
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
