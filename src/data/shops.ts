import type { BuildingDef } from './types';

export const SHOPS: BuildingDef[] = [
  { id: 'burger', kind: 'shop', name: '햄버거 가게', w: 1, h: 1, cost: 400, upkeep: 60, height: 28, color: '#e0603a', price: 10, duration: 30, capacity: 1, serves: 'hunger' },
  { id: 'drinks', kind: 'shop', name: '음료 가판대', w: 1, h: 1, cost: 300, upkeep: 40, height: 26, color: '#3ab0a0', price: 6, duration: 20, capacity: 1, serves: 'thirst' },
  { id: 'toilet', kind: 'shop', name: '화장실', w: 2, h: 1, cost: 250, upkeep: 40, height: 26, color: '#8d9aa6', price: 0, duration: 30, capacity: 2, serves: 'toilet' },
  { id: 'umbrella', kind: 'shop', name: '우산 가게', w: 1, h: 1, cost: 300, upkeep: 40, height: 26, color: '#3a6fd0', price: 8, duration: 15, capacity: 1, umbrella: true },
];
