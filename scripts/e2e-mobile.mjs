// 모바일 E2E: 휴대폰 가로 화면 + 실제 터치 입력(CDP)으로 건설·핀치·패널·세로 안내를 확인한다.
import { mkdirSync } from 'node:fs';
import { check, chromium, startServer } from './lib.mjs';
import { createRequire } from 'node:module';

const { devices } = createRequire(import.meta.url)('playwright');
mkdirSync('e2e-out', { recursive: true });

const server = await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => { throw e; });
const cdp = await ctx.newCDPSession(page);
const shot = (name) => page.screenshot({ path: `e2e-out/m-${name}.png` });
const game = (fn, arg) => page.evaluate(fn, arg);
const at = (x, y) => game(([a, b]) => window.__game.tileToScreen(a, b), [x, y]);

// ---- 실제 터치 이벤트 합성 (CDP Input.dispatchTouchEvent) ----
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
});
async function drag(from, to, steps = 8) {
  await touch('touchStart', [from]);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
  }
  await touch('touchEnd', []);
}
const tapAt = async (p) => { await touch('touchStart', [p]); await touch('touchEnd', []); };

try {
  await page.goto(server.url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game);
  const vp = page.viewportSize();
  check(vp.width > vp.height, `가로 화면 (${vp.width}x${vp.height})`);

  check(await game(() => document.getElementById('tu-body').hidden), '시작 가이드가 모바일에서 접힌 채로 시작');
  check(await game(() => getComputedStyle(document.getElementById('rotate-hint')).display === 'none'), '가로일 때는 회전 안내가 없음');
  check(await game(() => document.getElementById('tool-actions').hidden), '도구가 없으면 회전/취소 버튼이 숨겨져 있음');
  check(await game(() => document.documentElement.scrollWidth <= window.innerWidth), '페이지에 가로 스크롤이 없음');
  await shot('01-start');
  const hintBox = await game(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const h = r('hint'), t = r('tutorial'), tb = r('toolbar'), el = document.getElementById('hint');
    const overlap = !(h.right <= t.left || h.left >= t.right || h.bottom <= t.top || h.top >= t.bottom);
    return { overlap, clipped: el.scrollWidth > el.clientWidth + 1, aboveToolbar: h.bottom <= tb.top, inside: h.left >= 0 && h.right <= innerWidth };
  });
  check(!hintBox.overlap && !hintBox.clipped && hintBox.aboveToolbar && hintBox.inside, '안내 쪽지가 시작 가이드에 가리지 않고 잘리지 않음(툴바 바로 위)');
  const textSizes = await game(() => {
    const set = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && /[가-힣0-9₩]/.test(n.textContent))) continue;
      set.add(getComputedStyle(el).fontSize);
    }
    return [...set].sort();
  });
  check(textSizes.length <= 3, `화면 글자 크기가 세 단계 이하 (${textSizes.join(', ')})`);
  check(await game(() => getComputedStyle(document.documentElement).webkitTextSizeAdjust === '100%' || getComputedStyle(document.documentElement).textSizeAdjust === '100%'), '브라우저 글자 자동 확대를 끔');
  check(await game(() => { const g = document.getElementById('goal'); return g.scrollWidth <= g.clientWidth + 1 && g.getBoundingClientRect().right <= innerWidth; }), '목표 표시가 잘리지 않음');

  // 도구 막대 접기/펼치기
  const tbTop = () => game(() => { const t = document.getElementById('toolbar'); return getComputedStyle(t).display === 'none' ? Infinity : t.getBoundingClientRect().top; });
  const openTop = await tbTop();
  await page.locator('#tb-toggle').tap();
  check((await tbTop()) === Infinity, '접기 버튼으로 도구 막대가 사라져 공원이 넓어짐');
  check(await game(() => document.getElementById('tb-toggle').getBoundingClientRect().bottom <= window.innerHeight), '접은 뒤에도 펼치기 버튼이 화면 안에 있음');
  await shot('01b-folded');
  await page.reload();
  await page.waitForFunction(() => window.__game);
  check((await tbTop()) === Infinity, '접은 상태가 새로고침 후에도 유지됨');
  await page.locator('#tb-toggle').tap();
  check(Math.abs((await tbTop()) - openTop) < 2, '펼치기 버튼으로 도구 막대가 다시 나타남');


  // 그룹 탭: 한 그룹만 펼쳐 보이고, 탭을 누르면 그 그룹으로 바뀐다
  const visibleTools = () => game(() => [...document.querySelectorAll('#toolbar .group button')].filter((b) => b.offsetParent !== null).map((b) => b.dataset.tool));
  const tab = (name) => page.locator('#toolbar .tb-tab', { hasText: name }).tap();
  check(await game(() => document.querySelectorAll('#toolbar .tb-tab').length >= 8), '휴대폰에서는 그룹 탭이 보임');
  check((await visibleTools()).join() === 'path,demolish', `처음엔 기본 그룹만 펼쳐짐 (${(await visibleTools()).join()})`);
  await tab('놀이기구');
  const rideTools = await visibleTools();
  check(rideTools.length >= 10 && rideTools.every((k) => k.startsWith('build:')), `탭을 누르면 놀이기구만 보임 (${rideTools.length}개)`);
  check(await game(() => { const g = document.querySelector('#toolbar .group.open'); return g.scrollWidth <= window.innerWidth; }), '놀이기구 그룹이 옆으로 넘기지 않아도 한 화면에 들어감');
  check(await game(() => document.querySelector('#toolbar .tb-tab.active').textContent.includes('놀이기구')), '선택한 탭이 강조됨');
  await shot('01c-tabs');
  await tab('기본');

  // 시작 위치에서는 길 아래쪽이 툴바에 가리므로 카메라를 작업 지점으로 옮긴다
  await game(() => { window.__game.setZoom(0.8); window.__game.focus(24, 39); });

  // 길: 도구를 탭 → 손가락으로 드래그
  await page.locator('[data-tool="path"]').tap();
  await page.waitForFunction(() => !document.getElementById('tool-actions').hidden, null, { timeout: 2000 });
  check(true, '도구를 켜면 취소 버튼이 보임');
  const a = await at(24, 44), b = await at(24, 33);
  await touch('touchStart', [a]);
  await touch('touchMove', [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]);
  check(await game(() => !window.__game.world.map.isPath(24, 40)), '손가락을 떼기 전에는 길이 깔리지 않음(미리보기만)');
  await touch('touchMove', [b]);
  await touch('touchEnd', []);
  check(await game(() => window.__game.world.map.isPath(24, 40) && window.__game.world.map.isPath(24, 34)), '터치 드래그로 길이 깔림');
  await shot('02-path');

  // 건물: 손가락을 대고 있는 동안은 설치되지 않고, 떼면 설치
  await tab('놀이기구');
  await page.locator('[data-tool="build:carousel"]').tap();
  const c = await at(24, 32);
  await touch('touchStart', [c]);
  await touch('touchMove', [{ x: c.x + 2, y: c.y + 2 }]);
  check(await game(() => window.__game.world.buildings.size === 0), '건물은 손가락을 떼기 전에는 설치되지 않음');
  await touch('touchEnd', []);
  check(await game(() => window.__game.world.buildings.size === 1), '손가락을 떼면 건물이 설치됨');
  await shot('03-built');

  // 두 번째 손가락이 닿으면 진행 중이던 길 깔기가 취소된다
  await tab('기본');
  await page.locator('[data-tool="path"]').tap();
  const p1 = await at(20, 40), p2 = await at(20, 36);
  await touch('touchStart', [p1]);
  await touch('touchStart', [p1, { x: p1.x + 80, y: p1.y }]);
  await touch('touchMove', [p2, { x: p1.x + 80, y: p1.y }]);
  await touch('touchEnd', []);
  check(await game(() => !window.__game.world.map.isPath(20, 38)), '두 번째 손가락이 닿으면 건설이 취소됨');
  await page.locator('#act-cancel').tap(); // 길 도구 해제
  await page.waitForFunction(() => document.getElementById('tool-actions').hidden, null, { timeout: 2000 });
  check(true, '취소 버튼으로 도구가 해제됨');

  // 핀치 줌
  const z0 = await game(() => window.__game.camera().zoom);
  const cx = vp.width / 2, cy = vp.height / 2;
  await touch('touchStart', [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: cx - 40 - i * 15, y: cy }, { x: cx + 40 + i * 15, y: cy }]);
  await touch('touchEnd', []);
  const z1 = await game(() => window.__game.camera().zoom);
  check(z1 > z0 * 1.5, `핀치로 확대됨 (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
  await shot('04-pinch');

  // 한 손가락 드래그 = 화면 이동 (선택 모드)
  const cam0 = await game(() => window.__game.camera());
  await drag({ x: 300, y: 200 }, { x: 400, y: 160 });
  const cam1 = await game(() => window.__game.camera());
  check(cam1.x < cam0.x && cam1.y > cam0.y, '선택 모드에서 한 손가락 드래그로 화면이 이동');

  // 탭으로 건물 선택 → 패널 열고 닫기
  await game(() => window.__game.setZoom(1));
  await game(() => window.__game.focus(24, 32));
  const bp = await at(24, 32);
  await tapAt({ x: bp.x, y: bp.y - 10 });
  await page.waitForSelector('#panel:not([hidden])', { timeout: 2000 });
  check(true, '건물을 탭하면 정보 패널이 열림');
  const box = await game(() => { const r = document.getElementById('panel').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const tb = await game(() => document.getElementById('toolbar').getBoundingClientRect().top);
  check(box.bottom <= tb + 1 && box.top >= 0, `패널이 HUD와 툴바 사이에 들어감 (${Math.round(box.top)}~${Math.round(box.bottom)} / 툴바 ${Math.round(tb)})`);
  await shot('05-panel');
  const closeH = await game(() => document.getElementById('p-close').getBoundingClientRect().height);
  check(closeH >= 30, `닫기 버튼이 충분히 큼 (${closeH}px)`);
  await page.locator('#p-close').tap();
  await page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2000 });
  check(true, '닫기 버튼으로 패널이 닫힘');

  // 길게 누르기: 건물을 손가락으로 길게 누른 채 끌어 놓으면 그 자리로 옮겨진다
  const before = await game(() => { const b = [...window.__game.world.buildings.values()][0]; return { x: b.x, y: b.y }; });
  const lp = { x: bp.x, y: bp.y - 10 };
  const to = await at(19, 31);
  const camStart = await game(() => window.__game.camera());
  await touch('touchStart', [lp]);
  await page.waitForTimeout(650);
  check(await game(() => /끌어서 놓으면/.test(document.getElementById('hint').textContent)), '건물을 길게 누르면 옮기기가 시작됨');
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: lp.x + ((to.x - lp.x) * i) / 6, y: lp.y + ((to.y - lp.y) * i) / 6 }]);
  await touch('touchEnd', []);
  const after = await game(() => { const b = [...window.__game.world.buildings.values()][0]; return { x: b.x, y: b.y }; });
  check(after.x < before.x, `끌어서 놓은 곳으로 옮겨짐 (${before.x},${before.y} → ${after.x},${after.y})`);
  const camEnd = await game(() => window.__game.camera());
  check(camStart.x === camEnd.x && camStart.y === camEnd.y, '끄는 동안 화면이 움직이지 않음');
  await shot('05b-longpress-moved');

  // 세로 방향: 안내 표시
  await page.setViewportSize({ width: vp.height, height: vp.width });
  check(await game(() => getComputedStyle(document.getElementById('rotate-hint')).display === 'flex'), '세로로 들면 "가로로 돌려 주세요" 안내가 덮임');
  await shot('06-portrait');
  await page.setViewportSize(vp);
  console.log('\n모바일 E2E 통과');
} finally {
  await browser.close();
  await server.close();
}
