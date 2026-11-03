import { getDef } from '../data';
import type { BuildingDef } from '../data/types';
import type { Tile } from './map';
import type { Building } from './world';

/**
 * 롤러코스터 모델 (순수 로직).
 *
 * - 역은 3×1 건물이고 열차는 회전(rot) 방향으로 달린다(rot 0 = +x, 1 = +y, 2 = -x, 3 = -y).
 * - 트랙은 조각을 한 칸씩 이어 붙이며, 열차가 역의 시작 칸으로 같은 방향·높이 0으로 돌아오면 완성이다.
 * - 속도는 에너지(e = v²)로 계산한다: 오르막은 깎고 내리막은 더하며 마찰이 조금씩 깎는다.
 *   체인 리프트는 에너지와 상관없이 일정한 속도로 올려 준다. 에너지가 바닥나면 열차가 멈추는 코스다.
 */

export type TrackType = 'straight' | 'left' | 'right' | 'up' | 'down' | 'lift' | 'brake' | 'loop';
export const TRACK_TYPES: readonly TrackType[] = ['straight', 'left', 'right', 'up', 'down', 'lift', 'brake', 'loop'];

export const TRACK_LABEL: Record<TrackType, string> = {
  straight: '직선', left: '좌회전', right: '우회전', up: '오르막', down: '내리막', lift: '리프트', brake: '브레이크', loop: '루프',
};

export const MAX_HEIGHT = 8;
export const MAX_PIECES = 60;
/** 높이 한 단계의 화면 높이(월드 px). 아이소 뷰에서 한 칸은 화면상 16px 내려가므로 그보다 충분히 커야 오르막이 오르막으로 보인다 */
export const LEVEL_PX = 26;

export const PIECE_COST: Record<TrackType, number> = {
  straight: 60, left: 60, right: 60, up: 60, down: 60, lift: 100, brake: 80, loop: 200,
};
/** 트랙 조각 하나당 하루 유지비 */
export const PIECE_UPKEEP = 10;

export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** 물리 상수 (밸런스 조정 지점) */
export const PHYSICS = {
  /** 역을 출발할 때의 에너지 */
  startE: 1.0,
  /** 체인 리프트가 유지하는 에너지 */
  liftE: 0.9,
  /** 오르막/내리막 한 단계가 깎거나 더하는 에너지 */
  slopeE: 0.55,
  /** 조각 하나를 지날 때 마찰로 잃는 에너지 */
  frictionE: 0.04,
  /** 이 아래로 떨어지면 열차가 멈춘다 */
  minE: 0.1,
  /** 속도 1에서 한 칸을 지나는 틱 수 */
  tileTicks: 8,
  /** v → 표시용 km/h */
  kmh: 40,
  /** 브레이크가 제한하는 에너지(속도 √1.44 = 1.2) */
  brakeE: 1.44,
  /** 루프를 넘으려면 필요한 진입 에너지(속도 1.3) */
  loopMinE: 1.69,
  /** 루프를 지나며 추가로 잃는 에너지 */
  loopE: 0.25,
};

/** 루프가 차지하는 높이 단계 수(h ~ h+LOOP_RISE) */
export const LOOP_RISE = 2;

export interface Cursor { x: number; y: number; dir: number; h: number }

export interface PlacedPiece {
  type: TrackType;
  /** 조각이 놓인 타일 */
  x: number;
  y: number;
  dirIn: number;
  dirOut: number;
  hIn: number;
  hOut: number;
}

export interface CoasterStats {
  /** 트랙 조각 수 */
  length: number;
  /** 표시용 최고 속도(km/h) */
  maxSpeed: number;
  /** 가장 큰 낙차(단계) */
  maxDrop: number;
  maxHeight: number;
  turns: number;
  loops: number;
  fun: number;
  intensity: number;
  nausea: number;
  /** 한 바퀴 운행 틱 */
  duration: number;
}

/** 열차 경로의 한 점: 타일 좌표(실수), 높이(단계), 누적 시간 비율(0~1) */
export interface RoutePoint { x: number; y: number; h: number; t: number }

export interface Track {
  /** 저장되는 상태 */
  pieces: TrackType[];
  /** 지금까지 쓴 돈(역 + 조각). 철거 환급의 기준 */
  spent: number;
  /** 아래는 pieces에서 다시 계산되는 값 */
  placed: PlacedPiece[];
  cursor: Cursor;
  closed: boolean;
  /** 열차가 멈추는 등 완성할 수 없는 이유. 없으면 null */
  error: string | null;
  stats: CoasterStats | null;
  /** 닫혀 있고 오류가 없으면 운영할 수 있다 */
  ok: boolean;
  route: RoutePoint[];
  /** 열차가 역에서 대기할 때 선두의 경로 위치(t) */
  holdT: number;
  /** 조각마다 지나는 속도(√에너지). 시운전 애니메이션이 쓴다 */
  speeds: number[];
  /** 조각마다 경로 위 구간 [시작 t, 끝 t] */
  pieceT: [number, number][];
  /** 열차가 멈추거나 루프를 못 넘는 첫 조각의 인덱스. 없으면 null */
  stallIndex: number | null;
  /** 한 바퀴(또는 시운전)에 걸리는 틱 */
  lapTicks: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 열차 진행 순서대로 역의 세 칸 */
export function stationTiles(b: Building): Tile[] {
  const [dx, dy] = DIRS[b.rot % 4];
  // 진행 방향의 반대쪽 끝(최소/최대 좌표)이 첫 칸
  const sx = dx < 0 ? b.x + b.w - 1 : b.x;
  const sy = dy < 0 ? b.y + b.h - 1 : b.y;
  return [0, 1, 2].map((i) => ({ x: sx + dx * i, y: sy + dy * i }));
}

export function startCursor(b: Building): Cursor {
  const s = stationTiles(b);
  const [dx, dy] = DIRS[b.rot % 4];
  return { x: s[2].x + dx, y: s[2].y + dy, dir: b.rot % 4, h: b.baseH ?? 0 };
}

/** 커서 위치에 조각을 놓았을 때 조각과 다음 커서 */
export function applyPiece(c: Cursor, type: TrackType): { placed: PlacedPiece; next: Cursor } {
  const dirOut = type === 'left' ? (c.dir + 3) % 4 : type === 'right' ? (c.dir + 1) % 4 : c.dir;
  const hOut = c.h + (type === 'up' || type === 'lift' ? 1 : type === 'down' ? -1 : 0);
  const [dx, dy] = DIRS[dirOut];
  return {
    placed: { type, x: c.x, y: c.y, dirIn: c.dir, dirOut, hIn: c.h, hOut },
    next: { x: c.x + dx, y: c.y + dy, dir: dirOut, h: hOut },
  };
}

/** 조각이 높이 제한을 지키는가 */
export function heightOk(c: Cursor, type: TrackType): boolean {
  const h = applyPiece(c, type).next.h;
  if (type === 'loop' && c.h + LOOP_RISE > MAX_HEIGHT) return false;
  return h >= 0 && h <= MAX_HEIGHT;
}

/** 조각이 차지하는 높이 구간. 루프는 h ~ h+2를 차지한다. */
export function pieceRange(p: PlacedPiece): { hMin: number; hMax: number } {
  const lo = Math.min(p.hIn, p.hOut);
  const hi = Math.max(p.hIn, p.hOut);
  return { hMin: lo, hMax: p.type === 'loop' ? hi + LOOP_RISE : hi };
}

export function newTrack(b: Building, spent: number): Track {
  const t = {
    pieces: [], spent, placed: [], cursor: startCursor(b), closed: false, error: null,
    stats: null, ok: false, route: [], holdT: 0,
    speeds: [], pieceT: [], stallIndex: null, lapTicks: 0,
  } as Track;
  rebuild(b, t);
  return t;
}

/** 저장된 조각 목록으로 트랙을 복원(유효하지 않은 조각이 있으면 throw) */
export function restoreTrack(b: Building, pieces: unknown, spent: unknown): Track {
  if (!Array.isArray(pieces) || pieces.length > MAX_PIECES) throw new Error('bad track');
  if (typeof spent !== 'number' || !Number.isFinite(spent)) throw new Error('bad track cost');
  for (const p of pieces) if (!TRACK_TYPES.includes(p as TrackType)) throw new Error('bad track piece');
  const t = newTrack(b, spent);
  t.pieces = pieces.slice() as TrackType[];
  rebuild(b, t);
  return t;
}

/** pieces에서 위치·완성 여부·물리·경로를 다시 계산 */
export function rebuild(b: Building, t: Track): void {
  let cur = startCursor(b);
  const placed: PlacedPiece[] = [];
  for (const type of t.pieces) {
    const r = applyPiece(cur, type);
    placed.push(r.placed);
    cur = r.next;
  }
  t.placed = placed;
  t.cursor = cur;

  const s0 = stationTiles(b)[0];
  t.closed = placed.length > 0 && cur.x === s0.x && cur.y === s0.y && cur.dir === b.rot % 4 && cur.h === (b.baseH ?? 0);

  const sim = simulate(b, placed);
  t.error = sim.error;
  t.stats = sim.stats;
  t.route = sim.route;
  t.holdT = sim.holdT;
  t.speeds = sim.speeds;
  t.pieceT = sim.pieceT;
  t.stallIndex = sim.stallIndex;
  t.lapTicks = sim.lapTicks;
  t.ok = t.closed && sim.error === null && sim.stats !== null;
}

export function trackTiles(b: Building): Tile[] {
  return b.track ? b.track.placed.map((p) => ({ x: p.x, y: p.y })) : [];
}

/** 건물 풋프린트 + 트랙이 차지하는 모든 타일 */
export function buildingTiles(b: Building): Tile[] {
  const out: Tile[] = [];
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) out.push({ x, y });
  return out.concat(trackTiles(b));
}

interface Sim {
  error: string | null; stats: CoasterStats | null; route: RoutePoint[]; holdT: number;
  speeds: number[]; pieceT: [number, number][]; stallIndex: number | null; lapTicks: number;
}

function simulate(b: Building, placed: PlacedPiece[]): Sim {
  const P = PHYSICS;
  const station = stationTiles(b);
  const dir = b.rot % 4;
  const [sdx, sdy] = DIRS[dir];

  let e = P.startE;
  let error: string | null = null;
  let stallIndex: number | null = null;
  let brakes = 0;
  let loops = 0;
  const speeds: number[] = [];
  let maxV = Math.sqrt(e);
  let maxHeight = 0;
  let runMax = 0;
  let maxDrop = 0;
  let turns = 0;
  let fastTurns = 0;
  let turnRun = 0;
  let lastTurn = '';
  let maxTurnRun = 0;
  let hillChanges = 0;

  placed.forEach((p, i) => {
    switch (p.type) {
      case 'up': e -= P.slopeE; break;
      case 'down': e += P.slopeE; break;
      case 'lift': e = P.liftE; break;
      case 'brake': e = Math.min(e, P.brakeE); brakes++; break;
      case 'loop':
        if (e < P.loopMinE && error === null) {
          error = `${i + 1}번째 조각: 속도가 부족해 루프를 못 넘음`;
          stallIndex = i;
        }
        e -= P.loopE;
        loops++;
        break;
      default: break;
    }
    if (p.type !== 'lift') e -= P.frictionE;
    if (e < P.minE && error === null) {
      error = `${i + 1}번째 조각에서 열차가 멈춥니다 (리프트나 내리막이 필요합니다)`;
      stallIndex = i;
    }
    e = Math.max(e, P.minE);
    const v = Math.sqrt(e);
    speeds.push(v);
    maxV = Math.max(maxV, v);

    maxHeight = Math.max(maxHeight, p.hOut);
    runMax = Math.max(runMax, p.hOut);
    maxDrop = Math.max(maxDrop, runMax - p.hOut);
    if (p.type === 'up' || p.type === 'down' || p.type === 'lift') hillChanges++;
    if (p.type === 'left' || p.type === 'right') {
      turns++;
      if (v > 1.4) fastTurns++;
      turnRun = lastTurn === p.type ? turnRun + 1 : 1;
      lastTurn = p.type;
      maxTurnRun = Math.max(maxTurnRun, turnRun);
    } else {
      turnRun = 0;
      lastTurn = '';
    }
  });

  // 경로: 역 진입 가장자리 → 역 세 칸 → 조각마다 (중심, 출구 가장자리)
  const pts: { x: number; y: number; h: number; w: number }[] = [];
  const add = (x: number, y: number, h: number, speed: number, from?: { x: number; y: number }): void => {
    const w = from ? Math.hypot(x - from.x, y - from.y) / Math.max(speed, 0.3) : 0;
    pts.push({ x, y, h, w });
  };
  const sv = Math.sqrt(P.startE);
  const base = b.baseH ?? 0;
  add(station[0].x + 0.5 - sdx * 0.5, station[0].y + 0.5 - sdy * 0.5, base, sv);
  for (const s of station) add(s.x + 0.5, s.y + 0.5, base, sv, pts[pts.length - 1]);
  const lastS = station[2];
  add(lastS.x + 0.5 + sdx * 0.5, lastS.y + 0.5 + sdy * 0.5, base, sv, pts[pts.length - 1]);
  const holdIdx = 2; // 두 번째 역 칸 중심(선두가 서는 곳)
  const pieceIdx: [number, number][] = [];
  placed.forEach((p, i) => {
    const v = speeds[i];
    const [odx, ody] = DIRS[p.dirOut];
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    const hMid = (p.hIn + p.hOut) / 2;
    const first = pts.length;
    // 입구 가장자리는 이전 조각의 출구 가장자리와 같은 점이라 건너뛴다
    if (p.type === 'loop') {
      // 수직 원: 아래에서 앞으로 올라가 꼭대기에서 뒤집힌 뒤 내려와 앞으로 빠져나간다
      const N = 12;
      for (let k = 0; k <= N; k++) {
        const th = (k / N) * Math.PI * 2;
        const along = 0.42 * Math.sin(th);
        add(cx + odx * along, cy + ody * along, p.hIn + (1 - Math.cos(th)) * (LOOP_RISE / 2), v, pts[pts.length - 1]);
      }
    } else {
      add(cx, cy, hMid, v, pts[pts.length - 1]);
    }
    add(cx + odx * 0.5, cy + ody * 0.5, p.hOut, v, pts[pts.length - 1]);
    pieceIdx.push([first, pts.length - 1]);
  });
  // 닫힌 코스라면 마지막 점이 역의 입구 가장자리(첫 점)와 같은 위치다
  const total = pts.reduce((s, p) => s + p.w, 0) || 1;
  let acc = 0;
  const route: RoutePoint[] = pts.map((p) => {
    acc += p.w;
    return { x: p.x, y: p.y, h: p.h, t: acc / total };
  });
  const holdT = route[holdIdx]?.t ?? 0;
  const pieceT = pieceIdx.map(([a, b2]): [number, number] => [route[Math.max(0, a - 1)].t, route[b2].t]);
  const ticks = total * P.tileTicks;
  const lapTicks = clamp(Math.round(ticks), 60, 900);

  if (placed.length === 0) return { error, stats: null, route, holdT, speeds, pieceT, stallIndex, lapTicks };
  const stats: CoasterStats = {
    length: placed.length,
    maxSpeed: Math.round(maxV * P.kmh),
    maxDrop,
    maxHeight: Math.max(0, maxHeight - base),
    turns,
    loops,
    fun: clamp(Math.round(15 + 0.8 * placed.length + 5 * maxDrop + 1.5 * turns + 1.5 * maxHeight + 12 * Math.min(loops, 3)), 5, 100),
    // 브레이크는 열차를 달래 줘서 조각 하나당 강도를 5 깎는다(최대 3개)
    intensity: clamp(Math.round((maxV - 0.9) * 45 + maxDrop * 4 + fastTurns * 3 + 10 * Math.min(loops, 3) - 5 * Math.min(brakes, 3)), 0, 100),
    nausea: clamp(Math.round(turns * 1.5 + maxTurnRun * 7 + hillChanges * 0.5 + 8 * loops), 0, 100),
    duration: lapTicks,
  };
  return { error, stats, route, holdT, speeds, pieceT, stallIndex, lapTicks };
}

/** 열차 경로 위 비율 t(0~1)의 위치 */
export function routeAt(route: readonly RoutePoint[], t: number): { x: number; y: number; h: number } {
  if (route.length === 0) return { x: 0, y: 0, h: 0 };
  const tt = clamp(t, 0, 1);
  let i = 1;
  while (i < route.length - 1 && route[i].t < tt) i++;
  const a = route[i - 1];
  const b = route[i];
  const span = b.t - a.t;
  const f = span > 0 ? clamp((tt - a.t) / span, 0, 1) : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f };
}

/**
 * 건물의 실제 정의. 롤러코스터는 완성된 트랙에서 계산한 값(재미·운행 시간·비용·유지비)을
 * 기본 정의에 덮어쓴다. 그 밖의 건물은 getDef 그대로.
 */
export function buildingDef(b: Building): BuildingDef {
  const base = getDef(b.defId);
  const t = b.track;
  if (!t) return base;
  const upkeep = base.upkeep + PIECE_UPKEEP * t.pieces.length;
  if (!t.ok || !t.stats) return { ...base, cost: t.spent, upkeep, fun: 0 };
  return {
    ...base,
    cost: t.spent,
    upkeep,
    fun: t.stats.fun,
    intensity: t.stats.intensity,
    nausea: t.stats.nausea,
    duration: t.stats.duration,
  };
}
