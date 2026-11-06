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
  /** 실외 시설: 비 오는 날 우산 없는 손님이 꺼린다 */
  outdoor?: boolean;
  /** 우산 가게: 비 올 때만 수요가 있고, 사면 손님이 우산을 갖는다 */
  umbrella?: boolean;
  /** 카페: 지친 손님(에너지가 낮은 손님)이 찾아와 에너지를 회복한다 */
  rest?: boolean;
  /** 기념품 가게: 기분이 좋고 돈이 넉넉한 손님이 찾아와 산다 */
  souvenir?: boolean;
  /** 풍선 가게: 기분 좋은 손님(특히 아이)이 풍선을 사서 들고 다닌다. 가끔 놓치면 하늘로 날아간다 */
  balloon?: boolean;
  /** 매점 이용 후 추가로 오르는 행복(기본 효과 +6에 더함) */
  joy?: number;
  /** true면 플레이어가 트랙을 직접 이어 만드는 롤러코스터(역 정의) */
  coaster?: boolean;
  /** 강도(0~100): 손님 담력보다 높으면 꺼리고, 75를 넘으면 덜 즐거워한다. 코스터는 트랙에서 계산 */
  intensity?: number;
  /** 멀미(0~100): 높으면 손님 에너지를 더 깎고, 지친 손님이 꺼린다. 코스터는 트랙에서 계산 */
  nausea?: number;
}
