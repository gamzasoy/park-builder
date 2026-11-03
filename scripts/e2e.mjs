// E2E: 실제 브라우저에서 건설 → 운영 → 저장/복원을 확인하고 스크린샷을 e2e-out/에 남긴다.
import { mkdirSync } from 'node:fs';
import { check, launch } from './lib.mjs';

mkdirSync('e2e-out', { recursive: true });
const { server, page, close } = await launch();
const shot = (name) => page.screenshot({ path: `e2e-out/${name}.png` });
const game = (fn, arg) => page.evaluate(fn, arg);

try {
  await page.goto(server.url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game);
  await shot('01-start');

  const at = (x, y) => game(([a, b]) => window.__game.tileToScreen(a, b), [x, y]);
  const click = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); };

  // 길: 입구(24,47) 위로 (24,33)까지 드래그
  await page.click('[data-tool="path"]');
  const a = await at(24, 46);
  const b = await at(24, 33);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  check(await game(() => window.__game.world.map.isPath(24, 40)), '드래그로 길이 깔림');

  // 놀이기구(회전목마) — 입구가 길 끝 (24,33)에 닿는다
  await page.click('[data-tool="build:carousel"]');
  await click(24, 32); // 앵커(23,31) → 입구 (24,33)
  check(await game(() => window.__game.world.buildings.size === 1), '놀이기구 설치');

  // 매점(햄버거) — R을 3번 눌러 입구를 -x쪽(길)으로
  await page.click('[data-tool="build:burger"]');
  for (let i = 0; i < 3; i++) await page.keyboard.press('r');
  await click(25, 40);
  check(await game(() => window.__game.world.buildings.size === 2), '매점 설치');
  await page.keyboard.press('Escape');
  await shot('02-built');

  const money0 = await game(() => window.__game.world.money);
  await game(() => window.__game.step(3000));
  const w = await game(() => ({
    guests: window.__game.world.guests.length,
    entered: window.__game.world.stats.entered,
    money: window.__game.world.money,
    served: [...window.__game.world.buildings.values()].reduce((s, b) => s + b.served, 0),
  }));
  check(w.entered > 0, `손님 입장 (${w.entered}명)`);
  check(w.served > 0, `시설 이용 발생 (${w.served}회)`);
  check(w.money > money0 - 1, `돈 증가 (${money0} → ${w.money})`);
  await shot('03-running');

  // 저장 → 새로고침 → 복원 (실시간으로 돌고 있으므로 먼저 일시정지)
  await game(() => window.__game.setSpeed(0));
  const before = await game(() => ({
    money: window.__game.world.money,
    buildings: window.__game.world.buildings.size,
    tick: window.__game.world.tick,
  }));
  await page.click('#save-btn');
  await page.reload();
  await page.waitForFunction(() => window.__game);
  const after = await game(() => ({
    money: window.__game.world.money,
    buildings: window.__game.world.buildings.size,
    tick: window.__game.world.tick,
  }));
  check(after.buildings === before.buildings, `건물 복원 (${after.buildings}개)`);
  check(after.money === before.money && after.tick === before.tick, '돈·시간 복원');
  await shot('04-restored');

  console.log('\nE2E 통과. 스크린샷: e2e-out/');
} catch (e) {
  await shot('failure').catch(() => {});
  console.error(e.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}
