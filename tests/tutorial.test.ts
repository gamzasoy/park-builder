import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { deserializeWorld, parseSave, serializeWorld } from '../src/save/save';
import { demolishAt, lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { setEntranceFee, setPrice } from '../src/sim/economy';
import { stepWorld } from '../src/sim/sim';
import { appendPiece } from '../src/sim/trackedit';
import {
  basicsDone, currentStep, MIN_PATH_TILES, STEP_IDS, STEPS, updateTutorial,
} from '../src/sim/tutorial';
import { World } from '../src/sim/world';

const done = (w: World): string[] => w.tutorial.completed;
const lay = (w: World, n: number): void => {
  const g = w.map.gate;
  placePaths(w, lineTiles({ x: g.x, y: g.y - 1 }, { x: g.x, y: g.y - n }));
};

describe('tutorial steps', () => {
  it('starts with nothing done and points at the first step', () => {
    const w = new World();
    expect(updateTutorial(w)).toEqual([]);
    expect(done(w)).toEqual([]);
    expect(currentStep(w)?.id).toBe('path');
    expect(basicsDone(w)).toBe(false);
  });

  it('needs enough connected path tiles', () => {
    const w = new World();
    lay(w, MIN_PATH_TILES - 1);
    expect(updateTutorial(w)).toEqual([]);
    lay(w, MIN_PATH_TILES);
    expect(updateTutorial(w)).toEqual(['path']);
    expect(currentStep(w)?.id).toBe('ride');
  });

  it('does not count path tiles that are cut off from the park entrance', () => {
    const w = new World();
    placePaths(w, lineTiles({ x: 5, y: 5 }, { x: 5, y: 15 }));
    expect(updateTutorial(w)).toEqual([]);
  });

  it('needs an operational ride, then an operational food/drink shop', () => {
    const w = new World();
    lay(w, 12);
    updateTutorial(w);
    // 길에서 떨어진 놀이기구는 운영 불가
    placeBuilding(w, getDef('carousel'), 3, 3, 0);
    expect(updateTutorial(w)).toEqual([]);
    const g = w.map.gate;
    placeBuilding(w, getDef('carousel'), g.x - 1, g.y - 14, 0); // 입구 (g.x, g.y-12)
    expect(updateTutorial(w)).toEqual(['ride']);
    // 화장실은 '매점 짓기'로 세지 않는다
    placeBuilding(w, getDef('toilet'), g.x + 1, g.y - 6, 3);
    expect(updateTutorial(w)).toEqual([]);
    placeBuilding(w, getDef('burger'), g.x + 1, g.y - 3, 3);
    expect(updateTutorial(w)).toEqual(['shop']);
  });

  it('detects the first guest', () => {
    const w = new World();
    lay(w, 12);
    const g = w.map.gate;
    placeBuilding(w, getDef('carousel'), g.x - 1, g.y - 14, 0);
    for (let i = 0; i < 400 && !done(w).includes('guest'); i++) stepWorld(w);
    expect(done(w)).toContain('guest');
  });

  it('counts a changed ride price or entrance fee, but not a coaster auto price', () => {
    const w = new World();
    lay(w, 12);
    const g = w.map.gate;
    const ride = placeBuilding(w, getDef('carousel'), g.x - 1, g.y - 14, 0)!;
    updateTutorial(w);
    expect(done(w)).not.toContain('price');
    setPrice(ride, ride.price + 1);
    expect(updateTutorial(w)).toContain('price');

    const w2 = new World();
    setEntranceFee(w2, w2.entranceFee + 5);
    expect(updateTutorial(w2)).toEqual(['price']);

    const w3 = new World();
    w3.money = 50_000;
    const c = placeBuilding(w3, getDef('coaster'), 10, 10, 0)!;
    c.price = 1; // 코스터 요금은 세지 않는다
    expect(updateTutorial(w3)).toEqual([]);
  });

  it('completes the optional coaster step only when a track is finished', () => {
    const w = new World();
    w.money = 50_000;
    const b = placeBuilding(w, getDef('coaster'), 10, 10, 0)!;
    updateTutorial(w);
    expect(done(w)).not.toContain('coaster');
    for (const ch of 'SRSRSSSSSRSRS') {
      appendPiece(w, b, ({ S: 'straight', R: 'right' } as const)[ch as 'S' | 'R']);
    }
    expect(b.track!.ok).toBe(true);
    expect(updateTutorial(w)).toContain('coaster');
  });

  it('keeps a step done after the thing is demolished', () => {
    const w = new World();
    lay(w, 8);
    updateTutorial(w);
    expect(done(w)).toContain('path');
    for (let i = 1; i <= 8; i++) demolishAt(w, w.map.gate.x, w.map.gate.y - i);
    updateTutorial(w);
    expect(done(w)).toContain('path');
  });

  it('is finished once every required step is done; the coaster step is optional', () => {
    const w = new World();
    w.tutorial.completed = STEPS.filter((s) => !s.optional).map((s) => s.id);
    expect(basicsDone(w)).toBe(true);
    expect(currentStep(w)?.id).toBe('coaster'); // 선택 과제는 그 뒤에 남는다
    w.tutorial.completed = [...STEP_IDS];
    expect(currentStep(w)).toBeNull();
  });

  it('shows required steps before the optional one even when it was skipped ahead', () => {
    const w = new World();
    w.tutorial.completed = ['coaster'];
    expect(currentStep(w)?.id).toBe('path');
  });
});

describe('tutorial saving', () => {
  it('round-trips progress', () => {
    const w = new World();
    w.tutorial.completed = ['path', 'ride'];
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(back.tutorial.completed).toEqual(['path', 'ride']);
  });

  it('treats a save without tutorial data (older park) as already finished', () => {
    const d = JSON.parse(JSON.stringify(serializeWorld(new World())));
    delete d.tutorial;
    d.version = 1;
    const r = parseSave(JSON.stringify(d));
    expect(r.ok).toBe(true);
    if (r.ok) expect(basicsDone(r.world)).toBe(true);
  });

  it('ignores unknown step ids', () => {
    const d = JSON.parse(JSON.stringify(serializeWorld(new World())));
    d.tutorial = { completed: ['path', 'nonsense'] };
    expect(deserializeWorld(d).tutorial.completed).toEqual(['path']);
  });

  it('adopt copies progress into an existing world (new game / load)', () => {
    const target = new World();
    const src = new World();
    src.tutorial.completed = ['path'];
    target.adopt(src);
    expect(target.tutorial.completed).toEqual(['path']);
  });
});
