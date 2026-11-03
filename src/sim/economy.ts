import type { BuildingDef } from '../data/types';
import { buildingDef } from './coaster';
import type { Building, MonthReport, World } from './world';

/** 하루 = 600틱(1배속 60초), 한 달 = 10일(1배속 10분) */
export const DAY_TICKS = 600;
export const DAYS_PER_MONTH = 10;
export const MAX_PRICE = 100;
export const MAX_FEE = 50;
/** 새 게임의 입장료 */
export const START_FEE = 10;
const MAX_REPORTS = 24;

export interface GameDate { year: number; month: number; day: number }

/** 틱 → 달력(1년차 1월 1일부터) */
export function dateOf(tick: number): GameDate {
  const dayIndex = Math.floor(tick / DAY_TICKS);
  const monthIndex = Math.floor(dayIndex / DAYS_PER_MONTH);
  return {
    year: Math.floor(monthIndex / 12) + 1,
    month: (monthIndex % 12) + 1,
    day: (dayIndex % DAYS_PER_MONTH) + 1,
  };
}

/** 손님이 적정하다고 느끼는 이용 요금. 이보다 비싸면 외면한다. */
export function fairPrice(def: BuildingDef): number {
  return def.kind === 'ride' ? Math.round((def.fun ?? 50) * 0.2) : def.price;
}

export function dailyUpkeep(world: World): number {
  let sum = 0;
  for (const b of world.buildings.values()) sum += buildingDef(b).upkeep;
  return sum;
}

export function setPrice(b: Building, price: number): void {
  b.price = Math.max(0, Math.min(MAX_PRICE, Math.round(price)));
}

export function setEntranceFee(world: World, fee: number): void {
  world.entranceFee = Math.max(0, Math.min(MAX_FEE, Math.round(fee)));
}

/** 입장료가 비쌀수록 방문이 줄어든다 (0원 = 1.0, MAX_FEE = 0.05) */
export function feeFactor(fee: number): number {
  return Math.max(0.05, Math.min(1, 1 - fee / MAX_FEE));
}

/** 하루가 끝날 때: 유지비 정산, 달이 끝나면 월간 보고 */
export function settleDay(world: World): void {
  const upkeep = dailyUpkeep(world);
  if (upkeep > 0) world.transact('upkeep', -upkeep);

  const dayIndex = Math.floor(world.tick / DAY_TICKS); // 끝난 날 수
  if (dayIndex > 0 && dayIndex % DAYS_PER_MONTH === 0) finishMonth(world, dayIndex);
}

function finishMonth(world: World, daysDone: number): void {
  const d = dateOf((daysDone - 1) * DAY_TICKS); // 방금 끝난 달
  const ledger = { ...world.ledger };
  const report: MonthReport = {
    year: d.year,
    month: d.month,
    ledger,
    net: Object.values(ledger).reduce((a, b) => a + b, 0),
    money: world.money,
    rating: Math.round(world.rating),
    guests: world.guests.length,
    entered: world.stats.entered - world.monthStartEntered,
  };
  world.reports.push(report);
  if (world.reports.length > MAX_REPORTS) world.reports.shift();
  world.resetLedger();
  world.monthStartEntered = world.stats.entered;
}
