/** 장식(나무·꽃). kind는 TileMap.scenery 레이어에 저장되는 값(0 = 없음). */
export interface SceneryDef {
  kind: number;
  id: string;
  name: string;
  cost: number;
}

export const SCENERY: SceneryDef[] = [
  { kind: 1, id: 'pine', name: '침엽수', cost: 30 },
  { kind: 2, id: 'oak', name: '활엽수', cost: 40 },
  { kind: 3, id: 'flowers', name: '꽃밭', cost: 20 },
  { kind: 4, id: 'bin', name: '쓰레기통', cost: 50 },
  { kind: 5, id: 'fountain', name: '분수', cost: 300 },
];

export const PINE = 1;
export const OAK = 2;
export const FLOWERS = 3;
/** 쓰레기통: 손님이 근처에서 쓰레기를 버린다(경치 보너스는 주지 않는다) */
export const BIN = 4;
/** 분수: 반경 FOUNTAIN_RADIUS 칸 안을 걷는 손님의 기분을 크게 올린다 */
export const FOUNTAIN = 5;

export function sceneryDef(kind: number): SceneryDef | undefined {
  return SCENERY.find((d) => d.kind === kind);
}
