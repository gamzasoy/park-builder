import { getDef } from '../data';
import { BIN, FLOWERS } from '../data/scenery';
import type { World } from './world';

/**
 * 보너스 미션: 본 목표와 별개로 공원을 키우며 하나씩 깨는 과제.
 * 목록 순서대로 ACTIVE_SLOTS개씩 진행 중이 되고, 달성하면 상금을 받고 다음 미션이 열린다.
 * 한 번 달성한 미션은 나중에 조건이 깨져도 유지된다.
 */
export interface Mission {
  id: string;
  title: string;
  /** 목표 수치(진행도가 이 이상이면 달성) */
  target: number;
  /** 진행도 표시 단위(예: '명', '종') */
  unit: string;
  reward: number;
  progress(world: World): number;
}

export interface MissionState {
  completed: string[];
}

export const newMissions = (): MissionState => ({ completed: [] });

/** 동시에 진행하는 미션 수 */
export const ACTIVE_SLOTS = 3;
/** 판정 주기(틱) */
export const MISSION_EVERY = 10;
/** 평균 행복 미션: 이 이상 손님이 있을 때만 센다 */
export const HAPPY_MIN_GUESTS = 30;

const operational = (w: World) => [...w.buildings.values()].filter((b) => w.network.isOperational(b));
const kindsOf = (w: World, kind: 'ride' | 'shop'): number =>
  new Set(operational(w).map((b) => getDef(b.defId)).filter((d) => d.kind === kind).map((d) => d.id)).size;
const countScenery = (w: World, kind: number): number => w.map.scenery.reduce((n, k) => n + (k === kind ? 1 : 0), 0);

export const MISSIONS: readonly Mission[] = [
  { id: 'guests30', title: '손님 30명 모으기', target: 30, unit: '명', reward: 800, progress: (w) => w.guests.length },
  { id: 'shops3', title: '매점 3종 운영하기', target: 3, unit: '종', reward: 600, progress: (w) => kindsOf(w, 'shop') },
  { id: 'rides3', title: '놀이기구 3종 운영하기', target: 3, unit: '종', reward: 1200, progress: (w) => kindsOf(w, 'ride') },
  { id: 'flowers10', title: '꽃밭 10곳 가꾸기', target: 10, unit: '곳', reward: 400, progress: (w) => countScenery(w, FLOWERS) },
  { id: 'staff3', title: '직원 3명 고용하기', target: 3, unit: '명', reward: 500, progress: (w) => w.staff.length },
  { id: 'entered200', title: '누적 입장객 200명', target: 200, unit: '명', reward: 1500, progress: (w) => w.stats.entered },
  { id: 'bins5', title: '쓰레기통 5개 놓기', target: 5, unit: '개', reward: 400, progress: (w) => countScenery(w, BIN) },
  { id: 'coaster', title: '롤러코스터 완성하기', target: 1, unit: '개', reward: 2000, progress: (w) => (operational(w).some((b) => b.track?.ok) ? 1 : 0) },
  { id: 'shops6', title: '매점 6종 운영하기', target: 6, unit: '종', reward: 1500, progress: (w) => kindsOf(w, 'shop') },
  {
    id: 'happy80', title: `손님 ${HAPPY_MIN_GUESTS}명 이상, 평균 행복 80`, target: 80, unit: '', reward: 2000,
    progress: (w) => (w.guests.length < HAPPY_MIN_GUESTS ? 0 : Math.floor(w.guests.reduce((a, g) => a + g.needs.happiness, 0) / w.guests.length)),
  },
  { id: 'rides6', title: '놀이기구 6종 운영하기', target: 6, unit: '종', reward: 3000, progress: (w) => kindsOf(w, 'ride') },
  { id: 'rating700', title: '평점 700 달성', target: 700, unit: '점', reward: 3000, progress: (w) => Math.round(w.rating) },
  { id: 'guests150', title: '손님 150명 모으기', target: 150, unit: '명', reward: 4000, progress: (w) => w.guests.length },
  { id: 'money30k', title: '잔고 ₩30,000 모으기', target: 30000, unit: '', reward: 3000, progress: (w) => Math.max(0, Math.floor(w.money)) },
  { id: 'entered1000', title: '누적 입장객 1,000명', target: 1000, unit: '명', reward: 5000, progress: (w) => w.stats.entered },
  { id: 'festivals2', title: '계절 축제 2번 열기', target: 2, unit: '번', reward: 2500, progress: (w) => w.stats.festivals ?? 0 },
];

export const MISSION_IDS: readonly string[] = MISSIONS.map((m) => m.id);

/** 지금 진행 중인 미션(달성하지 않은 것 중 앞에서부터 ACTIVE_SLOTS개) */
export function activeMissions(world: World): Mission[] {
  return MISSIONS.filter((m) => !world.missions.completed.includes(m.id)).slice(0, ACTIVE_SLOTS);
}

/** 진행 중인 미션을 판정해 달성한 것에 상금을 주고, 새로 달성한 미션을 반환 */
export function updateMissions(world: World): Mission[] {
  if (world.status === 'lost') return [];
  const done: Mission[] = [];
  for (const m of activeMissions(world)) {
    if (m.progress(world) < m.target) continue;
    world.missions.completed.push(m.id);
    world.transact('missions', m.reward);
    done.push(m);
  }
  return done;
}
