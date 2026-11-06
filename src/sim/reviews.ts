import { hash32 } from '../core/hash';
import { buildingDef } from './coaster';
import type { Guest, Thought } from './guest';
import type { World } from './world';

/**
 * 손님 이름과 공원 리뷰. 이름은 손님 id에서 정해지므로 저장하지 않는다.
 * 손님이 공원을 떠날 때 기분·남은 욕구·떠난 이유·가장 재밌던 기구로 별점과 한 줄 후기를 남긴다(RNG를 쓰지 않는다).
 */
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = [
  '민지', '서준', '하은', '도윤', '지우', '예준', '서연', '시우', '수아', '주원', '지아', '하준', '윤서', '건우', '채원',
  '우진', '다은', '현우', '소율', '준서', '민서', '지호', '유나', '태윤', '하린', '은우', '나연', '선우', '예린', '시윤',
];

export function guestName(id: number): string {
  return SURNAMES[hash32(id, 0, 61) % SURNAMES.length] + GIVEN[hash32(id, 0, 67) % GIVEN.length];
}

export interface Review {
  guestId: number;
  name: string;
  /** 1~5 */
  stars: number;
  text: string;
  tick: number;
}

/** 보관하는 리뷰 수(최신 것만) */
export const MAX_REVIEWS = 40;

/** 손님이 남긴 불만(말풍선으로 떠올린 것 중 마지막). 리뷰 내용에 쓰인다 */
export const GRIPES: ReadonlySet<Thought> = new Set<Thought>(['waited', 'queueFull', 'expensive', 'litter', 'broken', 'rain', 'vipSad', 'tooIntense']);

export function starsFor(happiness: number): number {
  return happiness >= 85 ? 5 : happiness >= 68 ? 4 : happiness >= 50 ? 3 : happiness >= 30 ? 2 : 1;
}

const pick = <T>(arr: readonly T[], g: Guest, salt: number): T => arr[hash32(g.id, salt, 71) % arr.length];

const GRIPE_TEXT: Partial<Record<Thought, readonly string[]>> = {
  waited: ['줄이 너무 길어요…', '기다리다 하루가 다 갔어요'],
  queueFull: ['어딜 가나 줄이 꽉 차 있어요', '사람이 너무 많아요'],
  expensive: ['요금이 너무 비싸요', '지갑이 텅 비었어요… 비싸요'],
  litter: ['길에 쓰레기가 너무 많아요', '청소 좀 해 주세요'],
  broken: ['타려던 기구가 고장 났어요', '고장 난 기구가 많아요'],
  rain: ['비 맞아서 다 젖었어요', '우산 가게라도 있었으면…'],
  vipSad: ['VIP인데 원하던 기구를 못 탔어요', '실망이에요. 다시는 안 와요'],
  tooIntense: ['너무 무서웠어요 😱', '심장 떨어지는 줄 알았어요'],
};

/** 떠나는 손님의 리뷰를 만든다 */
export function makeReview(world: World, g: Guest): Review {
  const n = g.needs;
  const stars = starsFor(n.happiness);
  // 가장 재밌던(재미가 가장 높은) 놀이기구
  let fav: string | null = null;
  let favFun = -1;
  for (const id of g.visited) {
    const b = world.buildings.get(id);
    if (!b) continue;
    const d = buildingDef(b);
    if (d.kind === 'ride' && (d.fun ?? 0) > favFun) {
      favFun = d.fun ?? 0;
      fav = d.name;
    }
  }
  const park = world.parkName || '이 공원';
  let text: string;
  if (g.vip?.done) {
    text = pick([`VIP 대접 제대로 받았어요! ${fav ?? '놀이기구'} 최고`, `${park}, 친구들한테 자랑할게요 👑`], g, 1);
  } else if (stars >= 4) {
    text = fav
      ? pick([`${fav} 또 타러 올게요!`, `${fav} 정말 재밌었어요`, `${park} 최고! 특히 ${fav}`, `하루 종일 신났어요. ${fav} 강추!`], g, 2)
      : pick([`${park} 분위기가 좋아요`, '산책만 해도 즐거웠어요'], g, 3);
  } else if (stars === 3) {
    const gripe = g.gripe ? GRIPE_TEXT[g.gripe] : undefined;
    text = gripe
      ? `${fav ? `${fav}는 좋았는데, ` : ''}${pick(gripe, g, 4)}`
      : pick(['그럭저럭 괜찮았어요', fav ? `${fav}는 괜찮았어요` : '탈 게 조금 더 있었으면', '나쁘지 않았어요'], g, 5);
  } else {
    // 불만 순서: 떠난 이유 → 채우지 못한 욕구 → 마지막으로 떠올린 불만
    const why = g.leaveReason;
    text =
      why === 'broke' ? '돈이 금방 다 떨어졌어요'
      : why === 'tired' ? '너무 지쳐서 쉴 곳이 필요했어요'
      : why === 'bored' ? '탈 게 별로 없어요'
      : why === 'expensive' ? '전부 너무 비싸요'
      : n.toilet > 70 ? '화장실 찾다가 집에 갔어요'
      : n.hunger > 70 ? '먹을 데가 부족해요'
      : n.thirst > 70 ? '목말라 죽는 줄 알았어요'
      : g.gripe && GRIPE_TEXT[g.gripe] ? pick(GRIPE_TEXT[g.gripe]!, g, 6)
      : pick(['별로였어요', '다시는 안 올래요', '기대보다 아쉬웠어요'], g, 7);
  }
  return { guestId: g.id, name: guestName(g.id), stars, text, tick: world.tick };
}

export function addReview(world: World, g: Guest): void {
  world.reviews.push(makeReview(world, g));
  if (world.reviews.length > MAX_REVIEWS) world.reviews.splice(0, world.reviews.length - MAX_REVIEWS);
}

/** 최근 리뷰의 평균 별점(리뷰가 없으면 null) */
export function averageStars(world: World): number | null {
  const r = world.reviews;
  return r.length ? r.reduce((a, x) => a + x.stars, 0) / r.length : null;
}
