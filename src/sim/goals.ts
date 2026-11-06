import { DAY_TICKS, DAYS_PER_MONTH } from './economy';
import { deadlineTicks, scenarioOf, SCENARIOS, starsFor } from './scenarios';
import type { World } from './world';

/** 기본 시나리오(초원 공원)의 목표: 기한 안에 손님 수와 평점을 동시에 달성하고 하루 동안 유지 */
export const GOAL = { months: SCENARIOS[0].months, guests: SCENARIOS[0].guests, rating: SCENARIOS[0].rating, holdTicks: DAY_TICKS } as const;
export const DEADLINE_TICK = GOAL.months * DAYS_PER_MONTH * DAY_TICKS;
/** 잔고가 마이너스로 하루를 마치는 날이 이만큼 연속되면 파산 */
export const BANKRUPT_DAYS = 3;

export interface Goal {
  months: number;
  guests: number;
  rating: number;
  /** 있으면 잔고도 이만큼 유지해야 한다 */
  money?: number;
  holdTicks: number;
  deadline: number;
}

/** 이 공원(시나리오)의 목표 */
export function goalOf(world: World): Goal {
  const s = scenarioOf(world);
  return { months: s.months, guests: s.guests, rating: s.rating, money: s.goalMoney, holdTicks: DAY_TICKS, deadline: deadlineTicks(s) };
}

export interface GoalProgress {
  guests: number;
  rating: number;
  guestsMet: boolean;
  ratingMet: boolean;
  /** 잔고 목표가 없으면 항상 true */
  moneyMet: boolean;
  /** 유지 진행률 0~1 */
  hold: number;
  remainingDays: number;
}

export function goalProgress(world: World): GoalProgress {
  const g = goalOf(world);
  const rating = Math.round(world.rating);
  return {
    guests: world.guests.length,
    rating,
    guestsMet: world.guests.length >= g.guests,
    ratingMet: rating >= g.rating,
    moneyMet: g.money === undefined || world.money >= g.money,
    hold: Math.min(1, world.goalHold / g.holdTicks),
    remainingDays: Math.max(0, Math.ceil((g.deadline - world.tick) / DAY_TICKS)),
  };
}

function finish(world: World, status: 'won' | 'lost', reason: string): void {
  world.status = status;
  world.endReason = reason;
}

/** 매 틱: 조건을 연속 유지하면 달성(남은 기간으로 별점), 기한이 지나면 실패 */
export function updateGoals(world: World): void {
  if (world.status !== 'playing') return;
  const g = goalOf(world);
  const p = goalProgress(world);
  world.goalHold = p.guestsMet && p.ratingMet && p.moneyMet ? world.goalHold + 1 : 0;

  if (world.goalHold >= g.holdTicks) {
    world.stars = starsFor(scenarioOf(world), world.tick);
    finish(world, 'won', '목표를 달성했습니다!');
  } else if (world.tick >= g.deadline) {
    finish(world, 'lost', `${g.months}개월 안에 목표를 달성하지 못했습니다.`);
  }
}

/** 하루 끝: 마이너스 잔고가 이어지면 파산 */
export function trackDebt(world: World): void {
  if (world.status !== 'playing') return;
  world.debtDays = world.money < 0 ? world.debtDays + 1 : 0;
  if (world.debtDays >= BANKRUPT_DAYS) {
    finish(world, 'lost', `잔고가 ${BANKRUPT_DAYS}일 연속 마이너스여서 파산했습니다.`);
  }
}
