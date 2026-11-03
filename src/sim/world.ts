import { Rng } from '../core/rng';
import type { Guest } from './guest';
import { TileMap, type Tile } from './map';
import type { Track } from './coaster';
import { START_FEE } from './economy';
import { PathNetwork } from './pathfinding';
import { newTutorial, type TutorialState } from './tutorial';

export const START_MONEY = 10000;

export interface Building {
  id: number;
  defId: string;
  /** 회전 후 풋프린트의 좌상단(최소 x, y)과 크기 */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  entrance: Tile;
  /** 입구 앞 대기열(손님 id, 앞이 먼저) */
  queue: number[];
  /** 이용 중인 손님 id */
  inside: number[];
  /** 놀이기구 사이클 단계 (매점은 항상 'idle') */
  phase: 'idle' | 'loading' | 'running';
  timer: number;
  /** 현재 이용 요금(플레이어가 조정) */
  price: number;
  /** 누적 이용 손님 수 / 누적 수익 */
  served: number;
  income: number;
  /** 롤러코스터의 트랙(역 건물에만 있다) */
  track?: Track;
}

/** playing: 목표 진행 중 / won·lost: 종료(시뮬레이션 정지) / sandbox: 목표 없이 계속 */
export type GameStatus = 'playing' | 'won' | 'lost' | 'sandbox';

export type LedgerKey = 'entrance' | 'rides' | 'shops' | 'construction' | 'upkeep';
export type Ledger = Record<LedgerKey, number>;

export interface MonthReport {
  year: number;
  month: number;
  ledger: Ledger;
  net: number;
  /** 월말 보유 금액 / 평점 / 손님 수 */
  money: number;
  rating: number;
  guests: number;
  /** 그 달에 입장한 손님 수 */
  entered: number;
}

export interface RatingParts {
  base: number;
  satisfaction: number;
  variety: number;
  flow: number;
  complaints: number;
}

const emptyLedger = (): Ledger => ({ entrance: 0, rides: 0, shops: 0, construction: 0, upkeep: 0 });

export class World {
  readonly map = new TileMap();
  readonly network = new PathNetwork(this.map);
  money = START_MONEY;
  readonly buildings = new Map<number, Building>();
  nextBuildingId = 1;

  guests: Guest[] = [];
  /** 틱마다 재구성되는 id 조회용(저장 대상 아님) */
  guestById = new Map<number, Guest>();
  nextGuestId = 1;
  /** 시뮬레이션 틱 카운터 */
  tick = 0;
  rng = new Rng(12345);
  stats = { entered: 0, left: 0, peakGuests: 0 };

  status: GameStatus = 'playing';
  /** 종료 사유(결과 화면에 표시) */
  endReason = '';
  /** 목표 조건을 연속으로 만족한 틱 수 */
  goalHold = 0;
  /** 잔고가 마이너스로 하루를 마친 연속 일수 */
  debtDays = 0;

  /** 입장료(플레이어가 조정) */
  entranceFee = START_FEE;
  /** 이번 달 수입/지출 장부 */
  ledger: Ledger = emptyLedger();
  reports: MonthReport[] = [];
  /** 이번 달 시작 시점의 누적 입장 수 */
  monthStartEntered = 0;
  /** 초반 안내 진행 상황 */
  tutorial: TutorialState = newTutorial();
  /** 공원 평점(0~1000, 천천히 변동) */
  rating = 400;
  ratingParts: RatingParts = { base: 0, satisfaction: 0, variety: 0, flow: 0, complaints: 0 };

  /** 돈을 증감하고 장부에 기록 */
  transact(key: LedgerKey, amount: number): void {
    this.money += amount;
    this.ledger[key] += amount;
  }

  resetLedger(): void {
    this.ledger = emptyLedger();
  }

  /** 다른 World의 상태를 이 인스턴스로 옮긴다(불러오기/새 게임). 외부가 쥔 참조(map, network 등)를 유지하기 위해 제자리에서 교체. */
  adopt(src: World): void {
    this.map.path.set(src.map.path);
    this.map.occupant.set(src.map.occupant);
    this.map.scenery.set(src.map.scenery);
    this.map.version++; // 길찾기 캐시 무효화
    this.money = src.money;
    this.buildings.clear();
    for (const [id, b] of src.buildings) this.buildings.set(id, b);
    this.nextBuildingId = src.nextBuildingId;
    this.guests = src.guests;
    // 저장된 경로는 불러온 길 구성에 대해 유효하므로, 새 버전에 맞춰 다시 계산되지 않게 한다
    for (const g of this.guests) g.pathVersion = this.map.version;
    this.guestById = new Map();
    this.nextGuestId = src.nextGuestId;
    this.tick = src.tick;
    this.rng.state = src.rng.state;
    this.stats = src.stats;
    this.entranceFee = src.entranceFee;
    this.ledger = src.ledger;
    this.reports = src.reports;
    this.monthStartEntered = src.monthStartEntered;
    this.rating = src.rating;
    this.ratingParts = src.ratingParts;
    this.status = src.status;
    this.endReason = src.endReason;
    this.goalHold = src.goalHold;
    this.debtDays = src.debtDays;
    this.tutorial = src.tutorial;
  }
}
