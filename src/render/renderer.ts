import { getDef } from '../data';
import type { Preview } from '../input/tools';
import { buildingDef, DIRS, LEVEL_PX, LOOP_RISE, pieceRange, routeAt, type PlacedPiece } from '../sim/coaster';
import { supportBase, trackOccupancy, type TrackSeg } from '../sim/trackedit';
import type { TestRun } from './testrun';
import { tileHash, type Tile, type TileMap } from '../sim/map';
import { MAX_QUEUE, type Guest } from '../sim/guest';
import type { WeatherKind } from '../sim/weather';
import type { Staff } from '../sim/staff';
import type { Building, World } from '../sim/world';
import type { Camera } from './camera';
import { shade } from './color';
import { guestDisplayPos, staffDisplayPos } from './guestpos';
import { BUBBLE_FONT, POSITIVE, THOUGHT_TEXT } from './thoughts';
import { GroundCache } from './ground';
import { drawRideSprite, drawScenery, drawStationFloor, PALETTE, poly, tintBox, type Quad } from './sprites';
import { TILE_H, TILE_W, tileToWorld, type Vec2 } from './iso';

export interface View {
  hover: Tile | null;
  preview: Preview | null;
  /** 틱 사이 보간 비율(0~1) */
  alpha: number;
  selectedId: number | null;
  selectedGuestId: number | null;
  selectedStaffId?: number | null;
  /** 시운전 애니메이션(렌더 전용 상태) */
  testRun?: TestRun;
}

const groundCache = new GroundCache();

export function drawFrame(ctx: CanvasRenderingContext2D, cam: Camera, world: World, view: View): void {
  const { hover, preview, alpha, selectedId, selectedGuestId } = view;
  const selectedStaffId = view.selectedStaffId ?? null;
  const map = world.map;
  ctx.fillStyle = '#1f3a1c';
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  const hw = (TILE_W / 2) * cam.zoom;
  const hh = (TILE_H / 2) * cam.zoom;
  const tileScreen = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  const visible = (s: Vec2): boolean =>
    !(s.x < -hw || s.x > cam.viewW + hw || s.y < -2 * hh || s.y > cam.viewH + hh);
  const time = world.tick + alpha;
  const raining = world.weather.kind === 'rain';

  // 1) 지면: 공원 밖 숲 바닥 → 잔디(질감) → 돌길(연석). 정적이라 조각별로 캐시해 둔다
  groundCache.draw(ctx, cam, map);

  // 1.5) 길 위 쓰레기: 지면 캐시와 분리해 매 프레임 겹쳐 그린다(쌓이고 치워져도 캐시가 무효화되지 않는다)
  drawLitter(ctx, cam, map, visible);

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
  const walkers: { g?: Guest; s?: Staff; x: number; y: number }[] = [];
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone') continue; // 시설 안에 있는 손님은 그리지 않음
    const pos = guestDisplayPos(g, alpha);
    walkers.push({ g, x: pos.x, y: pos.y });
  }
  for (const s of world.staff) {
    const pos = staffDisplayPos(s, alpha);
    walkers.push({ s, x: pos.x, y: pos.y });
  }
  walkers.sort((a, b) => a.x + a.y - (b.x + b.y));

  // 건물, 롤러코스터 트랙 조각, 열차는 같은 깊이 키로 한꺼번에 정렬해 손님과 섞어 그린다
  let occCache: Map<number, TrackSeg[]> | null = null;
  const trackOcc = (): Map<number, TrackSeg[]> => (occCache ??= trackOccupancy(world));
  const scenery: Scenery[] = buildings.map((b) => ({ key: bKey(b), draw: () => drawBuilding(ctx, cam, b, time) }));
  for (const b of buildings) {
    if (!b.track) continue;
    // 역 바닥은 열차보다 먼저(뒤 모서리 기준), 지붕은 건물 키로 그린다
    scenery.push({ key: b.x + b.y, draw: () => drawStationFloor(ctx, footprintQuad(cam, b), spriteOpts(cam, b, time), b.w >= b.h) });
    addTrackScenery(scenery, ctx, cam, b, alpha, trackOcc(), world, view.testRun);
  }
  addSceneryTiles(scenery, ctx, cam, map, tileScreen, visible, hh);
  const gs = tileScreen(map.gate.x, map.gate.y);
  if (visible(gs)) scenery.push({ key: map.gate.x + map.gate.y + 1.6, draw: () => drawGate(ctx, cam, map.gate) });
  scenery.sort((a, b) => a.key - b.key);

  let si = 0;
  for (const w of walkers) {
    while (si < scenery.length && scenery[si].key <= w.x + w.y) scenery[si++].draw();
    if (w.s) {
      if (w.s.id === selectedStaffId) drawGuestRing(ctx, cam, w.x, w.y);
      drawStaff(ctx, cam, w.s, w.x, w.y, time);
      continue;
    }
    const g = w.g!;
    if (g.id === selectedGuestId) drawGuestRing(ctx, cam, w.x, w.y);
    drawGuest(ctx, cam, g, w.x, w.y, raining);
  }
  while (si < scenery.length) scenery[si++].draw();

  // 생각 말풍선(건물·손님 위에). 확대했을 때만, 장면이 지저분해지지 않게 상한을 둔다.
  if (cam.zoom >= 0.7) {
    // 줄 선 손님처럼 한곳에 몰려 있으면 구역(셀)당 말풍선 하나만 그려 서로 겹치지 않게 한다
    const taken = new Set<number>();
    let shown = 0;
    for (const w of walkers) {
      // 줄 선 손님은 한 타일에 몰려 있어 말풍선이 대기 배지를 가린다. 상태는 배지와 클릭 패널로 확인한다.
      if (!w.g || w.g.thought === null || w.g.state === 'queueing' || shown >= 40) continue;
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
  ctx.font = `bold ${Math.max(10, 12 * cam.zoom)}px ${BUBBLE_FONT}`;
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

  // 고장 난 놀이기구: 입구 위에 렌치 아이콘
  for (const b of buildings) {
    if (!b.broken) continue;
    // 입구는 손님과 말풍선이 몰리는 곳이라, 건물 지붕 위(발판 중심)에 띄운다
    const s = tileScreen(b.x + b.w / 2, b.y + b.h / 2);
    if (!visible(s)) continue;
    const roof = Math.min(getDef(b.defId).height, 60) * cam.zoom;
    drawWrench(ctx, s.x, s.y - roof - 14 * cam.zoom, cam.zoom, time);
  }

  // 날씨: 화면 공간 틴트와 빗줄기(편집 미리보기는 그 위에 또렷하게 그린다)
  drawWeather(ctx, cam, world.weather.kind, time);

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

const RAIN_STREAKS = 110;
const RAIN_SLOPE = 0.25; // 빗줄기 기울기(x/y)

/** 흐림 = 약한 틴트, 비 = 어두운 틴트 + 고정 개수의 빗줄기(시간으로만 움직인다) */
function drawWeather(ctx: CanvasRenderingContext2D, cam: Camera, kind: WeatherKind, time: number): void {
  if (kind === 'sunny') return;
  const W = cam.viewW;
  const H = cam.viewH;
  ctx.fillStyle = kind === 'rain' ? 'rgba(20,32,56,0.22)' : 'rgba(40,50,70,0.08)';
  ctx.fillRect(0, 0, W, H);
  if (kind !== 'rain') return;

  const len = 16;
  ctx.strokeStyle = 'rgba(200,220,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < RAIN_STREAKS; i++) {
    const speed = 11 + (i % 5) * 2; // 틱당 낙하 px
    const y = (tileHash(i, 1, 3) * (H + len) + time * speed) % (H + len) - len;
    const x = (((tileHash(i, 2, 5) * (W + 60) - y * RAIN_SLOPE) % (W + 60)) + W + 60) % (W + 60) - 30;
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * RAIN_SLOPE, y + len);
  }
  ctx.stroke();
}

function footprintQuad(cam: Camera, b: Building): Quad {
  const P = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  return { top: P(b.x, b.y), right: P(b.x + b.w, b.y), bottom: P(b.x + b.w, b.y + b.h), left: P(b.x, b.y + b.h) };
}

function spriteOpts(cam: Camera, b: Building, time: number) {
  const def = getDef(b.defId);
  return { z: cam.zoom, time, running: b.phase === 'running', color: def.color, rot: b.rot };
}

function drawBuilding(ctx: CanvasRenderingContext2D, cam: Camera, b: Building, time: number): void {
  const def = getDef(b.defId);
  const q = footprintQuad(cam, b);
  // 관람차·드롭타워처럼 높은 기구도 잘리지 않게 여유를 넉넉히
  const h = Math.max(def.height, 160) * cam.zoom;
  if (q.right.x < -50 || q.left.x > cam.viewW + 50 || q.top.y - h > cam.viewH + 50 || q.bottom.y < -50) return;
  if (drawRideSprite(ctx, def.id, q, spriteOpts(cam, b, time), b.w, b.h)) return;
  // 전용 모양이 없는 건물: 색 상자(운행 중이면 윗면을 밝게)
  tintBox(ctx, q, 0, def.height * cam.zoom, b.phase === 'running' ? shade(def.color, 1.25) : def.color);
}

/** 나무·꽃(공원 안 장식 레이어 + 공원 밖 뒤쪽 숲)을 깊이 정렬 대상으로 추가 */
function addSceneryTiles(
  list: Scenery[], ctx: CanvasRenderingContext2D, cam: Camera, map: TileMap,
  tileScreen: (x: number, y: number) => Vec2, visible: (s: Vec2) => boolean, hh: number,
): void {
  const z = cam.zoom;
  const add = (tx: number, ty: number, kind: number): void => {
    const s = tileScreen(tx, ty);
    // 나무는 타일 위로 솟으므로 화면 아래쪽 여유를 더 둔다
    if (!visible(s) && !visible({ x: s.x, y: s.y - 50 * z })) return;
    const seed = tileHash(tx, ty, 7);
    list.push({ key: tx + ty + 1.5, draw: () => drawScenery(ctx, kind, s.x, s.y + hh, z, seed) });
  };
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const k = map.scenery[map.index(tx, ty)];
      if (k !== 0) add(tx, ty, k);
    }
  }
}

/** 공원 입구: 길 양옆 기둥 두 개와 아치 간판 */
function drawGate(ctx: CanvasRenderingContext2D, cam: Camera, g: Tile): void {
  const z = cam.zoom;
  const P = (x: number, y: number): Vec2 => {
    const w = tileToWorld(x, y);
    return cam.worldToScreen(w.x, w.y);
  };
  const a = P(g.x - 0.15, g.y + 0.5);
  const b = P(g.x + 1.15, g.y + 0.5);
  const H = 38 * z;
  for (const p of [a, b]) {
    ctx.fillStyle = '#d9cdb0';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.fillRect(p.x - 4 * z, p.y - H, 8 * z, H);
    ctx.strokeRect(p.x - 4 * z, p.y - H, 8 * z, H);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(p.x - 6 * z, p.y - H);
    ctx.lineTo(p.x, p.y - H - 9 * z);
    ctx.lineTo(p.x + 6 * z, p.y - H);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 간판(두 기둥을 잇는 띠)
  const sh = 11 * z;
  const y0 = -H + 6 * z;
  poly(ctx, [{ x: a.x, y: a.y + y0 }, { x: b.x, y: b.y + y0 }, { x: b.x, y: b.y + y0 + sh }, { x: a.x, y: a.y + y0 + sh }], '#f2c230', 'rgba(0,0,0,0.5)');
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + y0 + sh * 0.78 };
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.transform(1, (b.y - a.y) / (b.x - a.x), 0, 1, 0, 0); // 간판 기울기에 맞춰 글자를 기울인다
  ctx.fillStyle = '#a3241a';
  ctx.font = `bold ${Math.max(6, 8 * z)}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('PARK', 0, 0);
  ctx.restore();
}

interface Scenery { key: number; draw: () => void }

/** 타일 좌표(실수)와 높이(단계) → 화면 좌표 */
function railPoint(cam: Camera, x: number, y: number, h: number): Vec2 {
  const w = tileToWorld(x, y);
  const s = cam.worldToScreen(w.x, w.y);
  return { x: s.x, y: s.y - h * LEVEL_PX * cam.zoom };
}

/** 트랙 조각 한 칸의 기둥 + 침목 + 레일. 회전 조각은 모서리를 제어점으로 하는 곡선. */
function drawTrackPiece(ctx: CanvasRenderingContext2D, cam: Camera, p: PlacedPiece, finished: boolean, base: number | null): void {
  const [idx, idy] = DIRS[p.dirIn];
  const [odx, ody] = DIRS[p.dirOut];
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const hMid = (p.hIn + p.hOut) / 2;
  const a = railPoint(cam, cx - idx * 0.5, cy - idy * 0.5, p.hIn);
  const m = railPoint(cam, cx, cy, hMid);
  const b = railPoint(cam, cx + odx * 0.5, cy + ody * 0.5, p.hOut);
  if (Math.max(a.x, b.x) < -40 || Math.min(a.x, b.x) > cam.viewW + 40) return;
  if (Math.min(a.y, b.y) > cam.viewH + 40 || Math.max(a.y, b.y) < -40 - (p.type === 'loop' ? LOOP_RISE * LEVEL_PX * cam.zoom : 0)) return;
  const z = cam.zoom;

  if (base !== null && hMid - base > 0.01) {
    // 나무 격자 지지대: 기둥 두 개 + X자 가새. 아래 트랙 위에서 끝나고, 길 위에서는 세우지 않는다
    const g = railPoint(cam, cx, cy, base);
    const w = 3.5 * z;
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    ctx.moveTo(m.x - w, m.y + 2 * z); ctx.lineTo(g.x - w, g.y);
    ctx.moveTo(m.x + w, m.y + 2 * z); ctx.lineTo(g.x + w, g.y);
    const step = 10 * z;
    for (let y = g.y; y - step > m.y; y -= step) {
      ctx.moveTo(g.x - w, y); ctx.lineTo(g.x + w, y - step);
      ctx.moveTo(g.x + w, y); ctx.lineTo(g.x - w, y - step);
    }
    ctx.stroke();
    if (base === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 5 * z, 2.5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
  // 노란 강철 레일 두 줄: 짙은 테두리 → 노란 띠 → 가운데 틈
  ctx.save();
  if (!finished) ctx.globalAlpha = 0.75; // 미완성 트랙은 반투명 주황
  trace();
  ctx.strokeStyle = finished ? '#6b4a12' : '#7a4a1a';
  ctx.lineWidth = Math.max(3, 8 * z);
  ctx.stroke();
  trace();
  ctx.strokeStyle = finished ? '#f2c230' : '#f0943a';
  ctx.lineWidth = Math.max(2, 6 * z);
  ctx.stroke();
  trace();
  ctx.strokeStyle = finished ? '#8a6418' : '#9a5a20';
  ctx.lineWidth = Math.max(0.8, 1.5 * z);
  ctx.stroke();
  ctx.restore();
  if (p.type === 'loop') drawLoopRing(ctx, cam, p, finished, base);
  if (p.type === 'brake') {
    // 붉은 제동 블록 줄무늬
    trace();
    ctx.setLineDash([3 * z, 4 * z]);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = Math.max(2, 5 * z);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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

/** 루프: 진행 방향 수직면에 서 있는 레일 원 + 받침 */
function drawLoopRing(ctx: CanvasRenderingContext2D, cam: Camera, p: PlacedPiece, finished: boolean, base: number | null): void {
  const [dx, dy] = DIRS[p.dirOut];
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const z = cam.zoom;
  const lx = -dy * 0.1; // 두 줄의 레일이 나란히 보이도록 옆으로 살짝 벌린다
  const ly = dx * 0.1;
  const N = 28;
  const ring = (off: number): void => {
    ctx.beginPath();
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * Math.PI * 2;
      const along = 0.42 * Math.sin(th);
      const q = railPoint(cam, cx + dx * along + lx * off, cy + dy * along + ly * off, p.hIn + (1 - Math.cos(th)) * (LOOP_RISE / 2));
      if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
  };
  // 받침: 꼭대기에서 레일 높이까지 기둥, 옆구리에서 지면 쪽으로 버팀대
  const top = railPoint(cam, cx, cy, p.hIn + LOOP_RISE);
  const mid = railPoint(cam, cx, cy, p.hIn);
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = Math.max(1, 1.6 * z);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y); ctx.lineTo(mid.x, mid.y);
  for (const sgn of [-1, 1]) {
    const side = railPoint(cam, cx + dx * 0.42 * sgn, cy + dy * 0.42 * sgn, p.hIn + LOOP_RISE / 2);
    const foot = railPoint(cam, cx + dx * 0.5 * sgn, cy + dy * 0.5 * sgn, base === null ? p.hIn : Math.max(base, p.hIn - 0.01));
    ctx.moveTo(side.x, side.y); ctx.lineTo(foot.x, foot.y);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.save();
  if (!finished) ctx.globalAlpha = 0.75;
  for (const off of [-1, 1]) {
    ring(off);
    ctx.strokeStyle = finished ? '#6b4a12' : '#7a4a1a';
    ctx.lineWidth = Math.max(3, 7 * z);
    ctx.stroke();
    ring(off);
    ctx.strokeStyle = finished ? '#f2c230' : '#f0943a';
    ctx.lineWidth = Math.max(2, 4.5 * z);
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineCap = 'butt';
}

/** 열차 한 칸: 차체 + 앞쪽 덮개 + 탑승객 머리 둘 */
function drawCar(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, h: number, color: string): void {
  const s = railPoint(cam, x, y, h);
  const z = cam.zoom;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(s.x - 8 * z, s.y - 10 * z, 16 * z, 8 * z, 3 * z);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = shade(color, 0.65);
  ctx.fillRect(s.x - 8 * z, s.y - 4.5 * z, 16 * z, 2.5 * z);
  ctx.fillStyle = '#f1d3b0';
  for (const dx of [-3.5, 3.5]) {
    ctx.beginPath();
    ctx.arc(s.x + dx * z, s.y - 12 * z, 2.4 * z, 0, Math.PI * 2);
    ctx.fill();
  }
}

const CARS = 3;

/** 높이를 깊이 키에 조금 더해, 같은 타일에서 높은 트랙이 낮은 트랙 위에 그려지게 한다 */
const heightKey = (h: number): number => 0.04 * h;

/** 코스터의 트랙 조각과 열차를 깊이 정렬 대상으로 추가 */
function addTrackScenery(
  list: Scenery[], ctx: CanvasRenderingContext2D, cam: Camera, b: Building, alpha: number,
  occ: Map<number, TrackSeg[]>, world: World, testRun?: TestRun,
): void {
  const t = b.track!;
  for (const p of t.placed) {
    const r = pieceRange(p);
    const base = supportBase(world, occ, p);
    list.push({ key: p.x + p.y + 1.5 + heightKey((r.hMin + r.hMax) / 2), draw: () => drawTrackPiece(ctx, cam, p, t.ok, base) });
  }

  const trial = testRun && testRun.active(b.id) ? testRun : undefined;
  if (trial) {
    // 시운전: 선두가 정해진 지점까지 달리고, 멈추면 그 자리에 표시
    const gap = 0.9 / (t.placed.length + 4);
    for (let i = 0; i < CARS; i++) {
      const pos = routeAt(t.route, Math.max(0, trial.t - i * gap));
      list.push({
        key: pos.x + pos.y + 0.6 + heightKey(pos.h),
        draw: () => drawCar(ctx, cam, pos.x, pos.y, pos.h, i === 0 ? '#2f6fd0' : '#d9443a'),
      });
    }
    if (trial.stalled && trial.finished) {
      const pos = routeAt(t.route, trial.t);
      list.push({ key: pos.x + pos.y + 0.7 + heightKey(pos.h), draw: () => drawStallMarker(ctx, cam, pos.x, pos.y, pos.h) });
    }
    return;
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
      key: pos.x + pos.y + 0.6 + heightKey(pos.h),
      draw: () => drawCar(ctx, cam, pos.x, pos.y, pos.h, i === 0 ? '#2f6fd0' : '#d9443a'),
    });
  }
}

/** 시운전에서 열차가 멈춘 자리: 빨간 X와 문구 */
function drawStallMarker(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, h: number): void {
  const s = railPoint(cam, x, y, h);
  const z = cam.zoom;
  ctx.strokeStyle = '#e03b2e';
  ctx.lineWidth = Math.max(2, 3 * z);
  ctx.beginPath();
  ctx.moveTo(s.x - 6 * z, s.y - 34 * z); ctx.lineTo(s.x + 6 * z, s.y - 22 * z);
  ctx.moveTo(s.x + 6 * z, s.y - 34 * z); ctx.lineTo(s.x - 6 * z, s.y - 22 * z);
  ctx.stroke();
  ctx.font = `bold ${Math.max(9, 11 * z)}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText('여기서 멈춤', s.x, s.y - 38 * z);
  ctx.fillStyle = '#ffd7d2';
  ctx.fillText('여기서 멈춤', s.x, s.y - 38 * z);
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

const LOOKS = PALETTE;
const PANTS = ['#3a4a6b', '#4a3a2e', '#2e2e34', '#5a6e8a'];

/** 우산 색: 비 오는 날 어두운 화면에서도 눈에 띄는 밝은 색 */
const UMBRELLA = ['#ffd23f', '#ff5d73', '#4cc9f0', '#7bd66b', '#ff9f43'];

function drawGuest(ctx: CanvasRenderingContext2D, cam: Camera, g: Guest, tx: number, ty: number, raining: boolean): void {
  const w = tileToWorld(tx, ty);
  const s = cam.worldToScreen(w.x, w.y);
  const z = cam.zoom;
  if (s.x < -20 || s.x > cam.viewW + 20 || s.y < -40 || s.y > cam.viewH + 30) return;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 5 * z, 2.5 * z, 0, 0, Math.PI * 2);
  ctx.fill();

  // 다리: 걷는 중이면 이동 거리에 맞춰 엇갈린다
  const moving = g.state === 'walking' || g.state === 'leaving';
  const swing = moving ? Math.sin((tx + ty) * 14) * 1.6 * z : 0;
  ctx.strokeStyle = PANTS[g.look % PANTS.length];
  ctx.lineWidth = Math.max(1, 1.8 * z);
  ctx.beginPath();
  ctx.moveTo(s.x - 1.2 * z, s.y - 5 * z); ctx.lineTo(s.x - 1.2 * z + swing, s.y - 0.5 * z);
  ctx.moveTo(s.x + 1.2 * z, s.y - 5 * z); ctx.lineTo(s.x + 1.2 * z - swing, s.y - 0.5 * z);
  ctx.stroke();

  ctx.fillStyle = LOOKS[g.look % LOOKS.length];
  ctx.beginPath();
  ctx.roundRect(s.x - 3 * z, s.y - 11 * z, 6 * z, 6.5 * z, 1.5 * z);
  ctx.fill();
  ctx.fillStyle = '#f1d3b0';
  ctx.beginPath();
  ctx.arc(s.x, s.y - 13.5 * z, 2.6 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g.look % 3 === 0 ? '#5a3a22' : g.look % 3 === 1 ? '#2a2420' : '#c9a050';
  ctx.beginPath();
  ctx.arc(s.x, s.y - 14.3 * z, 2.6 * z, Math.PI, 0);
  ctx.fill();

  // 비 오는 날 우산을 쓴 손님(풍선 대신)
  if (g.umbrella && raining) {
    const ux = s.x + 1 * z;
    const uy = s.y - 21 * z;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = Math.max(1.2, 1.2 * z);
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux, s.y - 9 * z);
    ctx.stroke();
    ctx.fillStyle = UMBRELLA[g.look % UMBRELLA.length];
    ctx.beginPath();
    ctx.arc(ux, uy, 8 * z, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, 1.1 * z);
    ctx.stroke();
  } else if (g.look % 5 === 2) { // 풍선을 든 손님
    const bx = s.x + 5 * z;
    const by = s.y - 26 * z;
    ctx.strokeStyle = 'rgba(40,40,40,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x + 3 * z, s.y - 8 * z);
    ctx.lineTo(bx, by + 4 * z);
    ctx.stroke();
    ctx.fillStyle = LOOKS[(g.look + 3) % LOOKS.length];
    ctx.beginPath();
    ctx.ellipse(bx, by, 3.5 * z, 4.3 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(bx - 1.2 * z, by - 1.5 * z, 1 * z, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 길 위 쓰레기: 타일마다 양(1~3)만큼 작은 종이·캔 조각을 고정 위치에 흩뿌린다 */
function drawLitter(ctx: CanvasRenderingContext2D, cam: Camera, map: TileMap, visible: (s: Vec2) => boolean): void {
  const colors = ['#f4efe0', '#d8b35a', '#8fb7d6', '#c46a5a'];
  const z = cam.zoom;
  for (let i = 0; i < map.litter.length; i++) {
    const n = map.litter[i];
    if (n === 0) continue;
    const tx = i % map.width;
    const ty = (i / map.width) | 0;
    const w0 = tileToWorld(tx, ty);
    if (!visible(cam.worldToScreen(w0.x, w0.y))) continue;
    for (let k = 0; k < n * 2; k++) {
      // 마름모 안쪽의 한 점(타일 좌표 0.2~0.8)
      const w = tileToWorld(tx + 0.2 + tileHash(tx, ty, 20 + k) * 0.6, ty + 0.2 + tileHash(tx, ty, 40 + k) * 0.6);
      const p = cam.worldToScreen(w.x, w.y);
      ctx.fillStyle = colors[(tx * 7 + ty * 3 + k) % colors.length];
      ctx.fillRect(p.x - 1.5 * z, p.y - 1 * z, Math.max(2, 3 * z), Math.max(1.5, 2 * z));
    }
  }
}

/** 고장 표시: 붉은 원 안의 렌치(살짝 흔들린다) */
function drawWrench(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number): void {
  const r = Math.max(9, 10 * z);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 0.3) * 0.18);
  ctx.fillStyle = 'rgba(210,60,50,0.95)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, r * 0.26);
  ctx.beginPath(); // 자루
  ctx.moveTo(-r * 0.5, r * 0.5);
  ctx.lineTo(r * 0.15, -r * 0.15);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.6, r * 0.2);
  ctx.beginPath(); // 입이 벌어진 머리
  ctx.moveTo(r * 0.05, -r * 0.55);
  ctx.lineTo(r * 0.5, -r * 0.5);
  ctx.lineTo(r * 0.55, -r * 0.05);
  ctx.stroke();
  ctx.restore();
}

/** 직원: 눈에 띄는 작업복(청소부 = 주황 조끼 + 모자). 작업 중이면 빗자루를 쓴다. */
function drawStaff(ctx: CanvasRenderingContext2D, cam: Camera, st: Staff, tx: number, ty: number, time: number): void {
  const w = tileToWorld(tx, ty);
  const s = cam.worldToScreen(w.x, w.y);
  const z = cam.zoom;
  if (s.x < -20 || s.x > cam.viewW + 20 || s.y < -40 || s.y > cam.viewH + 30) return;
  const vest = st.kind === 'janitor' ? '#f08a24' : '#2f78d0';

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 5 * z, 2.5 * z, 0, 0, Math.PI * 2);
  ctx.fill();

  const swing = st.state === 'walking' ? Math.sin((tx + ty) * 14) * 1.6 * z : 0;
  ctx.strokeStyle = '#2a3342';
  ctx.lineWidth = Math.max(1, 1.8 * z);
  ctx.beginPath();
  ctx.moveTo(s.x - 1.2 * z, s.y - 5 * z); ctx.lineTo(s.x - 1.2 * z + swing, s.y - 0.5 * z);
  ctx.moveTo(s.x + 1.2 * z, s.y - 5 * z); ctx.lineTo(s.x + 1.2 * z - swing, s.y - 0.5 * z);
  ctx.stroke();

  if (st.state === 'working' && st.kind === 'mechanic') {
    // 렌치로 두드리기
    const hit = Math.sin(time * 1.8) * 2 * z;
    ctx.strokeStyle = '#9aa3b0';
    ctx.lineWidth = Math.max(1.5, 2 * z);
    ctx.beginPath();
    ctx.moveTo(s.x + 3 * z, s.y - 8 * z);
    ctx.lineTo(s.x + 7 * z + hit, s.y - 4 * z);
    ctx.stroke();
  } else if (st.state === 'working') {
    // 빗자루 쓸기
    const sweep = Math.sin(time * 1.4) * 3 * z;
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.beginPath();
    ctx.moveTo(s.x + 3 * z, s.y - 9 * z);
    ctx.lineTo(s.x + 6 * z + sweep, s.y);
    ctx.stroke();
    ctx.strokeStyle = '#d9b85a';
    ctx.lineWidth = Math.max(1.5, 2.4 * z);
    ctx.beginPath();
    ctx.moveTo(s.x + 4 * z + sweep, s.y);
    ctx.lineTo(s.x + 8 * z + sweep, s.y);
    ctx.stroke();
  }

  ctx.fillStyle = vest;
  ctx.beginPath();
  ctx.roundRect(s.x - 3.4 * z, s.y - 11.4 * z, 6.8 * z, 7 * z, 1.5 * z);
  ctx.fill();
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(s.x - 3.4 * z, s.y - 8.4 * z, 6.8 * z, 1.2 * z);
  ctx.fillStyle = '#f1d3b0';
  ctx.beginPath();
  ctx.arc(s.x, s.y - 13.5 * z, 2.6 * z, 0, Math.PI * 2);
  ctx.fill();
  // 모자
  ctx.fillStyle = vest;
  ctx.beginPath();
  ctx.arc(s.x, s.y - 14.2 * z, 2.8 * z, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(s.x - 3.6 * z, s.y - 14.4 * z, 7.2 * z, 1.1 * z);
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
  const fontPx = Math.max(9, 10 * z);
  ctx.font = `500 ${fontPx}px ${BUBBLE_FONT}`;
  const padX = 5 * z;
  const bw = ctx.measureText(text).width + padX * 2;
  const bh = fontPx + 5 * z;
  const x = s.x - bw / 2;
  const y = s.y - 20 * z - bh;

  ctx.save();
  ctx.globalAlpha = Math.min(1, g.thoughtTimer / 15);
  ctx.fillStyle = POSITIVE.has(g.thought) ? '#d8f5df' : '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, 4 * z);
  ctx.fill();
  ctx.stroke();
  // 꼬리
  ctx.beginPath();
  ctx.moveTo(s.x - 2.5 * z, y + bh);
  ctx.lineTo(s.x, y + bh + 4 * z);
  ctx.lineTo(s.x + 2.5 * z, y + bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.fillText(text, s.x, y + bh / 2 + fontPx * 0.35);
  ctx.textAlign = 'start';
  ctx.restore();
  return true;
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
