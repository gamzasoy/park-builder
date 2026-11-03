import type { BuildingDef } from './types';

export const SHOPS: BuildingDef[] = [
  { id: 'burger', kind: 'shop', name: '햄버거 가게', w: 1, h: 1, cost: 400, height: 28, color: '#e0603a' },
  { id: 'drinks', kind: 'shop', name: '음료 가판대', w: 1, h: 1, cost: 300, height: 26, color: '#3ab0a0' },
  { id: 'toilet', kind: 'shop', name: '화장실', w: 2, h: 1, cost: 250, height: 26, color: '#8d9aa6' },
];
