import { Rng } from '../core/rng';
import type { Guest } from './guest';
import { TileMap, type Tile } from './map';
import { PathNetwork } from './pathfinding';

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
}

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
  stats = { entered: 0, left: 0 };

  /** 입장료(플레이어가 조정) */
  entranceFee = 10;
  /** 이번 달 수입/지출 장부 */
  ledger: Ledger = emptyLedger();
  reports: MonthReport[] = [];
  /** 이번 달 시작 시점의 누적 입장 수 */
  monthStartEntered = 0;
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
}
