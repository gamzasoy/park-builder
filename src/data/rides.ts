import type { BuildingDef } from './types';

export const RIDES: BuildingDef[] = [
  { id: 'carousel', kind: 'ride', name: '회전목마', w: 2, h: 2, cost: 1500, upkeep: 150, height: 40, color: '#d86b9a', price: 8, duration: 80, capacity: 6, fun: 50 },
  { id: 'wheel', kind: 'ride', name: '관람차', w: 3, h: 3, cost: 4000, upkeep: 400, height: 110, color: '#4aa3d8', price: 12, duration: 120, capacity: 12, fun: 60 },
  { id: 'bumper', kind: 'ride', name: '범퍼카', w: 3, h: 3, cost: 2500, upkeep: 250, height: 24, color: '#e0a63a', price: 10, duration: 100, capacity: 8, fun: 55 },
  { id: 'drop', kind: 'ride', name: '드롭타워', w: 2, h: 2, cost: 5000, upkeep: 500, height: 140, color: '#8a5fd0', price: 15, duration: 60, capacity: 8, fun: 85 },
];
