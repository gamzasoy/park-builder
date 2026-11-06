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
  await page.waitForSelector('#tutorial', { state: 'visible', timeout: 3000 });
  const doneItems = () => page.evaluate(() => document.querySelectorAll('#tu-list li.done').length);
  check((await doneItems()) === 0, '새 게임에서 시작 가이드가 보이고 아직 완료한 단계가 없음');
  check(await page.evaluate(() => document.querySelector('[data-tool="path"]').classList.contains('hint')), '현재 단계의 툴바 버튼(길)이 깜빡임');
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
  await game(() => window.__game.step(10)); // 안내 판정은 10틱마다
  await page.waitForFunction(() => document.querySelectorAll('#tu-list li.done').length === 3, null, { timeout: 3000 });
  check(true, '길·놀이기구·매점 단계가 체크됨 (3/5)');
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

  // 요금(입장료)을 한 칸 올리면 마지막 필수 단계 완료 → 축하 문구
  await page.click('#fee-ctl button:nth-of-type(4)');
  await page.waitForFunction(() => document.querySelectorAll('#tu-list li.done').length === 5, null, { timeout: 3000 });
  await page.waitForFunction(() => document.getElementById('tu-text').textContent.includes('기본 과정을 마쳤어요'), null, { timeout: 3000 });
  check(true, '필수 5단계를 마치면 축하 문구가 나옴');
  await shot('03b-tutorial-done');

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
  // 불러온 직후 루프가 1배속으로 돌기 시작하므로 읽기 전에 몇 틱 지났을 수 있다(그 경우 돈은 비교하지 않는다)
  check(after.tick >= before.tick && after.tick - before.tick < 60 && (after.tick !== before.tick || after.money === before.money), '돈·시간 복원');
  check(await game(() => window.__game.world.tutorial.completed.length >= 5), '안내 진행 상황 복원');
  await shot('04-restored');

  // ---- 롤러코스터: 새 게임에서 UI로 역 설치 → 키보드로 트랙 잇기 → 운행 ----
  await page.click('#new-btn');
  await page.click('#m-choices .choice >> nth=0'); // 시나리오: 초원 공원
  check(await game(() => window.__game.world.buildings.size === 0), '새 게임으로 초기화');

  await page.click('[data-tool="path"]');
  for (const [from, to] of [[[24, 46], [24, 31]], [[24, 31], [21, 31]]]) {
    const p1 = await at(...from);
    const p2 = await at(...to);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 6 });
    await page.mouse.up();
  }
  await page.keyboard.press('Escape');

  await page.click('[data-tool="build:coaster"]');
  await click(21, 30); // 앵커 (20,30): 역 (20..22,30), 입구 (21,31)
  check(await game(() => window.__game.world.buildings.size === 1), '롤러코스터 역 설치');
  await page.waitForSelector('#track-bar', { state: 'visible', timeout: 3000 });
  check(true, '트랙 편집 바가 나타남');

  // 리프트 3 → 좌회전 → 내리막 3 → 좌회전 → 직선 7 → 좌회전 → 직선 3 → 좌회전 → 직선 (마지막 조각 전까지)
  const keys = [
    ...'ccc', 'ArrowLeft', ...Array(3).fill('PageDown'), 'ArrowLeft',
    ...Array(7).fill('ArrowUp'), 'ArrowLeft', ...Array(3).fill('ArrowUp'), 'ArrowLeft',
  ];
  for (const k of keys) await page.keyboard.press(k);
  const mid = await game(() => {
    const b = [...window.__game.world.buildings.values()][0];
    return { n: b.track.pieces.length, closed: b.track.closed, error: b.track.error };
  });
  check(mid.n === 20 && !mid.closed && !mid.error, `트랙 20조각, 아직 미완성 (${mid.n}조각)`);
  await page.screenshot({ path: 'e2e-out/05-coaster-editing.png' });

  await page.keyboard.press('ArrowUp'); // 마지막 직선: 역의 시작 칸으로 돌아와 완성
  const done = await game(() => {
    const b = [...window.__game.world.buildings.values()][0];
    return {
      ok: b.track.ok, fun: b.track.stats.fun, intensity: b.track.stats.intensity,
      operational: window.__game.world.network.isOperational(b),
    };
  });
  check(done.ok, `롤러코스터 완성 (재미 ${done.fun}, 강도 ${done.intensity})`);
  check(done.operational, '입구가 길과 이어져 운영 가능');
  await page.waitForSelector('#track-bar', { state: 'hidden', timeout: 3000 });
  check(true, '완성하면 편집 바가 닫힘');

  // 손님이 타고 열차가 도는 모습: 달리는 중간까지 한 틱씩 진행
  await game(() => { window.__game.setSpeed(0); window.__game.step(600); });
  const ran = await game(() => {
    const g = window.__game;
    const b = [...g.world.buildings.values()][0];
    for (let i = 0; i < 2000 && !(b.phase === 'running' && b.timer < b.track.stats.duration * 0.6); i++) g.step(1);
    return { phase: b.phase, served: b.served, inside: b.inside.length };
  });
  check(ran.phase === 'running' && ran.inside > 0, `손님을 태우고 운행 중 (탑승 ${ran.inside}명)`);
  await page.keyboard.press('Escape'); // 정보 패널을 닫아 열차가 보이게
  await page.screenshot({ path: 'e2e-out/06-coaster-running.png' });

  // 저장 → 새로고침 → 트랙 복원
  await page.click('#save-btn');
  await page.reload();
  await page.waitForFunction(() => window.__game);
  const back = await game(() => {
    const b = [...window.__game.world.buildings.values()][0];
    return { n: b?.track?.pieces.length, ok: b?.track?.ok };
  });
  check(back.n === 21 && back.ok, '새로고침 후 롤러코스터 트랙 복원');
  await page.screenshot({ path: 'e2e-out/07-coaster-restored.png' });

  // ---- 위치 이동: 역을 눌러 정보 패널 → 위치 이동 → 새 자리를 눌러 트랙째 옮긴다 ----
  await click(21, 30);
  await page.waitForSelector('#p-move', { state: 'visible', timeout: 3000 });
  await page.click('#p-move');
  check(await game(() => window.__game.world.buildings.size === 1), '위치 이동 도구 시작');
  await game(() => window.__game.focus(30, 40));
  const dest = await at(30, 40);
  await page.mouse.move(dest.x, dest.y);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'e2e-out/08-coaster-move-preview.png' });
  const moneyBefore = await game(() => window.__game.world.money);
  await page.mouse.click(dest.x, dest.y);
  const moved = await game(() => {
    const b = [...window.__game.world.buildings.values()][0];
    return { x: b.x, y: b.y, ok: b.track.ok, money: window.__game.world.money, old: window.__game.world.map.occupant[window.__game.world.map.index(21, 30)] };
  });
  check(moved.x === 29 && moved.y === 40 && moved.ok && moved.old === 0, `롤러코스터를 트랙째 옮김 (${moved.x},${moved.y})`);
  check(moved.money === moneyBefore, '옮기는 데 돈이 들지 않음');
  await page.screenshot({ path: 'e2e-out/09-coaster-moved.png' });

  // ---- 지형: 지형 도구로 클릭 → 높이 변경, 높이 보정된 마우스 피킹, 규칙 위반은 거절 ----
  await page.click('#new-btn');
  await page.click('#m-choices .choice >> nth=0'); // 시나리오: 초원 공원
  await page.click('[data-tool="terrain:raise"]');
  const heightAt = (x, y) => game(([a, b]) => window.__game.world.map.heightAt(a, b), [x, y]);
  const money1 = await game(() => window.__game.world.money);
  await click(21, 40);
  await click(22, 40);
  await click(21, 40); // 이웃(20,40)이 0이라 2단계는 안 됨 → 거절
    check((await heightAt(21, 40)) === 1 && (await heightAt(22, 40)) === 1, '지형 올리기 클릭으로 높이 1 (이웃과의 차이 규칙으로 두 번째는 거절)');
  check((await game(() => window.__game.world.money)) === money1 - 40, '지형 비용 칸당 ₩20');
  // 언덕: 드래그로 한 줄, 클릭으로 앞뒤 칸을 올린 뒤 가운데를 한 단 더 올린다(이웃과 1단계 차이 규칙)
  await click(22, 33); // 뒤쪽 칸부터: 앞 칸이 솟으면 뒤 칸 중앙은 그 뒤에 가려진다
  const da = await at(21, 34);
  const db = await at(23, 34);
  await page.mouse.move(da.x, da.y);
  await page.mouse.down();
  await page.mouse.move(db.x, db.y, { steps: 6 });
  await page.mouse.up();
  check((await heightAt(22, 34)) === 1 && (await heightAt(23, 34)) === 1, '지형 도구 드래그로 한 줄 올림');
  await click(22, 35);
  await click(22, 34);
  check((await heightAt(22, 34)) === 2, '언덕 한가운데를 한 단 더 올리면 높이 2');
  // 마우스가 윗면 위에 있으면 그 칸이 호버로 잡혀야 한다(높이 보정)
  for (const [x, y] of [[22, 34], [21, 40], [30, 30]]) {
    const p = await at(x, y);
    await page.mouse.move(p.x, p.y);
    const hv = await game(() => window.__game.hover());
    check(hv && hv.x === x && hv.y === y, `높이가 있는 칸 위에서도 호버 칸이 맞음 (${x},${y})`);
  }
  await page.mouse.move(await (async () => { const p = await at(30, 30); return p.x; })(), 600);
  await game(() => { window.__game.setZoom(1.3); window.__game.focus(22, 37); });
  await page.waitForTimeout(150);
  await shot('08-terrain');
  // 내리기
  await page.click('[data-tool="terrain:lower"]');
  await click(22, 40);
  check((await heightAt(22, 40)) === 0, '지형 내리기 클릭으로 평지로');

  console.log('\nE2E 통과. 스크린샷: e2e-out/');
} catch (e) {
  await shot('failure').catch(() => {});
  console.error(e.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}
