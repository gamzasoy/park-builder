import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { Input } from './input/input';
import { ToolController } from './input/tools';
import { Camera } from './render/camera';
import { tileToWorld, tileToWorldZ } from './render/iso';
import { drawFrame } from './render/renderer';
import { loadFromStorage, saveToStorage } from './save/save';
import { DAY_TICKS, DAYS_PER_MONTH, WAGE } from './sim/economy';
import { createGuest } from './sim/guest';
import { stepWorld } from './sim/sim';
import { hireStaff, STAFF_NAME } from './sim/staff';
import { World } from './sim/world';
import { Hud, won } from './ui/hud';
import { Modal } from './ui/modal';
import { BuildingPanel, FinancePanel, GuestPanel, StaffPanel } from './ui/panels';
import { Sound } from './ui/sound';
import { TrackEditor } from './ui/trackEditor';
import { TestRun } from './render/testrun';
import { TutorialPanel } from './ui/tutorial';
import type { TrackType } from './sim/coaster';
import { Toolbar } from './ui/toolbar';

const AUTOSAVE_MS = 15_000;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const cam = new Camera();
const world = new World();
const tools = new ToolController(world);
const input = new Input(canvas, cam);
input.getMap = () => world.map;
const modal = new Modal();
const sound = new Sound();
tools.onEvent = (e) => sound.play(e);

const soundBtn = document.getElementById('sound-btn')!;
const renderSoundBtn = (): void => { soundBtn.textContent = sound.muted ? '소리 꺼짐' : '소리 켜짐'; };
renderSoundBtn();
soundBtn.addEventListener('click', () => {
  sound.toggle();
  renderSoundBtn();
  soundBtn.blur();
  sound.play('chime'); // 켰을 때 바로 들려준다(꺼졌으면 무음)
});

// ---- 저장 / 불러오기 ----
let lastSaveAt = performance.now();
function saveNow(): boolean {
  lastSaveAt = performance.now();
  return saveToStorage(world);
}

const loaded = loadFromStorage();
if (loaded.ok) {
  world.adopt(loaded.world);
  tools.notify('저장된 공원을 불러왔습니다');
} else if (loaded.reason === 'corrupt' || loaded.reason === 'version') {
  tools.notify('저장 데이터를 읽을 수 없어 새로 시작합니다 (이전 데이터는 백업됨)');
}

function newGame(): void {
  const fresh = new World();
  fresh.rng = new Rng((Math.random() * 2 ** 32) >>> 0);
  fresh.weatherSeed = fresh.rng.state; // rng를 소비하지 않고 시드만 따온다
  world.adopt(fresh);
  tools.reset();
  financePanel.sync();
  tutorialPanel.reset();
  seenReports = world.reports.length;
  loop.speed = 1;
  modal.hide();
  saveNow();
  tools.notify('새 게임을 시작했습니다');
}

function confirmNewGame(): void {
  modal.show('confirm', {
    title: '새 게임',
    message: '지금까지의 공원이 사라집니다. 새로 시작할까요?',
    buttons: [
      { label: '취소', onClick: () => modal.hide() },
      { label: '새 게임', primary: true, onClick: newGame },
    ],
  });
}

// ---- 월간 보고서 알림음 ----
let seenReports = 0;
function watchReports(): void {
  if (world.reports.length > seenReports) sound.play('chime');
  seenReports = world.reports.length;
}

// ---- 목표 결과 화면 ----
let shownStatus = '';
function watchStatus(): void {
  if (world.status === shownStatus) return;
  shownStatus = world.status;

  if (world.status !== 'won' && world.status !== 'lost') {
    if (modal.kind === 'result') modal.hide();
    return;
  }
  sound.play(world.status === 'won' ? 'win' : 'lose');
  const days = Math.floor(world.tick / DAY_TICKS);
  const months = Math.floor(days / DAYS_PER_MONTH);
  modal.show('result', {
    title: world.status === 'won' ? '목표 달성!' : '게임 종료',
    message: world.endReason,
    rows: [
      ['걸린 기간', `${months}개월 ${days % DAYS_PER_MONTH}일`],
      ['최고 손님 수', `${world.stats.peakGuests}명`],
      ['누적 입장객', `${world.stats.entered.toLocaleString('ko-KR')}명`],
      ['최종 평점', String(Math.round(world.rating))],
      ['보유 금액', won(world.money)],
      ['건물', `${world.buildings.size}개`],
    ],
    buttons: [
      { label: '자유 모드로 계속', onClick: () => { world.status = 'sandbox'; modal.hide(); saveNow(); } },
      { label: '새 게임', primary: true, onClick: newGame },
    ],
  });
  saveNow();
}

// ---- 루프 ----
const testRun = new TestRun();
let lastFrame = performance.now();
const loop = new GameLoop(
  () => stepWorld(world),
  (alpha) => {
    const now = performance.now();
    input.arrowsPan = tools.tool.kind !== 'track';
    const frameDt = Math.min((now - lastFrame) / 1000, 0.1);
    input.update(frameDt);
    testRun.update(world, frameDt);
    lastFrame = now;
    drawFrame(ctx, cam, world, {
      hover: input.hoverTile,
      preview: tools.preview(input.hoverTile),
      alpha,
      selectedId: tools.selectedId,
      selectedGuestId: tools.selectedGuestId,
      selectedStaffId: tools.selectedStaffId,
      testRun,
    });
    hud.update();
    toolbar.sync();
    syncToolActions();
    buildingPanel.update();
    guestPanel.update();
    staffPanel.update();
    trackEditor.update();
    tutorialPanel.update();
    financePanel.update();
    watchReports();
    watchStatus();
    if (now - lastSaveAt > AUTOSAVE_MS) saveNow();
  },
);

const financePanel = new FinancePanel(world);
const hud = new Hud(world, tools, loop, {
  onFinance: () => financePanel.toggle(),
  onSave: () => tools.notify(saveNow() ? '저장했습니다' : '저장할 수 없습니다 (브라우저 저장소 사용 불가)'),
  onNewGame: confirmNewGame,
});
const toolbar = new Toolbar(document.getElementById('toolbar')!, tools, (kind) => {
  const s = hireStaff(world, kind);
  if (s) {
    tools.notify(`${STAFF_NAME[kind]}를 고용했습니다 (하루 급여 ${won(WAGE)})`);
    sound.play('build');
  } else {
    tools.notify('더 이상 고용할 수 없습니다');
    sound.play('error');
  }
});
const buildingPanel = new BuildingPanel(world, tools, testRun);
const guestPanel = new GuestPanel(world, tools);
const staffPanel = new StaffPanel(world, tools);
const trackEditor = new TrackEditor(world, tools, testRun);
const tutorialPanel = new TutorialPanel(world, toolbar);

input.onLeftDown = (t, pos) => tools.onDown(t, pos);
input.onTouchCancel = () => tools.cancelDrag();
// 한 손가락: 건설 도구가 켜져 있으면 건설 입력, 아니면 화면 이동/탭 선택
input.buildMode = () => tools.isBuilding;
// 건물·철거는 누르는 순간 실행되므로 터치에서는 손가락을 뗄 때 실행(위치를 맞춘 뒤 놓을 수 있게)
input.deferOnTouch = () => tools.tool.kind === 'build' || tools.tool.kind === 'demolish';

// 도구가 켜져 있을 때만 보이는 화면 버튼(R / Esc 대응)
const toolActions = document.getElementById('tool-actions')!;
document.getElementById('act-rotate')!.addEventListener('click', () => tools.rotate());
document.getElementById('act-cancel')!.addEventListener('click', () => tools.cancel());
function syncToolActions(): void {
  const k = tools.tool.kind;
  const show = k !== 'none' && k !== 'track';
  if (toolActions.hidden === show) toolActions.hidden = !show;
  const rot = document.getElementById('act-rotate')!;
  const canRotate = k === 'build';
  if (rot.hidden === canRotate) rot.hidden = !canRotate;
}

input.onLeftUp = (t) => tools.onUp(t);
const TRACK_KEYS: Record<string, TrackType> = {
  arrowup: 'straight', arrowleft: 'left', arrowright: 'right', pageup: 'up', pagedown: 'down', c: 'lift', b: 'brake', l: 'loop',
};
input.onKeyDown = (k) => {
  // 트랙 편집 중에는 방향키·PgUp/PgDn·C로 다음 조각을 잇는다
  if (tools.tool.kind === 'track') {
    if (TRACK_KEYS[k]) return tools.placeTrackPiece(TRACK_KEYS[k]);
    if (k === 'backspace') return tools.undoTrackPiece();
    if (k === 'enter') return tools.endTrackEdit();
  }
  if (k === 'r') tools.rotate();
  else if (k === 'escape') tools.cancel();
  // 속도 단축키: Space 일시정지 토글, 1/2/3 = 1x/2x/4x
  else if (k === ' ') loop.speed = loop.speed === 0 ? 1 : 0;
  else if (k === '1') loop.speed = 1;
  else if (k === '2') loop.speed = 2;
  else if (k === '3') loop.speed = 4;
};

// 탭을 닫거나 숨길 때 저장
window.addEventListener('pagehide', saveNow);
// 백그라운드로 가면 즉시 저장하고 루프를 멈춘다(폰에서는 앱 전환 중 탭이 종료될 수 있다)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveNow();
    loop.stop();
  } else {
    lastFrame = performance.now();
    loop.start();
  }
});

// 시작 시 공원 입구가 보이도록 입구와 맵 중앙 사이를 화면 중앙에
const focus = tileToWorld(world.map.width / 2, world.map.height * 0.8);
cam.x = focus.x;
cam.y = focus.y;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // 고해상도 폰에서 픽셀 수 폭증 방지
  cam.viewW = window.innerWidth;
  cam.viewH = window.innerHeight;
  canvas.width = Math.floor(cam.viewW * dpr);
  canvas.height = Math.floor(cam.viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

seenReports = world.reports.length;
financePanel.sync(); // 불러온 보고서 때문에 재무 패널이 저절로 열리지 않게
loop.start();

// 개발 모드 전용 디버그 훅: E2E 테스트에서 시간을 빨리감기 위해 사용 (프로덕션 빌드에서는 제거됨)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = {
    world,
    step: (n: number) => { for (let i = 0; i < n; i++) stepWorld(world); },
    /** 타일 중앙의 화면 좌표(E2E에서 실제 마우스 입력용) */
    tileToScreen: (tx: number, ty: number) => {
      const w = tileToWorldZ(tx + 0.5, ty + 0.5, world.map.heightAt(tx, ty));
      const s = cam.worldToScreen(w.x, w.y);
      const r = canvas.getBoundingClientRect();
      return { x: s.x + r.left, y: s.y + r.top };
    },
    /** 성능 측정용: 손님 n명을 공원 입구에 즉시 생성 */
    spawn: (n: number) => {
      for (let i = 0; i < n; i++) {
        const g = createGuest(world);
        g.money = 1000;
        world.guests.push(g);
        world.stats.entered++;
      }
    },
    /** 렌더 1회 실행(성능 측정용) */
    render: () => drawFrame(ctx, cam, world, {
      hover: null, preview: null, alpha: 0.5, selectedId: null, selectedGuestId: null,
    }),
    setSpeed: (s: 0 | 1 | 2 | 4) => { loop.speed = s; },
    setZoom: (z: number) => { cam.zoom = z; },
    /** 마우스 아래로 판정된 칸(높이 보정 피킹 확인용) */
    hover: () => input.hoverTile,
    /** 카메라를 타일 (tx, ty)의 윗면 중앙으로 */
    focus: (tx: number, ty: number) => {
      const w = tileToWorldZ(tx + 0.5, ty + 0.5, world.map.heightAt(tx, ty));
      cam.x = w.x;
      cam.y = w.y;
    },
  };
}
