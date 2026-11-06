/** 공원 이름 최대 글자 수(입구 간판에 들어가는 길이) */
export const MAX_PARK_NAME = 8;

/** 공원 이름 정리: 앞뒤 공백·줄바꿈을 없애고 길이를 자른다(글자 단위) */
export function cleanParkName(name: string): string {
  return [...name.replace(/\s+/g, ' ').trim()].slice(0, MAX_PARK_NAME).join('');
}
