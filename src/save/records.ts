import { defaultStorage, type KV } from './save';

/** 시나리오별 최고 별점. 공원 저장과 따로 두어 새 게임을 해도 남는다 */
export const RECORDS_KEY = 'park-builder-records';

export type StarRecords = Record<string, number>;

export function loadRecords(storage: KV | null = defaultStorage()): StarRecords {
  try {
    const raw = storage?.getItem(RECORDS_KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    const out: StarRecords = {};
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) if (typeof v === 'number' && v >= 1 && v <= 3) out[k] = Math.round(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** 별점을 기록한다. 이전 기록보다 높으면 true */
export function recordStars(id: string, stars: number, storage: KV | null = defaultStorage()): boolean {
  const rec = loadRecords(storage);
  if ((rec[id] ?? 0) >= stars) return false;
  rec[id] = stars;
  try {
    storage?.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch {
    /* 저장 공간이 없으면 기록만 못 남긴다 */
  }
  return true;
}

/** ★★☆ 꼴 문자열 */
export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
