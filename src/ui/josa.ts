/** 목적격 조사를 붙인다: 받침이 있으면 '을', 없으면 '를' */
export function withObj(name: string): string {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  return name + (c >= 0 && c < 11172 && c % 28 ? '을' : '를');
}

/** '(으)로'를 붙인다: 받침이 없거나 ㄹ 받침이면 '로', 그 밖의 받침이면 '으로' */
export function withRo(name: string): string {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  const jong = c >= 0 && c < 11172 ? c % 28 : 0;
  return name + (jong === 0 || jong === 8 ? '로' : '으로');
}

/** 주격 조사를 붙인다: 받침이 있으면 '이', 없으면 '가' */
export function withSubj(name: string): string {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  return name + (c >= 0 && c < 11172 && c % 28 ? '이' : '가');
}
