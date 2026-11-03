import { DAY_TICKS, DAYS_PER_MONTH } from './economy';
import type { World } from './world';

/** 목표: 기한 안에 손님 수와 평점을 동시에 달성하고 하루 동안 유지 */
export const GOAL = { months: 4, guests: 100, rating: 650, holdTicks: DAY_TICKS } as const;
export const DEADLINE_TICK = GOAL.months * DAYS_PER_MONTH * DAY_TICKS;
/** 잔고가 마이너스로 하루를 마치는 날이 이만큼 연속되면 파산 */
export const BANKRUPT_DAYS = 3;

export interface GoalProgress {
  guests: number;
  rating: number;
  guestsMet: boolean;
  ratingMet: boolean;
  /** 유지 진행률 0~1 */
  hold: number;
  remainingDays: number;
}

export function goalProgress(world: World): GoalProgress {
  const rating = Math.round(world.rating);
  return {
    guests: world.guests.length,
    rating,
    guestsMet: world.guests.length >= GOAL.guests,
    ratingMet: rating >= GOAL.rating,
    hold: Math.min(1, world.goalHold / GOAL.holdTicks),
    remainingDays: Math.max(0, Math.ceil((DEADLINE_TICK - world.tick) / DAY_TICKS)),
  };
}

function finish(world: World, status: 'won' | 'lost', reason: string): void {
  world.status = status;
  world.endReason = reason;
}

/** 매 틱: 조건을 연속 유지하면 달성, 기한이 지나면 실패 */
export function updateGoals(world: World): void {
  if (world.status !== 'playing') return;
  const p = goalProgress(world);
  world.goalHold = p.guestsMet && p.ratingMet ? world.goalHold + 1 : 0;

  if (world.goalHold >= GOAL.holdTicks) {
    finish(world, 'won', '목표를 달성했습니다!');
  } else if (world.tick >= DEADLINE_TICK) {
    finish(world, 'lost', `${GOAL.months}개월 안에 목표를 달성하지 못했습니다.`);
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
