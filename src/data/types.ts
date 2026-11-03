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
  /** 하루 유지비 */
  upkeep: number;
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
  /** true면 플레이어가 트랙을 직접 이어 만드는 롤러코스터(역 정의) */
  coaster?: boolean;
  /** 강도(0~100): 높으면 손님이 덜 즐거워한다. 계산된 코스터에만 있다 */
  intensity?: number;
  /** 멀미(0~100): 높으면 손님 에너지를 더 깎는다. 계산된 코스터에만 있다 */
  nausea?: number;
}
