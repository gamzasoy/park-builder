/**
 * 지면(잔디·돌길·연석)과 공원 뒤쪽 숲은 길을 고칠 때만 바뀐다.
 * 매 프레임 타일 2천여 개를 다시 그리지 않도록 8×8 타일 조각마다 오프스크린 캔버스에 그려 두고 붙인다.
 * 확대율·화면 배율·길 구성(map.version)이 바뀌면 캐시를 버린다.
 */
import { tileHash, type TileMap } from '../sim/map';
import type { Camera } from './camera';
import { TILE_H, TILE_W, tileToWorld, type Vec2 } from './iso';
import { drawScenery, poly } from './sprites';

const CHUNK = 8;
/** 공원 밖 뒤쪽 숲의 두께(타일) */
const FOREST = 6;
/** 조각 캔버스 위쪽 여유(나무가 타일 위로 솟는 높이, 월드 px) */
const TOP_PAD = 60;
const BOTTOM_PAD = 6;
/** 캐시 픽셀 예산(약 100MB). 최대 확대에서 이리저리 옮겨 다녀도 메모리가 불어나지 않게 오래 안 쓴 조각부터 버린다 */
const MAX_PIXELS = 24_000_000;

const GRASS = ['#3f8b3a', '#3c8537', '#43913e', '#398034'];
const PATH_TONES = ['#a3a29c', '#9b9a94'];

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Chunk { canvas: AnyCanvas; wx: number; wy: number; w: number; h: number }

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class GroundCache {
  /** 삽입 순서 = 최근 사용 순서(LRU) */
  private chunks = new Map<string, Chunk>();
  private pixels = 0;
  private stamp = '';

  draw(ctx: CanvasRenderingContext2D, cam: Camera, map: TileMap): void {
    const dpr = ctx.getTransform().a || 1;
    const stamp = `${cam.zoom}|${dpr}|${map.version}`;
    if (stamp !== this.stamp) {
      this.chunks.clear();
      this.pixels = 0;
      this.stamp = stamp;
    }
    const P = (tx: number, ty: number): Vec2 => {
      const w = tileToWorld(tx, ty);
      return cam.worldToScreen(w.x, w.y);
    };
    // 공원 밖 바닥(숲) 한 장 + 공원 안 바탕 잔디(조각 이음새가 비치지 않게)
    const pad = FOREST;
    poly(ctx, [P(-pad, -pad), P(map.width + pad, -pad), P(map.width + pad, map.height + pad), P(-pad, map.height + pad)], '#2c5a28', null);
    poly(ctx, [P(0, 0), P(map.width, 0), P(map.width, map.height), P(0, map.height)], GRASS[0], null);

    const c0 = -Math.ceil(FOREST / CHUNK);
    const cx1 = Math.ceil(map.width / CHUNK);
    const cy1 = Math.ceil(map.height / CHUNK);
    // 뒤(cx+cy 작은 쪽)에서 앞으로: 뒤쪽 조각의 나무가 앞 조각 바닥에 덮이지 않게
    for (let sum = 2 * c0; sum <= cx1 + cy1 - 2; sum++) {
      for (let cx = c0; cx < cx1; cx++) {
        const cy = sum - cx;
        if (cy < c0 || cy >= cy1) continue;
        // 화면 밖 조각은 건너뛴다
        const tx0 = cx * CHUNK;
        const ty0 = cy * CHUNK;
        const left = P(tx0, ty0 + CHUNK).x;
        const right = P(tx0 + CHUNK, ty0).x;
        const top = P(tx0, ty0).y - TOP_PAD * cam.zoom;
        const bottom = P(tx0 + CHUNK, ty0 + CHUNK).y + BOTTOM_PAD * cam.zoom;
        if (right < 0 || left > cam.viewW || bottom < 0 || top > cam.viewH) continue;
        const ch = this.chunk(cx, cy, cam.zoom, dpr, map);
        if (!ch) continue;
        const s = cam.worldToScreen(ch.wx, ch.wy);
        // 장치 픽셀 경계에 맞춰 붙여 흐려지지 않게
        ctx.drawImage(ch.canvas, Math.round(s.x * dpr) / dpr, Math.round(s.y * dpr) / dpr, ch.w / dpr, ch.h / dpr);
      }
    }
  }

  private chunk(cx: number, cy: number, zoom: number, dpr: number, map: TileMap): Chunk | null {
    const key = `${cx},${cy}`;
    const hit = this.chunks.get(key);
    if (hit) {
      this.chunks.delete(key);
      this.chunks.set(key, hit);
      return hit;
    }
    const tx0 = cx * CHUNK;
    const ty0 = cy * CHUNK;
    const wx = (tx0 - (ty0 + CHUNK)) * (TILE_W / 2);
    const wy = (tx0 + ty0) * (TILE_H / 2) - TOP_PAD;
    const ww = CHUNK * TILE_W;
    const wh = CHUNK * TILE_H + TOP_PAD + BOTTOM_PAD;
    const S = zoom * dpr;
    const w = Math.ceil(ww * S) + 2;
    const h = Math.ceil(wh * S) + 2;
    const canvas = makeCanvas(w, h);
    const g = canvas.getContext('2d') as Ctx2D | null;
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toLocal = (tx: number, ty: number): Vec2 => {
      const p = tileToWorld(tx, ty);
      return { x: (p.x - wx) * zoom, y: (p.y - wy) * zoom };
    };
    paintChunk(g as CanvasRenderingContext2D, map, tx0, ty0, toLocal, zoom);
    const ch = { canvas, wx, wy, w, h };
    this.chunks.set(key, ch);
    this.pixels += w * h;
    for (const [k, old] of this.chunks) {
      if (this.pixels <= MAX_PIXELS || old === ch) break;
      this.chunks.delete(k);
      this.pixels -= old.w * old.h;
    }
    return ch;
  }
}

/** 조각 하나: 공원 안 타일의 잔디·길, 공원 뒤쪽 바깥 타일의 숲 */
function paintChunk(
  ctx: CanvasRenderingContext2D, map: TileMap, tx0: number, ty0: number,
  P: (tx: number, ty: number) => Vec2, z: number,
): void {
  const hw = (TILE_W / 2) * z;
  const hh = (TILE_H / 2) * z;
  const grass: Path2D[] = GRASS.map(() => new Path2D());
  const paths: Path2D[] = PATH_TONES.map(() => new Path2D());
  const tufts = new Path2D();
  const tuftsLight = new Path2D();
  const joints = new Path2D();
  const curbTop = new Path2D();
  const curbSide = new Path2D();
  const showTufts = z >= 0.6;
  const trees: { x: number; y: number; kind: number; seed: number }[] = [];

  const addDiamond = (p: Path2D, s: Vec2): void => {
    p.moveTo(s.x, s.y);
    p.lineTo(s.x + hw, s.y + hh);
    p.lineTo(s.x, s.y + 2 * hh);
    p.lineTo(s.x - hw, s.y + hh);
    p.closePath();
  };

  for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
    for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
      const s = P(tx, ty);
      if (!map.inBounds(tx, ty)) {
        // 공원 뒤쪽(x<0 또는 y<0) 바깥은 숲. 앞쪽에 두면 공원을 가린다
        const back = (tx < 0 || ty < 0) && tx < map.width && ty < map.height && tx >= -FOREST && ty >= -FOREST;
        if (back && tileHash(tx, ty, 3) < 0.75) {
          trees.push({ x: s.x, y: s.y + hh, kind: tileHash(tx, ty, 4) < 0.7 ? 1 : 2, seed: tileHash(tx, ty, 7) });
        }
        continue;
      }
      if (map.isPath(tx, ty)) {
        addDiamond(paths[(tx + ty) & 1], s);
        // 포장 줄눈: 타일을 네 칸으로 나누는 선
        joints.moveTo(s.x - hw / 2, s.y + hh / 2); joints.lineTo(s.x + hw / 2, s.y + hh * 1.5);
        joints.moveTo(s.x + hw / 2, s.y + hh / 2); joints.lineTo(s.x - hw / 2, s.y + hh * 1.5);
        // 연석: 이웃이 길이 아닌 변. 앞쪽 두 변(+x, +y)은 타일 안쪽에 두꺼운 띠로(이웃 조각에 덮이지 않게)
        const T = s;
        const R = { x: s.x + hw, y: s.y + hh };
        const B = { x: s.x, y: s.y + 2 * hh };
        const L = { x: s.x - hw, y: s.y + hh };
        const edge = (a: Vec2, b: Vec2): void => { curbTop.moveTo(a.x, a.y); curbTop.lineTo(b.x, b.y); };
        if (!map.isPath(tx, ty - 1)) edge(T, R);
        if (!map.isPath(tx - 1, ty)) edge(T, L);
        const side = (a: Vec2, b: Vec2): void => {
          edge(a, b);
          curbSide.moveTo(a.x, a.y);
          curbSide.lineTo(b.x, b.y);
          curbSide.lineTo(b.x, b.y - 2.5 * z);
          curbSide.lineTo(a.x, a.y - 2.5 * z);
          curbSide.closePath();
        };
        if (!map.isPath(tx + 1, ty)) side(R, B);
        if (!map.isPath(tx, ty + 1)) side(L, B);
        continue;
      }
      addDiamond(grass[Math.floor(tileHash(tx, ty, 2) * GRASS.length)], s);
      if (showTufts) {
        for (let i = 0; i < 3; i++) {
          const u = tileHash(tx, ty, 10 + i) - 0.5;
          const v = tileHash(tx, ty, 20 + i) - 0.5;
          const px = s.x + (u - v) * hw * 0.9;
          const py = s.y + hh + (u + v) * hh * 0.9;
          const p = i === 2 ? tuftsLight : tufts;
          p.moveTo(px - 2 * z, py); p.lineTo(px - 1 * z, py - 3 * z);
          p.moveTo(px, py); p.lineTo(px + 0.5 * z, py - 4 * z);
          p.moveTo(px + 2 * z, py); p.lineTo(px + 2.5 * z, py - 2.5 * z);
        }
      }
    }
  }
  GRASS.forEach((c, i) => { ctx.fillStyle = c; ctx.fill(grass[i]); });
  if (showTufts) {
    ctx.lineWidth = Math.max(1, z);
    ctx.strokeStyle = '#2d6c2a';
    ctx.stroke(tufts);
    ctx.strokeStyle = '#5ea951';
    ctx.stroke(tuftsLight);
  }
  PATH_TONES.forEach((c, i) => { ctx.fillStyle = c; ctx.fill(paths[i]); });
  ctx.fillStyle = '#7d7c76';
  ctx.fill(curbSide);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke(joints);
  ctx.strokeStyle = '#6f6e68';
  ctx.lineWidth = Math.max(1, 2 * z);
  ctx.stroke(curbTop);
  // 숲은 화면 위(뒤)부터
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) drawScenery(ctx, t.kind, t.x, t.y, z, t.seed);
}
