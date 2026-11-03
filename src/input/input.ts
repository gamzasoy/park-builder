import type { Camera } from '../render/camera';
import { worldToTile } from '../render/iso';

const PAN_SPEED = 600; // 화면 px/초 (zoom 1 기준)

export class Input {
  hoverTile: { x: number; y: number } | null = null;
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
    canvas.addEventListener('mouseleave', () => { this.hoverTile = null; });
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
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

  private onDown = (e: MouseEvent): void => {
    // 가운데/오른쪽 버튼 드래그 = 카메라 팬 (왼쪽은 이후 건설 도구용으로 비워 둠)
    if (e.button === 1 || e.button === 2) {
      this.dragging = true;
      const p = this.pos(e);
      this.lastX = p.x;
      this.lastY = p.y;
      e.preventDefault();
    }
  };

  private onUp = (): void => { this.dragging = false; };

  private onMove = (e: MouseEvent): void => {
    const p = this.pos(e);
    if (this.dragging) {
      this.cam.panByScreen(p.x - this.lastX, p.y - this.lastY);
      this.lastX = p.x;
      this.lastY = p.y;
    }
    const w = this.cam.screenToWorld(p.x, p.y);
    const t = worldToTile(w.x, w.y);
    this.hoverTile = { x: Math.floor(t.x), y: Math.floor(t.y) };
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.pos(e);
    this.cam.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
}
