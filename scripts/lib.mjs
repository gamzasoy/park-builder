import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
// Playwright는 환경에 사전 설치되어 있다(프로젝트 의존성이 아님).
export const { chromium } = require('playwright');

/** Vite 개발 서버를 띄우고 URL과 종료 함수를 반환 */
export async function startServer() {
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer.address();
  return { url: `http://127.0.0.1:${addr.port}/`, close: () => server.close() };
}

export async function launch() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => { throw e; });
  return { server, browser, page, close: async () => { await browser.close(); await server.close(); } };
}

export function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok   ${msg}`);
}
