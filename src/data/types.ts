export type BuildingKind = 'ride' | 'shop';
/** 매점이 해소하는 욕구 */
export type NeedKey = 'hunger' | 'thirst' | 'toilet';

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
  /** 이용 요금 */
  price: number;
  /** 이용(탑승/구매) 소요 틱 */
  duration: number;
  /** 놀이기구: 한 번에 태우는 인원 / 매점: 동시에 응대하는 손님 수 */
  capacity: number;
  /** 놀이기구 재미(0~100) */
  fun?: number;
  /** 매점이 해소하는 욕구 */
  serves?: NeedKey;
}
