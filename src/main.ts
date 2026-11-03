import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { Input } from './input/input';
import { ToolController } from './input/tools';
import { Camera } from './render/camera';
import { tileToWorld } from './render/iso';
import { drawFrame } from './render/renderer';
import { loadFromStorage, saveToStorage } from './save/save';
import { DAY_TICKS, DAYS_PER_MONTH } from './sim/economy';
import { stepWorld } from './sim/sim';
import { World } from './sim/world';
import { Hud, won } from './ui/hud';
import { Modal } from './ui/modal';
import { BuildingPanel, FinancePanel, GuestPanel } from './ui/panels';
import { Sound } from './ui/sound';
import { Toolbar } from './ui/toolbar';

const AUTOSAVE_MS = 15_000;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const cam = new Camera();
const world = new World();
const tools = new ToolController(world);
const input = new Input(canvas, cam);
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
  world.adopt(fresh);
  tools.reset();
  financePanel.sync();
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
let lastFrame = performance.now();
const loop = new GameLoop(
  () => stepWorld(world),
  (alpha) => {
    const now = performance.now();
    input.update(Math.min((now - lastFrame) / 1000, 0.1));
    lastFrame = now;
    drawFrame(ctx, cam, world, {
      hover: input.hoverTile,
      preview: tools.preview(input.hoverTile),
      alpha,
      selectedId: tools.selectedId,
      selectedGuestId: tools.selectedGuestId,
    });
    hud.update();
    toolbar.sync();
    buildingPanel.update();
    guestPanel.update();
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
const toolbar = new Toolbar(document.getElementById('toolbar')!, tools);
const buildingPanel = new BuildingPanel(world, tools);
const guestPanel = new GuestPanel(world, tools);

input.onLeftDown = (t, pos) => tools.onDown(t, pos);
input.onLeftUp = (t) => tools.onUp(t);
input.onKeyDown = (k) => {
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
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

// 시작 시 공원 입구가 보이도록 입구와 맵 중앙 사이를 화면 중앙에
const focus = tileToWorld(world.map.width / 2, world.map.height * 0.8);
cam.x = focus.x;
cam.y = focus.y;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
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
  };
}
