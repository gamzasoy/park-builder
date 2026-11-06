import { Rng } from '../core/rng';
import { getDef } from '../data';
import { OAK, PINE } from '../data/scenery';
import { lineTiles, placeBuilding, placePaths } from './building';
import { DAY_TICKS, DAYS_PER_MONTH, fairPrice } from './economy';
import { MAX_TERRAIN, tileHash, type TileMap } from './map';
import { World } from './world';

/**
 * 시나리오 맵: 공원마다 다른 땅·시작 자금·목표.
 * 목표는 기한(개월) 안에 손님 수와 평점(그리고 있으면 잔고)을 동시에 달성해 하루 동안 유지하는 것.
 * 깨면 남은 기간에 따라 별 1~3개를 받는다.
 */
export interface Scenario {
  id: string;
  icon: string;
  name: string;
  /** 고르는 화면에 보이는 한두 줄 설명 */
  desc: string;
  money: number;
  months: number;
  guests: number;
  rating: number;
  /** 있으면 이 잔고도 함께 유지해야 한다 */
  goalMoney?: number;
  /** 새 공원의 땅·건물을 꾸민다(시작 자금은 그 뒤에 맞춘다) */
  setup?: (w: World) => void;
}

export const DEFAULT_SCENARIO = 'meadow';

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'meadow',
    icon: '🌳',
    name: '초원 공원',
    desc: '평평한 들판에서 처음부터 시작합니다. 처음이라면 여기서!',
    money: 20000,
    months: 4,
    guests: 100,
    rating: 650,
  },
  {
    id: 'hills',
    icon: '🏔️',
    name: '산골 공원',
    desc: '언덕투성이 땅. 건물은 평평한 곳에만 지을 수 있으니 지형을 다듬거나 언덕을 활용하세요.',
    money: 22000,
    months: 4,
    guests: 90,
    rating: 650,
    setup: setupHills,
  },
  {
    id: 'forest',
    icon: '🌲',
    name: '숲속 공원',
    desc: '울창한 숲이라 경치는 최고지만 자금이 빠듯하고 기한도 짧아요.',
    money: 12000,
    months: 3,
    guests: 70,
    rating: 600,
    setup: setupForest,
  },
  {
    id: 'revival',
    icon: '🏚️',
    name: '망해 가는 공원',
    desc: '낡고 더럽고 비싼 공원을 인수했어요. 고장 난 기구, 쓰레기, 바가지 요금을 바로잡아 평점을 살리세요.',
    money: 3000,
    months: 3,
    guests: 120,
    rating: 750,
    setup: setupRevival,
  },
  {
    id: 'tycoon',
    icon: '💰',
    name: '황금 공원',
    desc: '최고 난도. 반년 안에 손님 150명·평점 700에 잔고 ₩50,000까지 모아야 합니다.',
    money: 25000,
    months: 6,
    guests: 150,
    rating: 700,
    goalMoney: 50000,
  },
];

export function scenarioById(id: string | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** 공원의 시나리오(모르는 id면 기본 초원) */
export function scenarioOf(world: World): Scenario {
  return scenarioById(world.scenario) ?? SCENARIOS[0];
}

export const deadlineTicks = (s: Scenario): number => s.months * DAYS_PER_MONTH * DAY_TICKS;

/** 깬 시점에 남은 기간 비율로 별점: 절반 이상 남으면 3개, 4분의 1 이상이면 2개, 아니면 1개 */
export function starsFor(s: Scenario, tick: number): 1 | 2 | 3 {
  const left = 1 - tick / deadlineTicks(s);
  return left >= 0.5 ? 3 : left >= 0.25 ? 2 : 1;
}

/** 시나리오의 새 공원. seed는 날씨·손님 RNG와 산골 지형 모양을 정한다 */
export function createScenarioWorld(id: string, seed: number): World {
  const s = scenarioById(id) ?? SCENARIOS[0];
  const w = new World();
  w.rng = new Rng(seed);
  w.weatherSeed = seed >>> 0;
  w.scenario = s.id;
  w.money = 1_000_000; // 꾸미는 동안 쓰는 돈은 세지 않는다
  s.setup?.(w);
  w.money = s.money;
  w.resetLedger();
  return w;
}

// ---- 맵 꾸미기 ----

/** 입구 근처(아래쪽 6줄, 입구 좌우 8칸)는 평지로 남긴다 */
function nearGate(m: TileMap, x: number, y: number): boolean {
  return y >= m.height - 6 && Math.abs(x - m.gate.x) <= 8;
}

/**
 * 산골: 겹친 물결로 0~4 높이를 만든 뒤, 이웃 칸과 1단계 넘게 차이 나지 않도록 깎는다
 * (각 칸 = min(자기, 이웃 + 1)을 수렴할 때까지 반복하면 모든 이웃 차이가 1 이하가 된다).
 */
export function setupHills(w: World): void {
  const m = w.map;
  const salt = w.weatherSeed % 1000;
  const a = tileHash(salt, 1) * Math.PI * 2;
  const b = tileHash(salt, 2) * Math.PI * 2;
  const h = new Float64Array(m.width * m.height);
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const v = 2 + 1.6 * Math.sin(x * 0.21 + a) * Math.cos(y * 0.17 + b) + 1.1 * Math.sin((x + y) * 0.11 + b) + (tileHash(x, y, salt) - 0.5) * 0.6;
      h[m.index(x, y)] = nearGate(m, x, y) ? 0 : Math.max(0, Math.min(MAX_TERRAIN, Math.round(v)));
    }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = m.index(x, y);
        let lim = h[i];
        if (x > 0) lim = Math.min(lim, h[i - 1] + 1);
        if (x < m.width - 1) lim = Math.min(lim, h[i + 1] + 1);
        if (y > 0) lim = Math.min(lim, h[i - m.width] + 1);
        if (y < m.height - 1) lim = Math.min(lim, h[i + m.width] + 1);
        if (lim < h[i]) { h[i] = lim; changed = true; }
      }
    }
  }
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) m.setHeight(x, y, h[m.index(x, y)]);
  // 높은 곳에는 침엽수가 듬성듬성
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = m.index(x, y);
      if (m.path[i] === 0 && h[i] >= 3 && tileHash(x, y, salt + 7) < 0.25) m.scenery[i] = PINE;
    }
  }
}

/** 숲속: 입구 앞 빈터와 군데군데 작은 빈터를 빼고 나무가 빽빽하다(건물·길을 지으면 나무는 저절로 치워진다) */
export function setupForest(w: World): void {
  const m = w.map;
  const salt = w.weatherSeed % 1000;
  const clearings = [{ x: m.gate.x, y: m.height - 7, r: 6 }];
  for (let i = 0; i < 4; i++) {
    clearings.push({ x: 8 + Math.floor(tileHash(salt, i, 3) * (m.width - 16)), y: 6 + Math.floor(tileHash(salt, i, 4) * (m.height - 20)), r: 3 + Math.floor(tileHash(salt, i, 5) * 3) });
  }
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = m.index(x, y);
      if (m.path[i] === 1) continue;
      if (clearings.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r)) { m.scenery[i] = 0; continue; }
      m.scenery[i] = tileHash(x, y, salt + 11) < 0.7 ? (tileHash(x, y, salt + 12) < 0.55 ? PINE : OAK) : 0;
    }
  }
}

/**
 * 망해 가는 공원: 길과 놀이기구 5개, 매점 2개가 이미 있다. 기구는 낡아 신뢰도가 낮고 하나는 고장,
 * 요금은 적정가의 두 배, 입장료도 비싸고, 길에는 쓰레기가 쌓여 있으며 평점은 바닥이다.
 */
export function setupRevival(w: World): void {
  const m = w.map;
  const gx = m.gate.x;
  placePaths(w, lineTiles(m.gate, { x: gx, y: 30 })); // 입구에서 북쪽 큰길
  placePaths(w, lineTiles({ x: gx - 10, y: 38 }, { x: gx + 10, y: 38 })); // 가로 길
  const put = (id: string, x: number, y: number, rot: number): void => {
    const b = placeBuilding(w, getDef(id), x, y, rot);
    if (!b) throw new Error(`revival layout: cannot place ${id}`);
    b.price = Math.min(100, fairPrice(getDef(id)) * 2);
    if (getDef(id).kind === 'ride') b.reliability = 35 + Math.floor(tileHash(x, y, 9) * 20);
  };
  put('carousel', gx - 8, 36, 0); // 입구 (gx-7, 38)
  put('teacups', gx + 5, 36, 0); // 입구 (gx+6, 38)
  put('bumper', gx - 5, 39, 2); // 입구 (gx-4, 38)
  put('haunted', gx + 2, 39, 2); // 입구 (gx+3, 38)
  put('wheel', gx + 1, 31, 3); // 입구 (gx, 32)
  put('burger', gx + 1, 44, 3); // 입구 (gx, 44)
  put('drinks', gx - 1, 42, 1); // 입구 (gx, 42)
  // 관람차는 고장 난 채로 인수
  for (const b of w.buildings.values()) {
    if (b.defId === 'wheel') { b.broken = true; b.reliability = 0; }
  }
  // 길마다 쓰레기
  for (let i = 0; i < m.path.length; i++) {
    const x = i % m.width, y = Math.floor(i / m.width);
    if (m.path[i] === 1 && !m.isGate(x, y)) m.litter[i] = tileHash(x, y, 21) < 0.6 ? 1 + Math.floor(tileHash(x, y, 22) * 3) : 0;
  }
  w.entranceFee = 30;
  w.rating = 220;
}
