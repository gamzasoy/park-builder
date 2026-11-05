import { describe, expect, it } from 'vitest';
import { ToolController, type ToolEvent } from '../src/input/tools';
import { lineTiles, placePaths } from '../src/sim/building';
import { createGuest } from '../src/sim/guest';
import { World } from '../src/sim/world';

function setup() {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 6 }));
  const tools = new ToolController(w);
  const events: ToolEvent[] = [];
  tools.onEvent = (e) => events.push(e);
  const t = { x: g.x, y: g.y - 3 };
  w.map.litter[w.map.index(t.x, t.y)] = 3;
  return { w, tools, events, t };
}

describe('picking up litter by hand', () => {
  it('clicking a dirty path tile clears it', () => {
    const { w, tools, events, t } = setup();
    tools.onDown(t, { x: t.x + 0.5, y: t.y + 0.5 });
    expect(w.map.litterAt(t.x, t.y)).toBe(0);
    expect(events).toEqual(['pickup']);
    expect(tools.message).toContain('3개');
  });

  it('wins over a guest standing on the tile', () => {
    const { w, tools, t } = setup();
    const guest = createGuest(w);
    guest.x = guest.px = t.x + 0.5;
    guest.y = guest.py = t.y + 0.5;
    guest.tile = { ...t };
    w.guests.push(guest);
    tools.onDown(t, { x: t.x + 0.5, y: t.y + 0.5 });
    expect(w.map.litterAt(t.x, t.y)).toBe(0);
    expect(tools.selectedGuestId).toBeNull();
    // 깨끗해진 뒤에는 손님을 고른다
    tools.onDown(t, { x: t.x + 0.5, y: t.y + 0.5 });
    expect(tools.selectedGuestId).toBe(guest.id);
  });

  it('does nothing while a build tool is active, and previews dirty tiles in select mode', () => {
    const { w, tools, t } = setup();
    expect(tools.preview(t)?.tiles).toEqual([{ ...t, ok: true }]);
    expect(tools.preview({ x: t.x, y: t.y - 1 })).toBeNull();
    tools.setTool({ kind: 'path' });
    tools.onDown(t);
    tools.onUp(t);
    expect(w.map.litterAt(t.x, t.y)).toBe(3);
  });
});
