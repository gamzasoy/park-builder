import type { BuildingDef } from '../data/types';
import { guestDisplayPos } from '../render/guestpos';
import type { Vec2 } from '../render/iso';
import {
  anchorFor, buildingAt, canPlaceBuilding, demolishAt, entranceOf, footprintAt,
  isPathPlaceable, lineTiles, PATH_COST, placeBuilding, placePaths, type PlaceFailure,
} from '../sim/building';
import type { Tile } from '../sim/map';
import type { World } from '../sim/world';

export type Tool =
  | { kind: 'none' }
  | { kind: 'path' }
  | { kind: 'build'; def: BuildingDef }
  | { kind: 'demolish' };

/** 효과음 등 부가 반응을 위한 이벤트 */
export type ToolEvent = 'build' | 'path' | 'demolish' | 'error';

/** 손님 클릭 선택 반경(타일). 렌더 오프셋과 틱 사이 보간을 고려해 넉넉하게. */
export const GUEST_PICK_RADIUS = 0.6;

export interface PreviewTile extends Tile { ok: boolean }
export interface Preview { tiles: PreviewTile[]; entrance?: Tile }

const FAIL_TEXT: Record<PlaceFailure, string> = {
  bounds: '맵 밖에는 지을 수 없습니다',
  occupied: '이미 건물이 있습니다',
  path: '길 위에는 지을 수 없습니다',
  money: '돈이 부족합니다',
};

export class ToolController {
  tool: Tool = { kind: 'none' };
  rot = 0;
  /** 선택(정보 패널)된 건물 id — 도구가 없을 때 건물을 클릭하면 선택 */
  selectedId: number | null = null;
  /** 선택된 손님 id (건물 선택과 동시에 선택되지 않음) */
  selectedGuestId: number | null = null;
  onEvent?: (e: ToolEvent) => void;
  message = '';
  messageUntil = 0;
  private dragStart: Tile | null = null;

  constructor(private world: World) {}

  /** 툴바 하이라이트 동기화용 키 */
  get toolKey(): string {
    const t = this.tool;
    return t.kind === 'build' ? `build:${t.def.id}` : t.kind;
  }

  /** 새 게임/불러오기 후 선택·도구 상태 초기화 */
  reset(): void {
    this.tool = { kind: 'none' };
    this.selectedId = null;
    this.selectedGuestId = null;
    this.rot = 0;
    this.dragStart = null;
    this.message = '';
    this.messageUntil = 0;
  }

  setTool(t: Tool): void {
    this.tool = t;
    if (t.kind !== 'none') {
      this.selectedId = null;
      this.selectedGuestId = null;
    }
    this.dragStart = null;
  }

  rotate(): void {
    this.rot = (this.rot + 1) % 4;
  }

  /** Esc: 진행 중인 드래그 취소 → 도구 해제 → 선택 해제 */
  cancel(): void {
    if (this.dragStart) this.dragStart = null;
    else if (this.tool.kind !== 'none') this.tool = { kind: 'none' };
    else {
      this.selectedId = null;
      this.selectedGuestId = null;
    }
  }

  notify(msg: string): void {
    this.message = msg;
    this.messageUntil = performance.now() + 2500;
  }

  /** 손님은 건물 앞에 그려지므로 클릭 반경 안에 있으면 건물보다 우선한다. 시설 안(숨김)의 손님은 제외. */
  private guestNear(pos: Vec2): number | null {
    let best: number | null = null;
    let bestD = GUEST_PICK_RADIUS * GUEST_PICK_RADIUS;
    for (const g of this.world.guests) {
      if (g.state === 'visiting' || g.state === 'gone') continue;
      const p = guestDisplayPos(g, 1);
      const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = g.id;
      }
    }
    return best;
  }

  onDown(t: Tile | null, pos: Vec2 | null = null): void {
    if (!t) return;
    const tool = this.tool;
    if (tool.kind === 'none') {
      const gid = pos ? this.guestNear(pos) : null;
      this.selectedGuestId = gid;
      this.selectedId = gid === null ? (buildingAt(this.world, t.x, t.y)?.id ?? null) : null;
    } else if (tool.kind === 'path') {
      this.dragStart = t;
    } else if (tool.kind === 'build') {
      const a = anchorFor(tool.def, this.rot, t);
      const check = canPlaceBuilding(this.world, tool.def, a.x, a.y, this.rot);
      if (check.ok) {
        placeBuilding(this.world, tool.def, a.x, a.y, this.rot);
        this.onEvent?.('build');
      } else {
        this.notify(FAIL_TEXT[check.reason]);
        this.onEvent?.('error');
      }
    } else if (tool.kind === 'demolish') {
      if (demolishAt(this.world, t.x, t.y) === null) {
        this.notify('철거할 대상이 없습니다');
        this.onEvent?.('error');
      } else {
        this.onEvent?.('demolish');
      }
    }
  }

  onUp(t: Tile | null): void {
    const start = this.dragStart;
    this.dragStart = null;
    if (this.tool.kind !== 'path' || !start || !t) return;
    const { placed, short } = placePaths(this.world, lineTiles(start, t));
    if (short) this.notify('돈이 부족합니다');
    else if (placed === 0) this.notify('길을 깔 수 없는 위치입니다');
    this.onEvent?.(short || placed === 0 ? 'error' : 'path');
  }

  preview(hover: Tile | null): Preview | null {
    if (!hover) return null;
    const tool = this.tool;
    const map = this.world.map;

    if (tool.kind === 'path') {
      const line = this.dragStart ? lineTiles(this.dragStart, hover) : [hover];
      let afford = Math.floor(this.world.money / PATH_COST);
      const tiles = line
        .filter((t) => map.inBounds(t.x, t.y))
        .map((t) => {
          const ok = isPathPlaceable(this.world, t.x, t.y) && afford > 0;
          if (ok) afford--;
          return { ...t, ok };
        });
      return { tiles };
    }

    if (tool.kind === 'build') {
      const a = anchorFor(tool.def, this.rot, hover);
      const f = footprintAt(tool.def, a.x, a.y, this.rot);
      const ok = canPlaceBuilding(this.world, tool.def, a.x, a.y, this.rot).ok;
      const tiles: PreviewTile[] = [];
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) if (map.inBounds(x, y)) tiles.push({ x, y, ok });
      }
      return { tiles, entrance: entranceOf(f, this.rot) };
    }

    if (tool.kind === 'demolish') {
      const b = buildingAt(this.world, hover.x, hover.y);
      if (b) {
        const tiles: PreviewTile[] = [];
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) tiles.push({ x, y, ok: false });
        return { tiles };
      }
      if (map.isPath(hover.x, hover.y) && !map.isGate(hover.x, hover.y)) {
        return { tiles: [{ ...hover, ok: false }] };
      }
    }
    return null;
  }
}
