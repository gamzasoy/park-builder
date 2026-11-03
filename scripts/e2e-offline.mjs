// 오프라인 E2E: 프로덕션 빌드(dist)를 vite preview로 띄워 서비스 워커 등록 → 오프라인 전환 → 새로고침해도 뜨는지 확인.
// 사전 조건: `npm run build`
import { existsSync } from 'node:fs';
import { preview } from 'vite';
import { check, chromium } from './lib.mjs';

if (!existsSync('dist/sw.js')) throw new Error('dist/가 없습니다. 먼저 npm run build 를 실행하세요.');
const server = await preview({ preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 863, height: 360 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => { throw e; });
try {
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller || false, null, { timeout: 10000 }).catch(async () => {
    await page.reload(); // 첫 방문은 controller 가 없을 수 있다
  });
  check(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active?.state === 'activated'), '서비스 워커가 등록·활성화됨');
  const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
  check(cached >= 5, `빌드 산출물이 캐시됨 (${cached}개)`);
  const manifest = await page.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then((r) => r.json()));
  check(manifest.display === 'fullscreen' && manifest.orientation === 'landscape', '매니페스트: 전체 화면·가로');

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#game', { timeout: 5000 });
  check(await page.evaluate(() => document.getElementById('money').textContent.length > 0), '오프라인에서 새로고침해도 게임이 뜸');
  await ctx.setOffline(false);
  console.log('\n오프라인 E2E 통과');
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
