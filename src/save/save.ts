import { getDef } from '../data';
import { sceneryDef } from '../data/scenery';
import { MAX_LEVEL, restoreTrack, type TrackType } from '../sim/coaster';
import { claimLoadedTracks } from '../sim/trackedit';
import type { Guest } from '../sim/guest';
import { STAFF_KINDS, type Staff } from '../sim/staff';
import { STEP_IDS, type TutorialState } from '../sim/tutorial';
import { MISSION_IDS, type MissionState } from '../sim/missions';
import { cleanParkName } from '../sim/park';
import { MAX_REVIEWS, type Review } from '../sim/reviews';
import { eventAtTick, type Fireworks } from '../sim/events';
import { MAX_TERRAIN, type Tile } from '../sim/map';
import { DEFAULT_WEATHER_SEED, weatherAtTick, type Weather } from '../sim/weather';
import {
  emptyLedger, type Building, type GameStatus, type Ledger, type MonthReport, type RatingParts, World,
} from '../sim/world';

/** 저장 형식 버전. 형식을 바꾸면 올리고 migrate에서 이전 버전을 변환한다. */
export const SAVE_VERSION = 4;
export const SAVE_KEY = 'park-builder-save';
export const BACKUP_KEY = 'park-builder-save.bak';

/** 걷는 손님의 경로는 [x0, y0, x1, y1, ...]로 납작하게 저장 */
interface GuestSave extends Omit<Guest, 'path' | 'trash' | 'umbrella'> {
  path: number[];
  /** v4에서 추가. 없으면 0 */
  trash?: number;
  /** v4에서 추가. 없으면 false */
  umbrella?: boolean;
}

/** 직원도 걷는 중일 때만 경로를 저장한다 */
interface StaffSave extends Omit<Staff, 'path'> {
  path: number[];
}

/** 코스터 트랙은 조각 목록과 지출만 저장하고 나머지는 불러올 때 다시 계산한다 */
interface BuildingSave extends Omit<Building, 'track' | 'reliability' | 'broken' | 'brokenTicks' | 'cycles'> {
  /** 정비 기능 이전 저장본에는 없다 */
  reliability?: number;
  broken?: boolean;
  brokenTicks?: number;
  cycles?: number;
  track?: { pieces: TrackType[]; spent: number };
}

export interface SaveData {
  version: number;
  savedAt: number;
  width: number;
  height: number;
  /** 길 레이어: '0'/'1' 문자열 */
  path: string;
  /** v3에서 추가. 장식 레이어: 타일마다 kind 한 글자('0' = 없음). 없으면(이전 저장본) 새 맵의 기본 숲을 쓴다 */
  scenery?: string;
  /** v4에서 추가. 쓰레기 레이어: 타일마다 0~3 한 글자. 없으면 깨끗한 공원 */
  litter?: string;
  /** 지형 높이 레이어: 타일마다 0~4 한 글자. 없으면(이전 저장본) 평지. 키 이름이 `height`가 아닌 것은 맵 세로 크기와 겹치기 때문 */
  terrain?: string;
  tick: number;
  money: number;
  rngState: number;
  nextBuildingId: number;
  nextGuestId: number;
  entranceFee: number;
  rating: number;
  ratingParts: RatingParts;
  ledger: Ledger;
  reports: MonthReport[];
  monthStartEntered: number;
  stats: { entered: number; left: number; peakGuests: number; vips?: number; lost?: number; reunited?: number; lostGone?: number; families?: number };
  status: GameStatus;
  endReason: string;
  goalHold: number;
  debtDays: number;
  buildings: BuildingSave[];
  guests: GuestSave[];
  /** v2에서 추가. 없으면(이전 저장본) 안내를 이미 끝낸 것으로 본다 */
  tutorial?: TutorialState;
  missions?: MissionState;
  parkName?: string;
  reviews?: Review[];
  fireworks?: Fireworks | null;
  lastFireworksDay?: number;
  /** v4에서 추가. 없으면 직원 없음 */
  staff?: StaffSave[];
  nextStaffId?: number;
  /** v4에서 추가. 없으면 기본 시드, 날씨는 틱에서 다시 계산 */
  weatherSeed?: number;
  weather?: Weather;
}

const flatten = (path: readonly Tile[]): number[] => path.flatMap((t) => [t.x, t.y]);
function unflatten(flat: number[]): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

export function serializeWorld(world: World): SaveData {
  const m = world.map;
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    width: m.width,
    height: m.height,
    path: Array.from(m.path, (v) => (v ? '1' : '0')).join(''),
    scenery: Array.from(m.scenery, (v) => String(v)).join(''),
    litter: Array.from(m.litter, (v) => String(v)).join(''),
    terrain: Array.from(m.terrain, (v) => String(v)).join(''),
    tick: world.tick,
    money: world.money,
    rngState: world.rng.state,
    weatherSeed: world.weatherSeed,
    weather: { ...world.weather },
    nextBuildingId: world.nextBuildingId,
    nextGuestId: world.nextGuestId,
    nextStaffId: world.nextStaffId,
    entranceFee: world.entranceFee,
    parkName: world.parkName,
    reviews: world.reviews.map((r) => ({ ...r })),
    rating: world.rating,
    ratingParts: world.ratingParts,
    ledger: world.ledger,
    reports: world.reports,
    monthStartEntered: world.monthStartEntered,
    stats: world.stats,
    status: world.status,
    endReason: world.endReason,
    goalHold: world.goalHold,
    debtDays: world.debtDays,
    tutorial: { completed: [...world.tutorial.completed] },
    missions: { completed: [...world.missions.completed] },
    fireworks: world.fireworks ? { ...world.fireworks } : null,
    lastFireworksDay: world.lastFireworksDay,
    buildings: [...world.buildings.values()].map(({ track, ...b }): BuildingSave => (
      track ? { ...b, track: { pieces: [...track.pieces], spent: track.spent } } : b
    )),
    staff: world.staff.map((s) => ({
      ...s,
      tile: { ...s.tile },
      target: s.target ? { ...s.target } : null,
      path: s.state === 'walking' ? flatten(s.path) : [],
    })),
    guests: world.guests.map((g) => ({
      ...g,
      // 이동 중이 아니면 경로는 필요 없다(필요할 때 다시 계산)
      path: g.state === 'walking' || g.state === 'leaving' ? flatten(g.path) : [],
    })),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** SaveData → 새 World. 형식이 올바르지 않으면 Error를 던진다. */
export function deserializeWorld(data: SaveData): World {
  const w = new World();
  const m = w.map;
  if (data.width !== m.width || data.height !== m.height) throw new Error('map size mismatch');
  if (typeof data.path !== 'string' || data.path.length !== m.width * m.height) throw new Error('bad path layer');
  for (const k of ['tick', 'money', 'rngState', 'nextBuildingId', 'nextGuestId', 'entranceFee', 'rating', 'monthStartEntered', 'goalHold', 'debtDays'] as const) {
    if (!isNum(data[k])) throw new Error(`bad field: ${k}`);
  }
  if (!Array.isArray(data.buildings) || !Array.isArray(data.guests) || !Array.isArray(data.reports)) throw new Error('bad lists');
  if (!['playing', 'won', 'lost', 'sandbox'].includes(data.status)) throw new Error('bad status');

  for (let i = 0; i < data.path.length; i++) m.path[i] = data.path[i] === '1' ? 1 : 0;
  m.path[m.index(m.gate.x, m.gate.y)] = 1;
  if (data.scenery !== undefined) {
    if (typeof data.scenery !== 'string' || data.scenery.length !== m.width * m.height) throw new Error('bad scenery layer');
    for (let i = 0; i < data.scenery.length; i++) {
      const k = data.scenery.charCodeAt(i) - 48;
      m.scenery[i] = sceneryDef(k) ? k : 0;
    }
  }

  if (data.litter !== undefined) {
    if (typeof data.litter !== 'string' || data.litter.length !== m.width * m.height) throw new Error('bad litter layer');
    for (let i = 0; i < data.litter.length; i++) {
      const k = data.litter.charCodeAt(i) - 48;
      m.litter[i] = m.path[i] === 1 && k >= 1 && k <= 3 ? k : 0;
    }
  }

  // 지형은 길·건물·트랙 검사보다 먼저 읽는다(트랙의 땅속 검사에 쓰인다). 없으면 평지
  if (data.terrain !== undefined) {
    if (typeof data.terrain !== 'string' || data.terrain.length !== m.width * m.height) throw new Error('bad terrain layer');
    for (let i = 0; i < data.terrain.length; i++) {
      const k = data.terrain.charCodeAt(i) - 48;
      if (!(k >= 0 && k <= MAX_TERRAIN)) throw new Error('bad terrain layer');
      m.terrain[i] = k;
    }
  }

  for (const b of data.buildings) {
    getDef(b.defId); // 알 수 없는 건물이면 throw
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        if (!m.inBounds(x, y) || m.occupant[m.index(x, y)] !== 0) throw new Error('bad building footprint');
        m.occupant[m.index(x, y)] = b.id;
      }
    }
    const { track: savedTrack, ...rest } = b;
    const building: Building = {
      ...rest,
      queue: [...b.queue],
      inside: [...b.inside],
      // 신뢰도·고장 필드가 생기기 전(v1~v4 초기)의 저장본은 새 기구처럼 읽는다
      reliability: isNum(b.reliability) ? Math.max(0, Math.min(100, b.reliability)) : 100,
      broken: b.broken === true,
      brokenTicks: isNum(b.brokenTicks) ? b.brokenTicks : 0,
      cycles: isNum(b.cycles) ? b.cycles : 0,
      level: isNum(b.level) ? Math.max(1, Math.min(MAX_LEVEL, Math.round(b.level))) : undefined,
    };
    if (savedTrack) {
      // 트랙 상태를 다시 계산한다. 다른 건물과의 충돌 검사·지면 점유는 모든 건물을 읽은 뒤에 한다
      building.track = restoreTrack(building, savedTrack.pieces, savedTrack.spent);
    }
    w.buildings.set(b.id, building);
  }
  claimLoadedTracks(w);
  // 길·건물·트랙 아래에는 장식이 있을 수 없다(이전 저장본에 기본 숲을 깔았을 때 겹친 것 정리)
  for (let i = 0; i < m.scenery.length; i++) if (m.path[i] === 1 || m.occupant[i] !== 0) m.scenery[i] = 0;

  w.guests = data.guests.map((g) => ({
    ...g,
    path: unflatten(g.path),
    // 길 구성 버전은 저장하지 않으므로, 저장된 경로를 현재(불러온) 길 구성에 대해 유효한 것으로 취급
    pathVersion: m.version,
    needs: { ...g.needs },
    tile: { ...g.tile },
    visited: [...g.visited],
    // 이 필드가 생기기 전의 저장본도 읽을 수 있게 기본값 지정
    thought: g.thought ?? null,
    thoughtTimer: g.thoughtTimer ?? 0,
    trash: g.trash ?? 0,
    umbrella: g.umbrella === true,
    gripe: typeof g.gripe === 'string' ? g.gripe : undefined,
    leaveReason: typeof g.leaveReason === 'string' ? g.leaveReason : undefined,
    vip: g.vip && typeof g.vip.wish === 'string' && isNum(g.vip.until) ? { wish: g.vip.wish, until: g.vip.until, done: g.vip.done === true } : undefined,
    // 가족 손님(이 필드가 없는 예전 저장본은 모두 혼자 온 손님)
    kids: Array.isArray(g.kids) ? g.kids.filter(isNum) : undefined,
    trip: isNum(g.trip) ? g.trip : undefined,
    kid: g.kid === true ? true : undefined,
    leader: isNum(g.leader) ? g.leader : undefined,
    followed: isNum(g.followed) ? g.followed : undefined,
    lostUntil: isNum(g.lostUntil) ? g.lostUntil : undefined,
    goHome: g.goHome === true ? true : undefined,
  }));

  w.staff = (data.staff ?? []).map((s) => {
    // 서 있던 길이 없거나 좌표가 이상하면 입구에서 다시 시작
    const onPath = isNum(s.tile?.x) && isNum(s.tile?.y) && m.isPath(s.tile.x, s.tile.y);
    const home = onPath ? s.tile : m.gate;
    const reset = !onPath || !isNum(s.x) || !isNum(s.y);
    return {
      ...s,
      kind: STAFF_KINDS.includes(s.kind) ? s.kind : 'janitor',
      x: reset ? home.x + 0.5 : s.x,
      y: reset ? home.y + 0.5 : s.y,
      px: reset ? home.x + 0.5 : s.px ?? s.x,
      py: reset ? home.y + 0.5 : s.py ?? s.y,
      tile: { ...home },
      path: unflatten(s.path ?? []),
      pathIdx: s.pathIdx ?? 0,
      pathVersion: m.version,
      state: reset ? 'idle' : s.state,
      target: reset || !s.target ? null : { ...s.target },
      timer: s.timer ?? 0,
      job: s.job === 'repair' || s.job === 'inspect' ? s.job : undefined,
    } satisfies Staff;
  });
  w.nextStaffId = isNum(data.nextStaffId) ? data.nextStaffId : w.staff.reduce((a, s) => Math.max(a, s.id + 1), 1);

  w.tick = data.tick;
  w.weatherSeed = isNum(data.weatherSeed) ? data.weatherSeed >>> 0 : DEFAULT_WEATHER_SEED;
  const wk = data.weather;
  w.weather =
    wk && (wk.kind === 'sunny' || wk.kind === 'cloudy' || wk.kind === 'rain') && isNum(wk.untilTick)
      ? { kind: wk.kind, untilTick: wk.untilTick }
      : weatherAtTick(w.weatherSeed, w.tick);
  w.money = data.money;
  w.rng.state = data.rngState >>> 0;
  w.nextBuildingId = data.nextBuildingId;
  w.nextGuestId = data.nextGuestId;
  w.entranceFee = data.entranceFee;
  w.rating = data.rating;
  w.ratingParts = { ...data.ratingParts, cleanliness: data.ratingParts.cleanliness ?? 100 };
  // v4 이전 저장본에는 급여(wages) 항목이 없다
  w.ledger = { ...emptyLedger(), ...data.ledger };
  w.reports = data.reports.map((r) => ({ ...r, ledger: { ...emptyLedger(), ...r.ledger } }));
  w.monthStartEntered = data.monthStartEntered;
  w.stats = { vips: 0, lost: 0, reunited: 0, lostGone: 0, families: 0, ...data.stats };
  w.status = data.status;
  w.endReason = String(data.endReason ?? '');
  w.goalHold = data.goalHold;
  w.debtDays = data.debtDays;
  // 안내 진행 상황이 없는 저장본은 이미 하던 공원이므로 초보 안내를 다시 보여 주지 않는다
  w.tutorial = {
    completed: Array.isArray(data.tutorial?.completed)
      ? data.tutorial.completed.filter((id): id is string => STEP_IDS.includes(id))
      : [...STEP_IDS],
  };
  const fw = data.fireworks;
  w.fireworks = fw && isNum(fw.start) && isNum(fw.end) && isNum(fw.x) && isNum(fw.y) ? { ...fw } : null;
  w.lastFireworksDay = isNum(data.lastFireworksDay) ? data.lastFireworksDay : -1;
  w.event = eventAtTick(w.weatherSeed, w.tick);
  w.parkName = typeof data.parkName === 'string' ? cleanParkName(data.parkName) : '';
  w.reviews = Array.isArray(data.reviews)
    ? data.reviews
      .filter((r) => r && isNum(r.guestId) && isNum(r.stars) && isNum(r.tick) && typeof r.name === 'string' && typeof r.text === 'string')
      .map((r) => ({ guestId: r.guestId, name: r.name, stars: Math.max(1, Math.min(5, Math.round(r.stars))), text: r.text, tick: r.tick }))
      .slice(-MAX_REVIEWS)
    : [];
  w.missions = {
    completed: Array.isArray(data.missions?.completed)
      ? data.missions.completed.filter((id): id is string => MISSION_IDS.includes(id))
      : [],
  };
  return w;
}

/**
 * 이전 버전 저장을 현재 형식으로 변환. 지원하지 않는 버전이면 null.
 * v1 → v2: 트랙 필드 추가 / v2 → v3: 장식 레이어 추가 / v3 → v4: 쓰레기 레이어·직원·급여 추가.
 * 모두 선택 필드라 그대로 읽는다(없으면 기본값).
 */
function migrate(data: { version?: unknown }): SaveData | null {
  return data.version === SAVE_VERSION || data.version === 1 || data.version === 2 || data.version === 3 ? (data as SaveData) : null;
}

export type LoadResult =
  | { ok: true; world: World; savedAt: number }
  | { ok: false; reason: 'empty' | 'corrupt' | 'version' | 'unavailable' };

/** 문자열 → World. 실패 사유를 구분해서 돌려준다. */
export function parseSave(raw: string): LoadResult {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (typeof obj !== 'object' || obj === null) return { ok: false, reason: 'corrupt' };
  const data = migrate(obj as { version?: unknown });
  if (!data) return { ok: false, reason: 'version' };
  try {
    return { ok: true, world: deserializeWorld(data), savedAt: isNum(data.savedAt) ? data.savedAt : 0 };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

/** localStorage 대용으로 주입 가능한 최소 인터페이스 */
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 사생활 보호 모드 등에서 접근 자체가 throw할 수 있으므로 감싼다 */
export function defaultStorage(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveToStorage(world: World, storage: KV | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serializeWorld(world)));
    return true;
  } catch {
    return false; // 용량 초과 등
  }
}

/** 저장본을 읽는다. 읽을 수 없는 저장본은 덮어써지기 전에 백업 키로 보존한다. */
export function loadFromStorage(storage: KV | null = defaultStorage()): LoadResult {
  if (!storage) return { ok: false, reason: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (raw === null) return { ok: false, reason: 'empty' };
  const result = parseSave(raw);
  if (!result.ok) {
    try { storage.setItem(BACKUP_KEY, raw); } catch { /* 백업 실패는 무시 */ }
  }
  return result;
}

export function clearSave(storage: KV | null = defaultStorage()): void {
  try { storage?.removeItem(SAVE_KEY); } catch { /* 무시 */ }
}
