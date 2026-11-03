export type BuildingKind = 'ride' | 'shop';

export interface BuildingDef {
  id: string;
  kind: BuildingKind;
  name: string;
  /** 회전 0 기준 풋프린트 크기(타일) */
  w: number;
  h: number;
  cost: number;
  /** 렌더링용 박스 높이(월드 px) */
  height: number;
  color: string;
}
