import type { BuildingDef } from './types';

/**
 * 놀이기구 목록. intensity(강도)·nausea(멀미)는 손님마다 다른 담력과 비교되어
 * 누가 어떤 기구를 고르는지가 갈린다(sim/guest.ts thrillTolerance).
 */
export const RIDES: BuildingDef[] = [
  { id: 'carousel', kind: 'ride', name: '회전목마', w: 2, h: 2, cost: 1500, upkeep: 150, height: 40, color: '#d86b9a', price: 8, duration: 80, capacity: 6, fun: 50, outdoor: true, intensity: 5, nausea: 0 },
  { id: 'slide', kind: 'ride', name: '나선 미끄럼틀', w: 2, h: 2, cost: 1200, upkeep: 100, height: 70, color: '#e0503a', price: 6, duration: 50, capacity: 4, fun: 42, outdoor: true, intensity: 15, nausea: 5 },
  { id: 'teacups', kind: 'ride', name: '찻잔', w: 2, h: 2, cost: 2000, upkeep: 200, height: 30, color: '#5fb8d0', price: 8, duration: 70, capacity: 9, fun: 55, outdoor: true, intensity: 20, nausea: 50 },
  { id: 'wheel', kind: 'ride', name: '관람차', w: 3, h: 3, cost: 4000, upkeep: 400, height: 110, color: '#4aa3d8', price: 12, duration: 120, capacity: 12, fun: 60, outdoor: true, intensity: 10, nausea: 0 },
  { id: 'bumper', kind: 'ride', name: '범퍼카', w: 3, h: 3, cost: 2500, upkeep: 250, height: 24, color: '#e0a63a', price: 10, duration: 100, capacity: 8, fun: 55, outdoor: true, intensity: 30, nausea: 10 },
  { id: 'haunted', kind: 'ride', name: '유령의 집', w: 3, h: 2, cost: 3000, upkeep: 300, height: 50, color: '#5b4a7a', price: 10, duration: 110, capacity: 6, fun: 62, intensity: 35, nausea: 5 },
  { id: 'swing', kind: 'ride', name: '회전 그네', w: 2, h: 2, cost: 3500, upkeep: 350, height: 80, color: '#e8b23a', price: 12, duration: 90, capacity: 12, fun: 66, outdoor: true, intensity: 45, nausea: 30 },
  { id: 'viking', kind: 'ride', name: '바이킹', w: 3, h: 2, cost: 4500, upkeep: 450, height: 80, color: '#b5653a', price: 14, duration: 90, capacity: 16, fun: 75, outdoor: true, intensity: 65, nausea: 55 },
  { id: 'drop', kind: 'ride', name: '드롭타워', w: 2, h: 2, cost: 5000, upkeep: 500, height: 140, color: '#8a5fd0', price: 15, duration: 60, capacity: 8, fun: 85, intensity: 75, nausea: 25 },
  // 롤러코스터: 역(3×1)만 정의하고 트랙은 플레이어가 잇는다. 재미·운행 시간·비용은 완성된 트랙에서 계산(sim/coaster.ts).
  { id: 'coaster', kind: 'ride', name: '롤러코스터', w: 3, h: 1, cost: 800, upkeep: 100, height: 18, color: '#d9534f', price: 15, duration: 100, capacity: 8, fun: 0, coaster: true, outdoor: true },
];
