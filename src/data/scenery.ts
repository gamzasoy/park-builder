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
];

export const PINE = 1;
export const OAK = 2;
export const FLOWERS = 3;

export function sceneryDef(kind: number): SceneryDef | undefined {
  return SCENERY.find((d) => d.kind === kind);
}
