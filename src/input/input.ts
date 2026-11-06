import type { Camera } from '../render/camera';
import type { Vec2 } from '../render/iso';
import type { Tile, TileMap } from '../sim/map';
import { TouchGesture, type GestureAction } from './gesture';
import { pickTile } from './pick';

const PAN_SPEED = 600; // 화면 px/초 (zoom 1 기준)

export class Input {
  hoverTile: Tile | null = null;
  /** 마우스 아래의 타일 좌표(실수). 손님 선택에 쓴다. */
  hoverPos: Vec2 | null = null;
  onLeftDown?: (t: Tile | null, pos: Vec2 | null) => void;
  onLeftUp?: (t: Tile | null) => void;
  onKeyDown?: (key: string) => void;
  /** 터치로 두 번째 손가락이 닿았을 때 진행 중이던 드래그(길 깔기 등)를 취소 */
  onTouchCancel?: () => void;
  /** 건설 도구(길·건물·장식·지형·철거 등)가 켜져 있으면 true — 한 손가락이 건설 입력이 된다 */
  buildMode: () => boolean = () => false;
  /** true면(건물·철거처럼 누르는 순간 실행되는 도구) 터치에서는 손가락을 뗄 때 실행한다 */
  deferOnTouch: () => boolean = () => false;
  /** false면 방향키로 카메라를 움직이지 않는다(트랙 편집에서 방향키는 조각 선택). WASD는 항상 동작. */
  arrowsPan = true;

  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private gesture = new TouchGesture(() => this.buildMode());

  /** 지형 높이를 고려해 칸을 고르는 데 쓰는 맵(월드가 새 게임·불러오기로 바뀔 수 있어 함수로 받는다) */
  getMap!: () => TileMap;

  constructor(private canvas: HTMLCanvasElement, private cam: Camera) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') { this.hoverTile = null; this.hoverPos = null; }
    });
    window.addEventListener('keydown', (e) => {
      // 글자 입력칸(공원 이름 등)에 쓰는 동안에는 단축키·카메라 이동을 하지 않는다
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!e.repeat) this.onKeyDown?.(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** 매 프레임 호출: 키보드 팬. dt는 초. */
  update(dt: number): void {
    const k = this.keys;
    const ar = this.arrowsPan;
    const dx = (k.has('a') || (ar && k.has('arrowleft')) ? 1 : 0) - (k.has('d') || (ar && k.has('arrowright')) ? 1 : 0);
    const dy = (k.has('w') || (ar && k.has('arrowup')) ? 1 : 0) - (k.has('s') || (ar && k.has('arrowdown')) ? 1 : 0);
    if (dx || dy) this.cam.panByScreen(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
  }

  private pos(e: MouseEvent | PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** 화면 좌표 → 타일 좌표. hoverPos(실수)와 hoverTile(정수)을 함께 갱신. */
  private tileAt(sx: number, sy: number): Tile {
    const w = this.cam.screenToWorld(sx, sy);
    const hit = pickTile(this.getMap!(), w.x, w.y);
    this.hoverPos = hit.pos;
    return hit.tile;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      const p = this.pos(e);
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      this.applyTouch(this.gesture.down(e.pointerId, p.x, p.y));
      e.preventDefault();
      return;
    }
    this.onDown(e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      const p = this.pos(e);
      this.applyTouch(this.gesture.move(e.pointerId, p.x, p.y));
      return;
    }
    this.onMove(e);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      const p = this.pos(e);
      this.applyTouch(this.gesture.up(e.pointerId, p.x, p.y));
      return;
    }
    this.onUp(e);
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.applyTouch(this.gesture.cancel(e.pointerId));
  };

  /** 제스처 상태기의 결과를 기존 마우스 콜백/카메라 조작으로 옮긴다 */
  private applyTouch(actions: GestureAction[]): void {
    for (const a of actions) {
      switch (a.type) {
        case 'down':
          this.hoverTile = this.tileAt(a.x, a.y);
          if (!this.deferOnTouch()) this.onLeftDown?.(this.hoverTile, this.hoverPos);
          break;
        case 'move':
          this.hoverTile = this.tileAt(a.x, a.y);
          break;
        case 'up':
          this.hoverTile = this.tileAt(a.x, a.y);
          if (this.deferOnTouch()) this.onLeftDown?.(this.hoverTile, this.hoverPos);
          this.onLeftUp?.(this.hoverTile);
          this.hoverTile = null; // 손가락을 떼면 미리보기를 지운다
          this.hoverPos = null;
          break;
        case 'cancel':
          this.onTouchCancel?.();
          this.hoverTile = null;
          this.hoverPos = null;
          break;
        case 'tap': {
          const t = this.tileAt(a.x, a.y);
          this.onLeftDown?.(t, this.hoverPos);
          this.onLeftUp?.(t);
          this.hoverTile = null;
          this.hoverPos = null;
          break;
        }
        case 'pan':
          this.cam.panByScreen(a.dx, a.dy);
          break;
        case 'zoom':
          this.cam.zoomAt(a.x, a.y, a.factor);
          break;
      }
    }
  }

  private onDown = (e: PointerEvent): void => {
    const p = this.pos(e);
    if (e.button === 0) {
      this.hoverTile = this.tileAt(p.x, p.y);
      this.onLeftDown?.(this.hoverTile, this.hoverPos);
    } else if (e.button === 1 || e.button === 2) {
      // 가운데/오른쪽 버튼 드래그 = 카메라 팬
      this.dragging = true;
      this.lastX = p.x;
      this.lastY = p.y;
      e.preventDefault();
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.button === 0) this.onLeftUp?.(this.hoverTile);
    else this.dragging = false;
  };

  private onMove = (e: PointerEvent): void => {
    // 툴바 등 캔버스 밖 UI 위에서는 호버 없음(팬 드래그 중에는 계속 처리)
    if (e.target !== this.canvas && !this.dragging) {
      this.hoverTile = null;
      this.hoverPos = null;
      return;
    }
    const p = this.pos(e);
    if (this.dragging) {
      this.cam.panByScreen(p.x - this.lastX, p.y - this.lastY);
      this.lastX = p.x;
      this.lastY = p.y;
    }
    this.hoverTile = this.tileAt(p.x, p.y);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.pos(e);
    this.cam.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
}
