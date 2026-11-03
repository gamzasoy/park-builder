import { RIDES } from './rides';
import { SHOPS } from './shops';
import type { BuildingDef } from './types';

export { RIDES, SHOPS };
export type { BuildingDef };

const ALL: BuildingDef[] = [...RIDES, ...SHOPS];
const BY_ID = new Map(ALL.map((d) => [d.id, d]));

export function getDef(id: string): BuildingDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown building def: ${id}`);
  return d;
}
