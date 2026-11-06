import type { SceneryDef } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import { guestDisplayPos, staffDisplayPos } from '../render/guestpos';
import type { Vec2 } from '../render/iso';
import {
  anchorFor, buildingAt, canMoveBuilding, canPlaceBuilding, demolishAt, entranceOf, footprintAt,
  isPathPlaceable, isSceneryPlaceable, lineTiles, moveBuilding, PATH_COST, placeBuilding, placePaths, placeScenery,
  relocated, type MoveFailure, type PlaceFailure,
} from '../sim/building';
import { paintTerrain, canChangeTerrain, TERRAIN_COST, type TerrainFailure, type TerrainMode } from '../sim/terrain';
import { buildingDef as getBuildingDef, buildingTiles, TRACK_TYPES, type Cursor, type TrackType } from '../sim/coaster';
import { MAX_TERRAIN, type Tile } from '../sim/map';
import { appendPiece, beginEdit, canAppendPiece, clearTrack, TRACK_FAIL_TEXT, undoPiece } from '../sim/trackedit';
import type { Building, World } from '../sim/world';
import { reuniteKid, type Guest } from '../sim/guest';

export type Tool =
  | { kind: 'none' }
  | { kind: 'path' }
  | { kind: 'build'; def: BuildingDef }
  | { kind: 'demolish' }
  /** 이미 지은 건물 옮기기: 미리보기를 따라 움직이다 누른 곳에 내려놓는다 */
  | { kind: 'move'; buildingId: number }
  /** 나무·꽃: 길처럼 드래그로 한 줄을 칠한다 */
  | { kind: 'scenery'; def: SceneryDef }
  /** 롤러코스터 트랙 편집: 조각 팔레트/단축키로 다음 조각을 잇는다 */
  | { kind: 'track'; buildingId: number }
  /** 지형 올리기/내리기: 클릭 또는 드래그(직선)로 칸마다 ±1단계 */
  | { kind: 'terrain'; mode: TerrainMode };

/** 효과음 등 부가 반응을 위한 이벤트 */
export type ToolEvent = 'build' | 'path' | 'demolish' | 'error' | 'chime' | 'pickup';

/** 손님 클릭 선택 반경(타일). 렌더 오프셋과 틱 사이 보간을 고려해 넉넉하게. */
export const GUEST_PICK_RADIUS = 0.6;

export interface PreviewTile extends Tile {
  ok: boolean;
  /** 지형 도구: 바뀐 뒤의 땅 높이. 있으면 그 높이의 평평한 칸으로 그린다 */
  level?: number;
}
export interface Preview {
  tiles: PreviewTile[];
  entrance?: Tile;
  /** 트랙 편집: 다음 조각이 놓일 위치·방향·높이 */
  cursor?: Cursor;
  /** 건물 설치: 반투명으로 미리 그릴 건물(회전 방향이 보이게) */
  ghost?: { defId: string; x: number; y: number; w: number; h: number; rot: number };
  /** 건물 설치: 입구 칸이 이미 길과 닿아 있는가 */
  entranceOnPath?: boolean;
}

/** 회전값별 입구 방향(화면 기준 화살표) */
export const ENTRANCE_DIR_TEXT = ['↙ 왼쪽 아래', '↘ 오른쪽 아래', '↗ 오른쪽 위', '↖ 왼쪽 위'];

const FAIL_TEXT: Record<PlaceFailure, string> = {
  bounds: '맵 밖에는 지을 수 없습니다',
  occupied: '이미 건물이 있습니다',
  path: '길 위에는 지을 수 없습니다',
  slope: '건물 자리와 입구 칸은 평평해야 합니다 (높이가 같아야 함)',
  money: '돈이 부족합니다',
};

/** 옮기기 실패: 건물 자리 이유 + (코스터) 트랙이 새 자리에 맞지 않는 이유 */
const MOVE_FAIL_TEXT: Record<MoveFailure, string> = {
  ...FAIL_TEXT,
  bounds: '맵 밖으로 나갑니다',
  occupied: '다른 건물·길·트랙과 겹칩니다',
  notrack: '옮길 수 없습니다',
  closed: '옮길 수 없습니다',
  max: '옮길 수 없습니다',
  height: '이 자리에서는 트랙이 너무 높거나 낮아집니다',
  underground: '트랙이 지형 아래로 파고듭니다',
  entrance: '트랙이 건물 입구를 막습니다',
};

const TERRAIN_FAIL_TEXT: Record<TerrainFailure, string> = {
  bounds: '맵 밖입니다',
  limit: '더 이상 올리거나 내릴 수 없습니다 (높이 0~4)',
  path: '길이 있는 칸은 지형을 바꿀 수 없습니다',
  occupied: '건물이나 트랙이 있는 칸은 지형을 바꿀 수 없습니다',
  entrance: '건물 입구 칸은 지형을 바꿀 수 없습니다',
  step: '이웃 칸과의 높이 차가 1단계를 넘을 수 없습니다',
  money: '돈이 부족합니다',
};

export class ToolController {
  tool: Tool = { kind: 'none' };
  rot = 0;
  /** 선택(정보 패널)된 건물 id — 도구가 없을 때 건물을 클릭하면 선택 */
  selectedId: number | null = null;
  /** 선택된 손님 id (건물 선택과 동시에 선택되지 않음) */
  selectedGuestId: number | null = null;
  /** 선택된 직원 id (건물·손님과 동시에 선택되지 않음) */
  selectedStaffId: number | null = null;
  onEvent?: (e: ToolEvent) => void;
  /** 도구 없이 공원 입구를 눌렀을 때(이름 짓기) */
  onGate?: () => void;
  message = '';
  messageUntil = 0;
  messageTone: 'info' | 'error' = 'info';
  private dragStart: Tile | null = null;

  constructor(private world: World) {}

  /** 툴바 하이라이트 동기화용 키 */
  get toolKey(): string {
    const t = this.tool;
    if (t.kind === 'build') return `build:${t.def.id}`;
    if (t.kind === 'scenery') return `scenery:${t.def.id}`;
    if (t.kind === 'terrain') return `terrain:${t.mode}`;
    return t.kind;
  }

  /** 새 게임/불러오기 후 선택·도구 상태 초기화 */
  reset(): void {
    this.tool = { kind: 'none' };
    this.selectedId = null;
    this.selectedGuestId = null;
    this.selectedStaffId = null;
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
      this.selectedStaffId = null;
    }
    this.dragStart = null;
  }

  /** 마지막으로 회전한 시각(미리보기 강조 애니메이션용) */
  rotatedAt = -Infinity;

  rotate(): void {
    this.rot = (this.rot + 1) % 4;
    this.rotatedAt = performance.now();
    if (this.tool.kind === 'build' || this.tool.kind === 'move') this.notify(`회전: 입구가 ${ENTRANCE_DIR_TEXT[this.rot]} 쪽`);
  }

  /** Esc: 진행 중인 드래그 취소 → 도구 해제 → 선택 해제 */
  cancel(): void {
    if (this.tool.kind === 'track') this.endTrackEdit();
    else if (this.dragStart) this.dragStart = null;
    else if (this.tool.kind !== 'none') this.tool = { kind: 'none' };
    else {
      this.selectedId = null;
      this.selectedGuestId = null;
      this.selectedStaffId = null;
    }
  }

  /** 진행 중인 드래그(길 깔기 등)만 취소한다. 도구 선택은 유지(터치에서 두 번째 손가락이 닿을 때). */
  cancelDrag(): void {
    this.dragStart = null;
  }

  /** 건설 도구가 켜져 있나(터치에서 한 손가락이 화면 이동이 아니라 건설 입력이 되는 조건) */
  get isBuilding(): boolean {
    return this.tool.kind !== 'none' && this.tool.kind !== 'track';
  }

  /** 선택한 건물 옮기기 시작. 현재 방향을 그대로 쓰고 R로 돌릴 수 있다. */
  beginMove(id: number): void {
    const b = this.world.buildings.get(id);
    if (!b) return;
    this.setTool({ kind: 'move', buildingId: id });
    this.rot = b.rot;
    this.notify('옮길 곳을 누르세요 (R: 회전, Esc: 취소)');
  }

  /** 옮기는 중인 건물 */
  get movingBuilding(): Building | null {
    return this.tool.kind === 'move' ? (this.world.buildings.get(this.tool.buildingId) ?? null) : null;
  }

  /** 편집 중인 롤러코스터 */
  get trackBuilding(): Building | null {
    return this.tool.kind === 'track' ? (this.world.buildings.get(this.tool.buildingId) ?? null) : null;
  }

  /** 기존(또는 미완성) 롤러코스터의 트랙 편집을 시작. 운행 중이던 손님은 내보낸다. */
  beginTrackEdit(id: number): void {
    const b = this.world.buildings.get(id);
    if (!b?.track) return;
    beginEdit(this.world, b);
    this.setTool({ kind: 'track', buildingId: id });
  }

  /** 편집을 끝내고 그 코스터를 선택해 정보 패널을 보여 준다 */
  endTrackEdit(): void {
    const id = this.tool.kind === 'track' ? this.tool.buildingId : null;
    this.tool = { kind: 'none' };
    this.selectedGuestId = null;
    this.selectedStaffId = null;
    this.selectedId = id !== null && this.world.buildings.has(id) ? id : null;
  }

  placeTrackPiece(type: TrackType): void {
    const b = this.trackBuilding;
    if (!b) return;
    const r = appendPiece(this.world, b, type);
    if (!r.ok) {
      this.fail(TRACK_FAIL_TEXT[r.reason]);
      return;
    }
    const t = b.track!;
    if (t.closed && t.error) {
      this.fail(`코스가 이어졌지만 ${t.error}`);
    } else if (t.ok) {
      this.notify('롤러코스터 완성! 입구에 길을 이으면 운행을 시작합니다');
      this.onEvent?.('chime');
      this.endTrackEdit();
    } else {
      this.onEvent?.('build');
    }
  }

  undoTrackPiece(): void {
    const b = this.trackBuilding;
    if (!b) return;
    if (undoPiece(this.world, b)) this.onEvent?.('demolish');
    else this.fail('지울 조각이 없습니다');
  }

  clearTrackPieces(): void {
    const b = this.trackBuilding;
    if (b && clearTrack(this.world, b) > 0) this.onEvent?.('demolish');
  }

  notify(msg: string, tone: 'info' | 'error' = 'info'): void {
    this.message = msg;
    this.messageTone = tone;
    this.messageUntil = performance.now() + (tone === 'error' ? 3000 : 2500);
  }

  /** 실패 알림: 빨간 메시지(마우스 위치에 떠오르는 말풍선 포함) + 오류음 */
  fail(msg: string): void {
    this.notify(msg, 'error');
    this.onEvent?.('error');
  }

  /** 손님은 건물 앞에 그려지므로 클릭 반경 안에 있으면 건물보다 우선한다. 시설 안(숨김)의 손님은 제외. */
  /** 누른 곳 가까이의 길 잃은 아이(다른 손님 틈에서도 잡히게 반경을 넓게 본다) */
  private lostKidNear(pos: Vec2): Guest | undefined {
    let best: Guest | undefined;
    let bestD = (GUEST_PICK_RADIUS * 1.5) ** 2;
    for (const g of this.world.guests) {
      if (g.lostUntil === undefined) continue;
      const p = guestDisplayPos(g, 1);
      const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

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

  /** 직원은 손님보다 우선해서 고른다(손님 틈에 섞여 있어도 클릭할 수 있게) */
  private staffNear(pos: Vec2): number | null {
    let best: number | null = null;
    let bestD = GUEST_PICK_RADIUS * GUEST_PICK_RADIUS;
    for (const s of this.world.staff) {
      const p = staffDisplayPos(s, 1);
      const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  onDown(t: Tile | null, pos: Vec2 | null = null): void {
    if (!t) return;
    const tool = this.tool;
    if (tool.kind === 'none') {
      const sid = pos ? this.staffNear(pos) : null;
      // 길 잃은 아이를 누르면 보호자에게 데려다준다(쓰레기 줍기·선택보다 우선)
      const lost = pos && sid === null ? this.lostKidNear(pos) : undefined;
      if (lost) {
        // 알림 카드는 main.ts가 world.stats.reunited를 보고 띄운다
        if (reuniteKid(this.world, lost)) this.onEvent?.('chime');
        return;
      }
      // 쓰레기가 있는 칸을 누르면 직접 줍는다(손님이 붐비는 길에서도 주울 수 있게 손님 선택보다 우선)
      if (sid === null && this.pickUpLitter(t)) return;
      const gid = pos && sid === null ? this.guestNear(pos) : null;
      if (sid === null && gid === null && this.world.map.isGate(t.x, t.y)) {
        this.onGate?.();
        return;
      }
      this.selectedStaffId = sid;
      this.selectedGuestId = gid;
      this.selectedId = sid === null && gid === null ? (buildingAt(this.world, t.x, t.y)?.id ?? null) : null;
    } else if (tool.kind === 'path' || tool.kind === 'scenery' || tool.kind === 'terrain') {
      this.dragStart = t;
    } else if (tool.kind === 'build') {
      const a = anchorFor(tool.def, this.rot, t);
      const check = canPlaceBuilding(this.world, tool.def, a.x, a.y, this.rot);
      if (check.ok) {
        const b = placeBuilding(this.world, tool.def, a.x, a.y, this.rot);
        this.onEvent?.('build');
        if (b && tool.def.coaster) {
          this.tool = { kind: 'track', buildingId: b.id };
          this.notify('트랙을 이어 붙여 역의 시작 칸으로 돌아오세요');
        }
      } else {
        this.fail(FAIL_TEXT[check.reason]);
      }
    } else if (tool.kind === 'move') {
      const b = this.movingBuilding;
      if (!b) { this.tool = { kind: 'none' }; return; }
      const def = getBuildingDef(b);
      const a = anchorFor(def, this.rot, t);
      const check = canMoveBuilding(this.world, b, a.x, a.y, this.rot);
      if (check.ok && moveBuilding(this.world, b, a.x, a.y, this.rot)) {
        this.onEvent?.('build');
        this.notify('옮겼습니다');
        this.tool = { kind: 'none' };
        this.selectedId = b.id;
      } else {
        this.fail(check.ok ? '옮길 수 없습니다' : MOVE_FAIL_TEXT[check.reason]);
      }
    } else if (tool.kind === 'demolish') {
      if (demolishAt(this.world, t.x, t.y) === null) {
        this.fail('철거할 대상이 없습니다');
      } else {
        this.onEvent?.('demolish');
      }
    }
  }

  /** 그 칸의 쓰레기를 모두 줍는다. 주운 개수(없으면 0) */
  pickUpLitter(t: Tile): number {
    const m = this.world.map;
    const n = m.litterAt(t.x, t.y);
    if (n === 0) return 0;
    m.litter[m.index(t.x, t.y)] = 0;
    this.notify(`쓰레기 ${n}개를 주웠습니다`);
    this.onEvent?.('pickup');
    return n;
  }

  onUp(t: Tile | null): void {
    const start = this.dragStart;
    this.dragStart = null;
    const tool = this.tool;
    if ((tool.kind !== 'path' && tool.kind !== 'scenery' && tool.kind !== 'terrain') || !start || !t) return;
    const line = lineTiles(start, t);
    if (tool.kind === 'terrain') {
      const { changed, short, firstFail } = paintTerrain(this.world, line, tool.mode);
      if (short) this.fail(changed > 0 ? `돈이 부족해 ${changed}칸만 바꿨습니다` : '돈이 부족합니다');
      else if (changed === 0) this.fail(firstFail ? TERRAIN_FAIL_TEXT[firstFail] : '지형을 바꿀 수 없습니다');
      else this.onEvent?.('build');
      return;
    }
    const { placed, short } = tool.kind === 'path' ? placePaths(this.world, line) : placeScenery(this.world, line, tool.def);
    if (short) this.fail(placed > 0 ? `돈이 부족해 ${placed}칸만 놓았습니다` : '돈이 부족합니다');
    else if (placed === 0) this.fail(tool.kind === 'path' ? '길을 깔 수 없는 위치입니다' : '빈 잔디에만 심을 수 있습니다');
    else this.onEvent?.(tool.kind === 'path' ? 'path' : 'build');
  }

  preview(hover: Tile | null): Preview | null {
    const tool = this.tool;
    const map = this.world.map;

    // 트랙 편집은 마우스가 툴바 위에 있어도(hover 없음) 다음 칸을 보여 준다
    if (tool.kind === 'track') {
      const b = this.trackBuilding;
      if (!b?.track || b.track.closed) return null;
      const c = b.track.cursor;
      if (!map.inBounds(c.x, c.y)) return null;
      const ok = TRACK_TYPES.some((t) => canAppendPiece(this.world, b, t).ok);
      return { tiles: [{ x: c.x, y: c.y, ok }], cursor: c };
    }

    if (!hover) return null;

    // 선택 모드에서 쓰레기 칸 위에 있으면 주울 수 있다고 표시
    if (tool.kind === 'none') {
      return map.litterAt(hover.x, hover.y) > 0 ? { tiles: [{ ...hover, ok: true }] } : null;
    }

    if (tool.kind === 'terrain') {
      // 드래그 중에는 칸마다 독립적으로 검사한다(실제 적용은 앞 칸의 변경이 뒤 칸에 반영되므로 약간 다를 수 있다)
      const line = this.dragStart ? lineTiles(this.dragStart, hover) : [hover];
      let afford = Math.floor(this.world.money / TERRAIN_COST);
      const tiles = line
        .filter((t) => map.inBounds(t.x, t.y))
        .map((t) => {
          const ok = canChangeTerrain(this.world, t.x, t.y, tool.mode).ok && afford > 0;
          if (ok) afford--;
          const level = Math.max(0, Math.min(MAX_TERRAIN, map.heightAt(t.x, t.y) + (tool.mode === 'raise' ? 1 : -1)));
          return { ...t, ok, level: ok ? level : map.heightAt(t.x, t.y) };
        });
      return { tiles };
    }

    if (tool.kind === 'path' || tool.kind === 'scenery') {
      const line = this.dragStart ? lineTiles(this.dragStart, hover) : [hover];
      const isPath = tool.kind === 'path';
      let afford = Math.floor(this.world.money / (isPath ? PATH_COST : tool.def.cost));
      const tiles = line
        .filter((t) => map.inBounds(t.x, t.y))
        .map((t) => {
          const placeable = isPath ? isPathPlaceable(this.world, t.x, t.y) : isSceneryPlaceable(this.world, t.x, t.y);
          const ok = placeable && afford > 0;
          if (ok) afford--;
          return { ...t, ok };
        });
      return { tiles };
    }

    if (tool.kind === 'build' || tool.kind === 'move') {
      const moving = this.movingBuilding;
      if (tool.kind === 'move' && !moving) return null;
      const def = tool.kind === 'build' ? tool.def : getBuildingDef(moving!);
      const a = anchorFor(def, this.rot, hover);
      const f = footprintAt(def, a.x, a.y, this.rot);
      const ok = moving
        ? canMoveBuilding(this.world, moving, a.x, a.y, this.rot).ok
        : canPlaceBuilding(this.world, def, a.x, a.y, this.rot).ok;
      const tiles: PreviewTile[] = [];
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) if (map.inBounds(x, y)) tiles.push({ x, y, ok });
      }
      // 코스터를 옮길 때는 트랙이 놓일 칸도 보여 준다
      if (moving?.track) {
        for (const p of relocated(this.world, moving, a.x, a.y, this.rot).track!.placed) {
          if (map.inBounds(p.x, p.y)) tiles.push({ x: p.x, y: p.y, ok });
        }
      }
      const entrance = entranceOf(f, this.rot);
      return {
        tiles, entrance,
        ghost: { defId: def.id, ...f, rot: this.rot },
        entranceOnPath: map.inBounds(entrance.x, entrance.y) && map.isPath(entrance.x, entrance.y),
      };
    }

    if (tool.kind === 'demolish') {
      const b = buildingAt(this.world, hover.x, hover.y);
      if (b) {
        return { tiles: buildingTiles(b).map((t) => ({ ...t, ok: false })) };
      }
      if ((map.isPath(hover.x, hover.y) && !map.isGate(hover.x, hover.y)) || map.sceneryAt(hover.x, hover.y) !== 0) {
        return { tiles: [{ ...hover, ok: false }] };
      }
    }
    return null;
  }
}
