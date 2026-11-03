import { getDef } from '../data';
import type { Preview } from '../input/tools';
import { buildingDef, DIRS, LEVEL_PX, routeAt, type PlacedPiece } from '../sim/coaster';
import type { Tile } from '../sim/map';
import { MAX_QUEUE, type Guest } from '../sim/guest';
import type { Building, World } from '../sim/world';
import type { Camera } from './camera';
import { shade } from './color';
import { guestDisplayPos } from './guestpos';
import { POSITIVE, THOUGHT_TEXT } from './thoughts';
import { TILE_H, TILE_W, tileToWorld, type Vec2 } from './iso';

export interface View {
  hover: Tile | null;
  preview: Preview | null;
  /** 틱 사이 보간 비율(0~1) */
  alpha: number;
  selectedId: number | null;
  selectedGuestId: number | null;
}

export function drawFrame(ctx: CanvasRenderingContext2D, cam: Camera, world: World, view: View): void {
  const { hover, preview, alpha, selectedId, selectedGuestId } = view;
  const map = world.map;
  ctx.fillStyle = '#1b2a1f';
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  const hw = (TILE_W / 2) * cam.zoom;
  const hh = (TILE_H / 2) * cam.zoom;
  const tileScreen = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  const visible = (s: Vec2): boolean =>
    !(s.x < -hw || s.x > cam.viewW + hw || s.y < -2 * hh || s.y > cam.viewH + hh);

  // 1) 지면: 잔디 / 길 / 입구
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const s = tileScreen(tx, ty);
      if (!visible(s)) continue;
      let fill: string;
      if (map.isGate(tx, ty)) fill = '#e0b84a';
      else if (map.isPath(tx, ty)) fill = '#cdb98e';
      else fill = (tx + ty) % 2 === 0 ? '#3a7a48' : '#357043';
      diamond(ctx, s.x, s.y, hw, hh, fill);
    }
  }

  // 2) 건물 입구 표시
  for (const b of world.buildings.values()) {
    const s = tileScreen(b.entrance.x, b.entrance.y);
    if (!visible(s)) continue;
    // 노랑 = 공원 입구와 연결됨(운영 가능), 빨강 = 끊김
    const ok = world.network.isOperational(b);
    inset(ctx, s, hw, hh, ok ? undefined : 'rgba(235,70,70,0.35)', ok ? 'rgba(255,220,80,0.9)' : 'rgba(235,70,70,0.95)');
  }

  // 선택된 건물: 풋프린트보다 살짝 넓은 링(건물 뒤에 그려 테두리만 드러남)
  const selected = selectedId !== null ? world.buildings.get(selectedId) : undefined;
  if (selected) {
    drawRing(ctx, cam, selected);
    drawTrackOutline(ctx, cam, selected);
  }

  // 3) 건물 + 손님: 깊이(타일 x+y 합) 순으로 뒤에서 앞으로.
  //    건물 키 = 풋프린트 앞쪽 모서리 합 - 0.5, 손님 키 = 보간된 위치 x+y. 동률이면 손님이 앞.
  const bKey = (b: Building): number => b.x + b.w + b.y + b.h - 0.5;
  const buildings = [...world.buildings.values()].sort((a, b) => bKey(a) - bKey(b));
  const walkers: { g: Guest; x: number; y: number }[] = [];
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone') continue; // 시설 안에 있는 손님은 그리지 않음
    const pos = guestDisplayPos(g, alpha);
    walkers.push({ g, x: pos.x, y: pos.y });
  }
  walkers.sort((a, b) => a.x + a.y - (b.x + b.y));

  // 건물, 롤러코스터 트랙 조각, 열차는 같은 깊이 키로 한꺼번에 정렬해 손님과 섞어 그린다
  const scenery: Scenery[] = buildings.map((b) => ({ key: bKey(b), draw: () => drawBuilding(ctx, cam, b) }));
  for (const b of buildings) if (b.track) addTrackScenery(scenery, ctx, cam, b, alpha);
  scenery.sort((a, b) => a.key - b.key);

  let si = 0;
  for (const w of walkers) {
    while (si < scenery.length && scenery[si].key <= w.x + w.y) scenery[si++].draw();
    if (w.g.id === selectedGuestId) drawGuestRing(ctx, cam, w.x, w.y);
    drawGuest(ctx, cam, w.g, w.x, w.y);
  }
  while (si < scenery.length) scenery[si++].draw();

  // 생각 말풍선(건물·손님 위에). 확대했을 때만, 장면이 지저분해지지 않게 상한을 둔다.
  if (cam.zoom >= 0.7) {
    // 줄 선 손님처럼 한곳에 몰려 있으면 구역(셀)당 말풍선 하나만 그려 서로 겹치지 않게 한다
    const taken = new Set<number>();
    let shown = 0;
    for (const w of walkers) {
      // 줄 선 손님은 한 타일에 몰려 있어 말풍선이 대기 배지를 가린다. 상태는 배지와 클릭 패널로 확인한다.
      if (w.g.thought === null || w.g.state === 'queueing' || shown >= 40) continue;
      const sp = tileToWorld(w.x, w.y);
      const sc = cam.worldToScreen(sp.x, sp.y);
      const cell = Math.round(sc.x / (70 * cam.zoom)) * 100_000 + Math.round(sc.y / (22 * cam.zoom));
      if (taken.has(cell)) continue;
      if (drawBubble(ctx, cam, w.g, w.x, w.y)) {
        taken.add(cell);
        shown++;
      }
    }
  }

  // 대기 인원 표시
  ctx.font = `bold ${Math.max(10, 12 * cam.zoom)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const b of buildings) {
    if (b.queue.length === 0) continue;
    const s = tileScreen(b.entrance.x, b.entrance.y);
    if (!visible(s)) continue;
    const label = String(b.queue.length);
    const bx = s.x;
    const by = s.y - 22 * cam.zoom;
    const r = 9 * cam.zoom;
    ctx.fillStyle = b.queue.length >= MAX_QUEUE ? 'rgba(220,60,60,0.95)' : 'rgba(20,30,25,0.85)';
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(r, 8), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx, by + 4 * cam.zoom);
  }
  ctx.textAlign = 'start';

  // 4) 미리보기 / 호버
  if (preview) {
    for (const t of preview.tiles) {
      const s = tileScreen(t.x, t.y);
      diamond(ctx, s.x, s.y, hw, hh, t.ok ? 'rgba(90,230,130,0.5)' : 'rgba(235,70,70,0.55)', 'rgba(255,255,255,0.8)');
    }
    if (preview.entrance) {
      const s = tileScreen(preview.entrance.x, preview.entrance.y);
      inset(ctx, s, hw, hh, 'rgba(255,220,80,0.5)', 'rgba(255,220,80,1)');
    }
    if (preview.cursor) drawCursorArrow(ctx, cam, preview.cursor);
  } else if (hover && map.inBounds(hover.x, hover.y)) {
    const s = tileScreen(hover.x, hover.y);
    diamond(ctx, s.x, s.y, hw, hh, 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.9)');
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, cam: Camera, b: Building): void {
  const def = getDef(b.defId);
  const P = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  const top = P(b.x, b.y);
  const right = P(b.x + b.w, b.y);
  const bottom = P(b.x + b.w, b.y + b.h);
  const left = P(b.x, b.y + b.h);
  const h = def.height * cam.zoom;

  if (right.x < -50 || left.x > cam.viewW + 50 || bottom.y < -50 || top.y - h > cam.viewH + 50) return;

  const up = (p: Vec2): Vec2 => ({ x: p.x, y: p.y - h });
  poly(ctx, [left, bottom, up(bottom), up(left)], shade(def.color, 0.78));
  poly(ctx, [bottom, right, up(right), up(bottom)], shade(def.color, 0.55));
  // 운행 중인 놀이기구는 윗면을 밝게
  poly(ctx, [up(top), up(right), up(bottom), up(left)], b.phase === 'running' ? shade(def.color, 1.25) : def.color);
}

interface Scenery { key: number; draw: () => void }

/** 타일 좌표(실수)와 높이(단계) → 화면 좌표 */
function railPoint(cam: Camera, x: number, y: number, h: number): Vec2 {
  const w = tileToWorld(x, y);
  const s = cam.worldToScreen(w.x, w.y);
  return { x: s.x, y: s.y - h * LEVEL_PX * cam.zoom };
}

/** 트랙 조각 한 칸의 기둥 + 침목 + 레일. 회전 조각은 모서리를 제어점으로 하는 곡선. */
function drawTrackPiece(ctx: CanvasRenderingContext2D, cam: Camera, p: PlacedPiece, finished: boolean): void {
  const [idx, idy] = DIRS[p.dirIn];
  const [odx, ody] = DIRS[p.dirOut];
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const hMid = (p.hIn + p.hOut) / 2;
  const a = railPoint(cam, cx - idx * 0.5, cy - idy * 0.5, p.hIn);
  const m = railPoint(cam, cx, cy, hMid);
  const b = railPoint(cam, cx + odx * 0.5, cy + ody * 0.5, p.hOut);
  if (Math.max(a.x, b.x) < -40 || Math.min(a.x, b.x) > cam.viewW + 40) return;
  if (Math.min(a.y, b.y) > cam.viewH + 40 || Math.max(a.y, b.y) < -40) return;
  const z = cam.zoom;

  if (hMid > 0.01) {
    const g = railPoint(cam, cx, cy, 0);
    ctx.strokeStyle = '#59616b';
    ctx.lineWidth = Math.max(1.5, 2.5 * z);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
  }

  const turn = p.dirIn !== p.dirOut;
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    if (turn) {
      const c = railPoint(cam, cx - idx * 0.5 + odx * 0.5, cy - idy * 0.5 + ody * 0.5, hMid);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    } else {
      ctx.lineTo(m.x, m.y);
      ctx.lineTo(b.x, b.y);
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace();
  ctx.strokeStyle = '#6e4f3c'; // 침목
  ctx.lineWidth = Math.max(3, 7 * z);
  ctx.stroke();
  trace();
  ctx.strokeStyle = finished ? '#f1e8d6' : '#e8b45a'; // 레일: 미완성은 주황
  ctx.lineWidth = Math.max(1.5, 3 * z);
  ctx.stroke();
  if (p.type === 'lift') {
    trace();
    ctx.setLineDash([2 * z, 5 * z]);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = Math.max(2, 5 * z);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

/** 열차 한 칸 */
function drawCar(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, h: number, color: string): void {
  const s = railPoint(cam, x, y, h);
  const z = cam.zoom;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(s.x - 7 * z, s.y - 11 * z, 14 * z, 10 * z, 2.5 * z);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f1d3b0';
  ctx.beginPath();
  ctx.arc(s.x, s.y - 13 * z, 2.6 * z, 0, Math.PI * 2);
  ctx.fill();
}

const CARS = 3;

/** 코스터의 트랙 조각과 열차를 깊이 정렬 대상으로 추가 */
function addTrackScenery(list: Scenery[], ctx: CanvasRenderingContext2D, cam: Camera, b: Building, alpha: number): void {
  const t = b.track!;
  for (const p of t.placed) {
    list.push({ key: p.x + p.y + 1.5, draw: () => drawTrackPiece(ctx, cam, p, t.ok) });
  }
  if (!t.ok || t.route.length < 2) return;

  // 선두가 있는 경로 위 위치: 운행 중이면 진행도, 아니면 역에서 대기
  const def = buildingDef(b);
  const head = b.phase === 'running'
    ? Math.min(1, Math.max(0, (def.duration - b.timer + alpha) / def.duration))
    : t.holdT;
  const gap = 0.9 / (t.placed.length + 4);
  for (let i = 0; i < CARS; i++) {
    const pos = routeAt(t.route, Math.max(0, head - i * gap));
    list.push({
      key: pos.x + pos.y + 0.6,
      draw: () => drawCar(ctx, cam, pos.x, pos.y, pos.h, i === 0 ? '#ffd75a' : def.color),
    });
  }
}

/** 선택한 코스터의 트랙이 차지한 타일 윤곽 */
function drawTrackOutline(ctx: CanvasRenderingContext2D, cam: Camera, b: Building): void {
  if (!b.track) return;
  const hw = (TILE_W / 2) * cam.zoom;
  const hh = (TILE_H / 2) * cam.zoom;
  for (const p of b.track.placed) {
    const w = tileToWorld(p.x, p.y);
    const s = cam.worldToScreen(w.x, w.y);
    diamond(ctx, s.x, s.y, hw, hh, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.6)');
  }
}

/** 다음 조각이 놓일 칸: 진행 방향 화살표를 그 높이에 띄운다 */
function drawCursorArrow(ctx: CanvasRenderingContext2D, cam: Camera, c: { x: number; y: number; dir: number; h: number }): void {
  const [dx, dy] = DIRS[c.dir];
  const from = railPoint(cam, c.x + 0.5 - dx * 0.35, c.y + 0.5 - dy * 0.35, c.h);
  const to = railPoint(cam, c.x + 0.5 + dx * 0.35, c.y + 0.5 + dy * 0.35, c.h);
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 7 * cam.zoom;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(2, 3 * cam.zoom);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(ang - 0.5), to.y - head * Math.sin(ang - 0.5));
  ctx.lineTo(to.x - head * Math.cos(ang + 0.5), to.y - head * Math.sin(ang + 0.5));
  ctx.closePath();
  ctx.fill();
  if (c.h > 0) {
    // 지면 위치를 알 수 있게 바닥까지 가는 점선
    const g = railPoint(cam, c.x + 0.5, c.y + 0.5, 0);
    const m = railPoint(cam, c.x + 0.5, c.y + 0.5, c.h);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

const LOOKS = ['#e8564a', '#4a8fe8', '#e8c24a', '#7bc86c', '#b06ce0', '#ef8fb4', '#4ac9c0', '#f08a3c'];

function drawGuest(ctx: CanvasRenderingContext2D, cam: Camera, g: Guest, tx: number, ty: number): void {
  const w = tileToWorld(tx, ty);
  const s = cam.worldToScreen(w.x, w.y);
  const z = cam.zoom;
  if (s.x < -20 || s.x > cam.viewW + 20 || s.y < -30 || s.y > cam.viewH + 30) return;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 6 * z, 3 * z, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = LOOKS[g.look % LOOKS.length];
  ctx.fillRect(s.x - 3 * z, s.y - 11 * z, 6 * z, 9 * z);
  ctx.fillStyle = '#f1d3b0';
  ctx.beginPath();
  ctx.arc(s.x, s.y - 14 * z, 3 * z, 0, Math.PI * 2);
  ctx.fill();
}

function drawRing(ctx: CanvasRenderingContext2D, cam: Camera, b: Building): void {
  const m = 0.14;
  const P = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  const pts = [P(b.x - m, b.y - m), P(b.x + b.w + m, b.y - m), P(b.x + b.w + m, b.y + b.h + m), P(b.x - m, b.y + b.h + m)];
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawGuestRing(ctx: CanvasRenderingContext2D, cam: Camera, tx: number, ty: number): void {
  const w = tileToWorld(tx, ty);
  const s = cam.worldToScreen(w.x, w.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 10 * cam.zoom, 5 * cam.zoom, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** 머리 위 생각 말풍선. 화면 밖이면 false. 사라지기 직전 0.5초는 서서히 투명해진다. */
function drawBubble(ctx: CanvasRenderingContext2D, cam: Camera, g: Guest, tx: number, ty: number): boolean {
  if (g.thought === null) return false;
  const w = tileToWorld(tx, ty);
  const s = cam.worldToScreen(w.x, w.y);
  const z = cam.zoom;
  if (s.x < -60 || s.x > cam.viewW + 60 || s.y < 0 || s.y > cam.viewH + 30) return false;

  const text = THOUGHT_TEXT[g.thought];
  const fontPx = Math.max(10, 11 * z);
  ctx.font = `${fontPx}px system-ui, sans-serif`;
  const padX = 6 * z;
  const bw = ctx.measureText(text).width + padX * 2;
  const bh = fontPx + 7 * z;
  const x = s.x - bw / 2;
  const y = s.y - 20 * z - bh;

  ctx.save();
  ctx.globalAlpha = Math.min(1, g.thoughtTimer / 15);
  ctx.fillStyle = POSITIVE.has(g.thought) ? '#d8f5df' : '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, 5 * z);
  ctx.fill();
  ctx.stroke();
  // 꼬리
  ctx.beginPath();
  ctx.moveTo(s.x - 3 * z, y + bh);
  ctx.lineTo(s.x, y + bh + 5 * z);
  ctx.lineTo(s.x + 3 * z, y + bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.fillText(text, s.x, y + bh / 2 + fontPx * 0.35);
  ctx.textAlign = 'start';
  ctx.restore();
  return true;
}

function poly(ctx: CanvasRenderingContext2D, pts: Vec2[], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** (x, y)는 마름모의 위쪽 꼭짓점. */
function diamond(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, hw: number, hh: number,
  fill?: string, stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + hw, y + hh);
  ctx.lineTo(x, y + 2 * hh);
  ctx.lineTo(x - hw, y + hh);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

/** 타일 중앙에 70% 크기로 축소한 마름모(입구 표시용). s는 타일 위쪽 꼭짓점. */
function inset(
  ctx: CanvasRenderingContext2D,
  s: Vec2, hw: number, hh: number,
  fill?: string, stroke?: string,
): void {
  diamond(ctx, s.x, s.y + hh * 0.3, hw * 0.7, hh * 0.7, fill, stroke);
}
