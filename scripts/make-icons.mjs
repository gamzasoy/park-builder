// 홈 화면 아이콘 생성: 게임 스프라이트(관람차)를 큰 캔버스에 그려 PNG로 저장한다.
// 결과(public/icons/*.png)는 커밋하므로 아이콘을 바꿀 때만 `node scripts/make-icons.mjs`로 다시 만든다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer, chromium } from './lib.mjs';

const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
try {
  await page.goto(server.url);
  await page.waitForFunction(() => window.__game);
  const render = (size) => page.evaluate(async (size) => {
    const { getDef } = await import('/src/data/index.ts');
    const { tileToWorld } = await import('/src/render/iso.ts');
    const { drawRideSprite } = await import('/src/render/sprites.ts');
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    // 배경: 잔디색 그라데이션 (maskable 안전 영역을 위해 전체를 채운다)
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#5aa84a');
    g.addColorStop(1, '#2f6b2c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // 아이콘 좌표계(44x40)로 그린 뒤 가운데 약 90%에 맞춘다
    const W = 44, H = 40, id = 'wheel';
    const def = getDef(id);
    const w = def.w, h = def.h, height = 110;
    const span = (w + h) * 32;
    const z = Math.min((W - 4) / span, (H - 4) / ((w + h) * 16 + height));
    const P = (tx, ty) => {
      const p = tileToWorld(tx - w / 2, ty - h / 2);
      return { x: W / 2 + p.x * z, y: H - 3 - ((w + h) * 16) * z / 2 + p.y * z };
    };
    const q = { top: P(0, 0), right: P(w, 0), bottom: P(w, h), left: P(0, h) };
    const s = (size * 0.92) / W;
    ctx.translate((size - W * s) / 2, (size - H * s) / 2 + size * 0.0);
    ctx.scale(s, s);
    drawRideSprite(ctx, id, q, { z, time: 0, running: false, color: def.color, rot: 0 }, w, h);
    return c.toDataURL('image/png');
  }, size);
  mkdirSync('public/icons', { recursive: true });
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const url = await render(size);
    writeFileSync(`public/icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', name);
  }
} finally {
  await browser.close();
  await server.close();
}
