// 성능 측정: 손님 N명(기본 500)에서 rAF 프레임 간격과 시뮬레이션 1틱 시간을 잰다.
// 헤드리스 Chromium(소프트웨어 렌더링)이라 절대값은 대략적이다. 기준: 프레임당 렌더+시뮬 합계 16ms 미만.
import { check, launch } from './lib.mjs';

const N = Number(process.argv[2] ?? 500);
const { server, page, close } = await launch();

try {
  await page.goto(server.url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game);

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
    window.__ops = [...w.buildings.values()].filter((b) => w.network.isOperational(b)).length;
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
    return { tickMs, render1, render04, x1, x4, guests: g.world.guests.length, buildings: g.world.buildings.size, ops: window.__ops };
  });

  check(result.ops === result.buildings, '모든 건물이 운영 가능');
  const f = (v) => v.toFixed(2);
  console.log(`손님 ${result.guests}명, 건물 ${result.buildings}개 (운영 가능 ${result.ops}개)`);
  console.log(`시뮬레이션 1틱: ${f(result.tickMs)}ms`);
  console.log(`렌더 1회: 줌 1.0 ${f(result.render1)}ms / 줌 0.4(전체) ${f(result.render04)}ms`);
  console.log(`1배속 프레임: 평균 ${f(result.x1.avg)}ms / 중앙값 ${f(result.x1.median)}ms / p95 ${f(result.x1.p95)}ms (${result.x1.frames}프레임)`);
  console.log(`4배속 프레임: 평균 ${f(result.x4.avg)}ms / 중앙값 ${f(result.x4.median)}ms / p95 ${f(result.x4.p95)}ms (${result.x4.frames}프레임)`);
  await page.screenshot({ path: 'e2e-out/perf.png' });
  check(result.tickMs < 8, '시뮬레이션 1틱 < 8ms');
  check(result.render1 + result.tickMs * 4 < 16, '4배속 기준 렌더+시뮬 < 16ms');
  check(result.x1.median < 17, '1배속 중앙값 프레임 < 17ms (≈60fps)');
} catch (e) {
  console.error(e.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}
