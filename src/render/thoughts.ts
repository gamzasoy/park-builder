import type { Thought } from '../sim/guest';

export const THOUGHT_TEXT: Record<Thought, string> = {
  hungry: '배고파',
  thirsty: '목말라',
  toilet: '화장실!',
  tired: '지쳤어',
  unhappy: '별로야',
  fun: '재밌다!',
  queueFull: '줄이 너무 길어',
  waited: '너무 오래 기다렸어',
  broke: '돈이 없어',
  tooOld: '이제 집에 갈래',
  bored: '할 게 없네',
  expensive: '너무 비싸',
};

/** 긍정적인 생각은 초록 말풍선 */
export const POSITIVE: ReadonlySet<Thought> = new Set<Thought>(['fun']);
