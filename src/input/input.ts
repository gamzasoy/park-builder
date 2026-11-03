import type { Camera } from '../render/camera';
import { worldToTile } from '../render/iso';
import type { Vec2 } from '../render/iso';
import type { Tile } from '../sim/map';

const PAN_SPEED = 600; // 화면 px/초 (zoom 1 기준)

export class Input {
  hoverTile: Tile | null = null;
  /** 마우스 아래의 타일 좌표(실수). 손님 선택에 쓴다. */
  hoverPos: Vec2 | null = null;
  onLeftDown?: (t: Tile | null, pos: Vec2 | null) => void;
  onLeftUp?: (t: Tile | null) => void;
  onKeyDown?: (key: string) => void;

  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement, private cam: Camera) {
    canvas.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mouseleave', () => { this.hoverTile = null; this.hoverPos = null; });
    window.addEventListener('keydown', (e) => {
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
    const dx = (k.has('a') || k.has('arrowleft') ? 1 : 0) - (k.has('d') || k.has('arrowright') ? 1 : 0);
    const dy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (dx || dy) this.cam.panByScreen(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
  }

  private pos(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** 화면 좌표 → 타일 좌표. hoverPos(실수)와 hoverTile(정수)을 함께 갱신. */
  private tileAt(sx: number, sy: number): Tile {
    const w = this.cam.screenToWorld(sx, sy);
    const t = worldToTile(w.x, w.y);
    this.hoverPos = t;
    return { x: Math.floor(t.x), y: Math.floor(t.y) };
  }

  private onDown = (e: MouseEvent): void => {
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

  private onUp = (e: MouseEvent): void => {
    if (e.button === 0) this.onLeftUp?.(this.hoverTile);
    else this.dragging = false;
  };

  private onMove = (e: MouseEvent): void => {
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
