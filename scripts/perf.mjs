// 성능 측정: 손님 N명(기본 500)에서 rAF 프레임 간격과 시뮬레이션 1틱 시간을 잰다.
// 헤드리스 Chromium(소프트웨어 렌더링)이라 절대값은 대략적이다. 기준: 프레임당 렌더+시뮬 합계 16ms 미만.
import { check, launch } from './lib.mjs';

// 사용법: node scripts/perf.mjs [손님 수=500] [--mobile]   (--mobile: 가로 폰 화면 + CPU 4배 감속)
const MOBILE = process.argv.includes('--mobile');
const N = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 500);
const { server, page, close } = await launch({ mobile: MOBILE });
if (MOBILE) console.log('[모바일 에뮬레이션: 863x360, DPR 2, CPU 4배 감속]');

try {
  await page.goto(server.url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => document.querySelector('#m-buttons button.primary')?.click()); // 환영 화면 닫기

  // 건물 여러 개 + 길 (화면에 보이는 규모)
  await page.evaluate(() => {
    const g = window.__game;
    g.world.money = 1_000_000;
  });
  await page.evaluate(async () => {
    const mod = await import('/src/sim/building.ts');
    const data = await import('/src/data/index.ts');
    const w = window.__game.world;
    const all = [];
    for (let y = 20; y <= 46; y++) all.push({ x: 24, y });
    mod.placePaths(w, all);
    // 길(x=24) 양옆에 입구가 길을 향하도록 배치: 왼쪽은 회전 1, 오른쪽은 회전 3
    const rides = [['carousel', 22], ['wheel', 26], ['bumper', 31], ['drop', 36]];
    for (const [id, y] of rides) {
      const def = data.getDef(id);
      mod.placeBuilding(w, def, 24 - def.w, y, 1);
      mod.placeBuilding(w, def, 25, y, 3);
    }
    for (const y of [41, 43]) mod.placeBuilding(w, data.getDef('burger'), 25, y, 3);
    // 롤러코스터 2대(트랙 21조각, 완성된 코스). 길을 잇지 않아 운영은 안 하지만 트랙·열차 렌더 비용은 포함된다.
    const te = await import('/src/sim/trackedit.ts');
    const KIND = { S: 'straight', L: 'left', U: 'up', D: 'down', C: 'lift' };
    for (const sy of [20, 38]) {
      const b = mod.placeBuilding(w, data.getDef('coaster'), 30, sy, 0);
      for (const ch of 'CCCLDDDLSSSSSSSLSSSLS') te.appendPiece(w, b, KIND[ch]);
    }
    // 지형: 길·건물 반대쪽(x<20)에 언덕을 깔아 지면 조각이 비탈·절벽을 그리는 비용을 포함한다
    for (let y = 8; y < 47; y++) for (let x = 0; x < 20; x++) {
      w.map.setHeight(x, y, Math.round(2 + 1.5 * Math.sin(x / 3) * Math.cos(y / 3)));
    }
    for (let k = 0; k < 6; k++) for (let y = 8; y < 47; y++) for (let x = 0; x < 19; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const a = w.map.heightAt(x, y), b = w.map.heightAt(x + dx, y + dy);
        if (b > a + 1) w.map.setHeight(x + dx, y + dy, a + 1);
        if (a > b + 1) w.map.setHeight(x, y, b + 1);
      }
    }
    window.__coasters = [...w.buildings.values()].filter((b) => b.track?.ok).length;
    window.__ops = [...w.buildings.values()].filter((b) => !b.track && w.network.isOperational(b)).length;
  });
  await page.evaluate((n) => window.__game.spawn(n), N);

  const result = await page.evaluate(async () => {
    const g = window.__game;
    g.setZoom(1);
    // 1) 시뮬레이션 1틱 시간
    const t0 = performance.now();
    const TICKS = 200;
    g.step(TICKS);
    const tickMs = (performance.now() - t0) / TICKS;

    // 1b) 렌더 1회 시간 (확대 1배 / 맵 전체가 보이는 0.4배)
    const renderMs = (zoom) => {
      g.setZoom(zoom);
      g.render();
      const t = performance.now();
      for (let i = 0; i < 100; i++) g.render();
      return (performance.now() - t) / 100;
    };
    const render1 = renderMs(1);
    const render04 = renderMs(0.4);
    g.setZoom(1);

    // 2) rAF 프레임 간격 (1배속 / 4배속)
    const measure = (speed) => new Promise((resolve) => {
      g.setSpeed(speed);
      const times = [];
      let last = performance.now();
      const end = last + 4000;
      const f = (now) => {
        times.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(f);
        else {
          times.shift();
          times.sort((a, b) => a - b);
          const avg = times.reduce((s, v) => s + v, 0) / times.length;
          resolve({ avg, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], frames: times.length });
        }
      };
      requestAnimationFrame(f);
    });
    const x1 = await measure(1);
    const x4 = await measure(4);
    return { tickMs, render1, render04, x1, x4, guests: g.world.guests.length, buildings: g.world.buildings.size, ops: window.__ops, coasters: window.__coasters };
  });

  check(result.coasters === 2, '완성된 롤러코스터 2대');
  check(result.ops === result.buildings - 2, '코스터를 뺀 모든 건물이 운영 가능');
  const f = (v) => v.toFixed(2);
  console.log(`손님 ${result.guests}명, 건물 ${result.buildings}개 (롤러코스터 ${result.coasters}대 포함, 일반 시설 운영 ${result.ops}개)`);
  console.log(`시뮬레이션 1틱: ${f(result.tickMs)}ms`);
  console.log(`렌더 1회: 줌 1.0 ${f(result.render1)}ms / 줌 0.4(전체) ${f(result.render04)}ms`);
  console.log(`1배속 프레임: 평균 ${f(result.x1.avg)}ms / 중앙값 ${f(result.x1.median)}ms / p95 ${f(result.x1.p95)}ms (${result.x1.frames}프레임)`);
  console.log(`4배속 프레임: 평균 ${f(result.x4.avg)}ms / 중앙값 ${f(result.x4.median)}ms / p95 ${f(result.x4.p95)}ms (${result.x4.frames}프레임)`);
  await page.screenshot({ path: 'e2e-out/perf.png' });
  if (MOBILE) {
    // 4배 감속 + 소프트웨어 렌더링(GPU 없음)은 실제 폰보다 훨씬 가혹하다. 목표 수치가 아니라 회귀 방지선(현재 약 96ms)이다.
    check(result.tickMs < 32, '시뮬레이션 1틱 < 32ms (감속 포함)');
    check(result.render1 < 130, '렌더 1회 < 130ms (회귀 방지선)');
    check(result.x1.median < 134, '1배속 중앙값 프레임 < 134ms (회귀 방지선)');
  } else {
    check(result.tickMs < 8, '시뮬레이션 1틱 < 8ms');
    check(result.render1 + result.tickMs * 4 < 16, '4배속 기준 렌더+시뮬 < 16ms');
    check(result.x1.median < 17, '1배속 중앙값 프레임 < 17ms (≈60fps)');
  }
} catch (e) {
  console.error(e.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}
