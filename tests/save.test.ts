import { describe, expect, it } from 'vitest';
import { getDef } from '../src/data';
import { lineTiles, placeBuilding, placePaths } from '../src/sim/building';
import { stepWorld } from '../src/sim/sim';
import { World } from '../src/sim/world';
import {
  BACKUP_KEY, clearSave, deserializeWorld, loadFromStorage, parseSave, SAVE_KEY, SAVE_VERSION,
  saveToStorage, serializeWorld, type KV,
} from '../src/save/save';

function makePark(): World {
  const w = new World();
  const g = w.map.gate;
  placePaths(w, lineTiles(g, { x: g.x, y: g.y - 8 }));
  placePaths(w, [{ x: g.x, y: 38 }]);
  placeBuilding(w, getDef('carousel'), g.x - 1, 36, 0);
  placeBuilding(w, getDef('burger'), g.x + 1, 43, 3);
  return w;
}

/**
 * 비교용 스냅샷. savedAt(시각)과 손님의 pathVersion은 제외한다:
 * pathVersion은 "캐시된 경로가 아직 유효한가"를 뜻하는 내부 토큰이라 불러오기 때 값이 달라지는 게 정상이다.
 * (동작이 같은지는 '불러온 뒤 계속 진행하면 원본과 같다' 테스트가 직접 보장한다)
 */
const snap = (w: World) => {
  const d = serializeWorld(w);
  return { ...d, savedAt: 0, guests: d.guests.map(({ pathVersion: _v, ...g }) => g) };
};

function fakeStorage(init: Record<string, string> = {}): KV & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

describe('serialize / deserialize', () => {
  it('round-trips a busy park through JSON without losing anything', () => {
    const w = makePark();
    for (let i = 0; i < 2500; i++) stepWorld(w);
    expect(w.guests.length).toBeGreaterThan(5);
    expect(w.reports).toHaveLength(0);

    const json = JSON.stringify(serializeWorld(w));
    const back = deserializeWorld(JSON.parse(json));
    expect(snap(back)).toEqual(snap(w));
    // 점유 격자는 건물에서 복원된다
    for (const b of w.buildings.values()) expect(back.map.occupant[back.map.index(b.x, b.y)]).toBe(b.id);
  });

  it('continues exactly like the original after loading (adopted into an existing world)', () => {
    const original = makePark();
    for (let i = 0; i < 2000; i++) stepWorld(original);

    const target = new World(); // 앱처럼 기존 인스턴스에 제자리 교체
    const mapRef = target.map;
    target.adopt(deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(original)))));
    expect(target.map).toBe(mapRef);

    for (let i = 0; i < 1500; i++) { stepWorld(original); stepWorld(target); }
    expect(snap(target)).toEqual(snap(original));
  });

  it('survives a month boundary and keeps reports and ledger', () => {
    const w = makePark();
    for (let i = 0; i < 6100; i++) stepWorld(w);
    expect(w.reports).toHaveLength(1);
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(back.reports).toEqual(w.reports);
    expect(back.ledger).toEqual(w.ledger);
    expect(back.rating).toBe(w.rating);
  });

  it('only stores paths for guests that are moving', () => {
    const w = makePark();
    for (let i = 0; i < 1500; i++) stepWorld(w);
    const data = serializeWorld(w);
    for (const g of data.guests) {
      if (g.state === 'walking' || g.state === 'leaving') expect(g.path.length % 2).toBe(0);
      else expect(g.path).toEqual([]);
    }
  });
});

describe('rejecting bad data', () => {
  const good = () => JSON.stringify(serializeWorld(makePark()));

  it('reports corrupt json, wrong shapes and an unsupported version separately', () => {
    expect(parseSave('{not json')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave('null')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave('42')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify({ ...JSON.parse(good()), version: SAVE_VERSION + 1 }))).toEqual({ ok: false, reason: 'version' });
    expect(parseSave('{"version":1}')).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects unknown buildings, overlapping footprints, bad layers and bad status', () => {
    const base = JSON.parse(good());
    const withBuilding = (patch: object) => ({ ...base, buildings: [{ ...base.buildings[0], ...patch }, ...base.buildings.slice(1)] });
    expect(parseSave(JSON.stringify(withBuilding({ defId: 'nope' })))).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify(withBuilding({ x: -5 })))).toEqual({ ok: false, reason: 'corrupt' });
    const overlap = { ...base, buildings: [...base.buildings, { ...base.buildings[0], id: 99 }] };
    expect(parseSave(JSON.stringify(overlap))).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify({ ...base, path: '101' }))).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify({ ...base, status: 'cheating' }))).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify({ ...base, money: 'lots' }))).toEqual({ ok: false, reason: 'corrupt' });
  });
});

describe('storage', () => {
  it('saves and loads through a storage object', () => {
    const st = fakeStorage();
    const w = makePark();
    for (let i = 0; i < 800; i++) stepWorld(w);
    expect(saveToStorage(w, st)).toBe(true);
    expect(st.data.has(SAVE_KEY)).toBe(true);
    const r = loadFromStorage(st);
    expect(r.ok).toBe(true);
    if (r.ok) expect(snap(r.world)).toEqual(snap(w));
    clearSave(st);
    expect(loadFromStorage(st)).toEqual({ ok: false, reason: 'empty' });
  });

  it('backs up an unreadable save before it can be overwritten', () => {
    const st = fakeStorage({ [SAVE_KEY]: '{"version":999}' });
    expect(loadFromStorage(st)).toEqual({ ok: false, reason: 'version' });
    expect(st.data.get(BACKUP_KEY)).toBe('{"version":999}');
    const st2 = fakeStorage({ [SAVE_KEY]: 'garbage' });
    expect(loadFromStorage(st2)).toEqual({ ok: false, reason: 'corrupt' });
    expect(st2.data.get(BACKUP_KEY)).toBe('garbage');
  });

  it('degrades gracefully when storage is missing or throws', () => {
    expect(saveToStorage(makePark(), null)).toBe(false);
    expect(loadFromStorage(null)).toEqual({ ok: false, reason: 'unavailable' });
    const full: KV = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(saveToStorage(makePark(), full)).toBe(false);
    expect(loadFromStorage(full)).toEqual({ ok: false, reason: 'unavailable' });
    expect(() => clearSave(full)).not.toThrow();
  });
});
