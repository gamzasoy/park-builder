import type { BuildingDef } from './types';

export const RIDES: BuildingDef[] = [
  { id: 'carousel', kind: 'ride', name: '회전목마', w: 2, h: 2, cost: 1500, height: 40, color: '#d86b9a' },
  { id: 'wheel', kind: 'ride', name: '관람차', w: 3, h: 3, cost: 4000, height: 110, color: '#4aa3d8' },
  { id: 'bumper', kind: 'ride', name: '범퍼카', w: 3, h: 3, cost: 2500, height: 24, color: '#e0a63a' },
  { id: 'drop', kind: 'ride', name: '드롭타워', w: 2, h: 2, cost: 5000, height: 140, color: '#8a5fd0' },
];
