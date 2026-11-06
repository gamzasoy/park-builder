import type { Thought } from '../sim/guest';

/** 말풍선·대기열 배지 글꼴: 시스템 한글 폰트만 쓴다(외부 폰트 없음) */
export const BUBBLE_FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';

export const THOUGHT_TEXT: Record<Thought, string> = {
  hungry: '배고파',
  thirsty: '목말라',
  toilet: '화장실!',
  tired: '지쳤어',
  unhappy: '별로야',
  fun: '재밌다!',
  tooIntense: '너무 무서워!',
  queueFull: '줄이 너무 길어',
  waited: '너무 오래 기다렸어',
  broke: '돈이 없어',
  tooOld: '이제 집에 갈래',
  bored: '할 게 없네',
  expensive: '너무 비싸',
  scenery: '경치가 좋네',
  litter: '너무 더러워!',
  broken: '고장났네…',
  rain: '비가 와…',
  show: '인형탈 귀여워!',
  fireworks: '우와, 불꽃놀이!',
  fountain: '분수 예쁘다~',
  vipHappy: '최고의 공원이야!',
  vipSad: '실망이야…',
  rainbow: '무지개다!',
  lost: '엄마 어딨어? 😭',
  lostKid: '우리 애 어디 갔지?!',
  reunited: '찾았다!',
  kidFun: '또 탈래!',
};

/** 긍정적인 생각은 초록 말풍선 */
export const POSITIVE: ReadonlySet<Thought> = new Set<Thought>(['fun', 'scenery', 'show', 'fireworks', 'fountain', 'vipHappy', 'rainbow', 'reunited', 'kidFun']);
