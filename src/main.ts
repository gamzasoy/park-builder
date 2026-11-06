import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { Input } from './input/input';
import { ToolController } from './input/tools';
import { Camera } from './render/camera';
import { tileToWorld, tileToWorldZ } from './render/iso';
import { drawFrame } from './render/renderer';
import { pickTile } from './input/pick';
import type { Tile } from './sim/map';
import { loadFromStorage, saveToStorage } from './save/save';
import { dateOf, DAY_TICKS, DAYS_PER_MONTH, WAGE } from './sim/economy';
import { createGuest, VIP_REWARD, VIP_TICKS } from './sim/guest';
import { getDef } from './data';
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
import { Toasts, type ToastTone } from './ui/toast';
import { BUBBLE_FONT } from './render/thoughts';
import { isNight } from './sim/daynight';
import { withObj, withRo } from './ui/josa';
import { cleanParkName, MAX_PARK_NAME } from './sim/park';
import { rainbowAt } from './sim/weather';
import { MissionPanel } from './ui/missions';
import { ReviewPanel } from './ui/reviews';
import { seasonOf, SEASON_VIEW, type Season } from './sim/season';
import { MISSIONS } from './sim/missions';
import { BUS_GUESTS, FIREWORKS_COST, launchFireworks, type EventKind } from './sim/events';
import { LEVEL_PX, type TrackType } from './sim/coaster';
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
modal.bindInput();
const toasts = new Toasts();
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
  toasts.show('📂', world.parkName ? `${world.parkName}에 다시 오신 걸 환영해요` : '저장된 공원을 불러왔습니다', '', 'info');
} else if (loaded.reason === 'corrupt' || loaded.reason === 'version') {
  toasts.show('⚠️', '저장 데이터를 읽을 수 없어 새로 시작합니다', '이전 데이터는 백업해 두었어요', 'bad');
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
  seenMissions = world.missions.completed.length;
  seenVips = world.stats.vips;
  shownSeason = seasonOf(world.tick);
  loop.speed = 1;
  modal.hide();
  saveNow();
  toasts.show('🎡', '새 공원을 열었어요!', '입구에서 길을 깔아 시작해 보세요', 'info');
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
let seenReports = world.reports.length; // 불러온 공원의 지난 보고서는 다시 알리지 않는다

// ---- 랜덤 이벤트 시작 알림 ----
let seenEvent = world.event?.start ?? -1;
const EVENT_NOTICE: Record<Exclude<EventKind, 'vip'>, [string, string, string, ToastTone]> = {
  bus: ['🚌', '단체 관광버스 도착!', `손님 ${BUS_GUESTS}명이 한꺼번에 들어옵니다`, 'event'],
  heatwave: ['🔥', '폭염 경보!', '손님들이 금방 목말라져요. 음료를 준비하세요', 'bad'],
  hype: ['📸', '인기 블로거가 공원을 소개했어요!', '잠시 손님이 2배로 몰립니다', 'good'],
  blackout: ['⚡', '정전!', '잠시 놀이기구가 손님을 태우지 못합니다', 'bad'],
};
function watchEvent(): void {
  const e = world.event;
  if (!e || e.start === seenEvent) return;
  seenEvent = e.start;
  if (e.kind === 'vip') {
    // VIP가 오지 못했으면(운영 중인 기구가 없거나 손님이 가득) 알리지 않는다
    const v = world.guests.find((g) => g.vip && !g.vip.done && g.vip.until === e.start + VIP_TICKS);
    if (!v?.vip) return;
    toasts.show('👑', 'VIP 손님 방문!', `${withObj(getDef(v.vip.wish).name)} 타고 싶어 해요. 태워 주면 상금 ${won(VIP_REWARD)}`, 'event');
  } else {
    toasts.show(...EVENT_NOTICE[e.kind]);
  }
  sound.play(e.kind === 'blackout' ? 'error' : 'chime');
}

// ---- 미션 달성 알림 ----
let seenMissions = world.missions.completed.length;
let rainbowShown = rainbowAt(world.weatherSeed, world.tick);
function watchRainbow(): void {
  const now = rainbowAt(world.weatherSeed, world.tick);
  if (now && !rainbowShown) {
    toasts.show('🌈', '무지개가 떴어요!', '비가 그친 하늘을 보며 손님들의 기분이 좋아집니다', 'good');
    sound.play('chime');
  }
  rainbowShown = now;
}

// ---- 계절이 바뀌면 알림 ----
let shownSeason = seasonOf(world.tick);
const SEASON_NOTICE: Record<Season, string> = {
  spring: '꽃잎이 흩날리고 나무에 벚꽃이 피었어요',
  summer: '초록이 짙어졌어요. 손님들이 금방 목말라할지도 몰라요',
  autumn: '나무가 단풍으로 물들었어요',
  winter: '눈이 내리기 시작했어요. 겨울엔 비 대신 눈이 와요',
};
function watchSeason(): void {
  const s = seasonOf(world.tick);
  if (s === shownSeason) return;
  shownSeason = s;
  toasts.show(SEASON_VIEW[s].icon, `${SEASON_VIEW[s].label}이 왔어요!`, SEASON_NOTICE[s], 'info');
  sound.play('chime');
}

let seenVips = world.stats.vips;
function watchVips(): void {
  if (world.stats.vips > seenVips) {
    toasts.show('👑', 'VIP 손님이 아주 만족했어요!', `상금 +${won(VIP_REWARD)}`, 'good');
    sound.play('win');
  }
  seenVips = world.stats.vips;
}

function watchMissions(): void {
  const done = world.missions.completed;
  if (done.length > seenMissions) {
    const m = MISSIONS.find((x) => x.id === done[done.length - 1]);
    if (m) toasts.show('🎉', `미션 달성: ${m.title}`, `상금 +${won(m.reward)}`, 'good');
    sound.play('chime');
  }
  seenMissions = done.length;
}

function watchReports(): void {
  if (world.reports.length > seenReports) {
    const r = world.reports[world.reports.length - 1];
    toasts.show('📊', `${r.month}월 결산`, `순이익 ${r.net >= 0 ? '+' : ''}${won(r.net)} · 재무 창에서 자세히 볼 수 있어요`, r.net >= 0 ? 'good' : 'bad');
    sound.play('chime');
  }
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
    const editingTrack = tools.tool.kind === 'track';
    if (document.body.classList.contains('track-editing') !== editingTrack) document.body.classList.toggle('track-editing', editingTrack);
    followTrackCursor();
    drawFrame(ctx, cam, world, {
      hover: input.hoverTile,
      preview: tools.preview(input.hoverTile ?? buildFallbackTile()),
      editingId: tools.trackBuilding?.id ?? null,
      rotatedAt: tools.rotatedAt,
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
    missionPanel.update();
    reviewPanel.update();
    watchReports();
    watchMissions();
    watchEvent();
    watchVips();
    watchRainbow();
    watchSeason();
    watchStatus();
    if (now - lastSaveAt > AUTOSAVE_MS) saveNow();
  },
);

const financePanel = new FinancePanel(world);
const missionPanel = new MissionPanel(world);
const reviewPanel = new ReviewPanel(world);
const hud = new Hud(world, tools, loop, {
  // 왼쪽 카드(재무·미션·리뷰)는 같은 자리라 하나를 열면 나머지는 닫는다
  onFinance: () => {
    financePanel.toggle();
    missionPanel.toggle(false);
    reviewPanel.toggle(false);
  },
  onMissions: () => {
    missionPanel.toggle();
    if (missionPanel.open) {
      financePanel.toggle(false);
      reviewPanel.toggle(false);
    }
  },
  onReviews: () => {
    reviewPanel.toggle();
    if (reviewPanel.open) {
      financePanel.toggle(false);
      missionPanel.toggle(false);
    }
  },
  onSave: () => (saveNow() ? tools.notify('저장했습니다') : tools.fail('저장할 수 없습니다 (브라우저 저장소 사용 불가)')),
  onNewGame: confirmNewGame,
});
const toolbar = new Toolbar(document.getElementById('toolbar')!, tools, (kind) => {
  const s = hireStaff(world, kind);
  if (s) {
    tools.notify(`${withObj(STAFF_NAME[kind])} 고용했습니다 (하루 급여 ${won(WAGE[kind])})`);
    sound.play('build');
  } else {
    tools.fail('더 이상 고용할 수 없습니다');
  }
}, () => {
  const err = launchFireworks(world);
  if (err) {
    tools.fail(err);
  } else {
    toasts.show('🎆', '불꽃놀이 시작!', isNight(world.tick) ? '밤하늘이라 효과가 두 배예요' : `손님들이 하늘을 올려다봐요 (${won(FIREWORKS_COST)})`, 'event');
    sound.play('win');
  }
}, () => takePhoto());

// ---- 기념사진: 지금 화면(공원)을 이미지로 저장 ----
function takePhoto(): void {
  const shot = document.createElement('canvas');
  shot.width = canvas.width;
  shot.height = canvas.height;
  const c = shot.getContext('2d');
  if (!c) return tools.fail('사진을 찍을 수 없습니다');
  c.drawImage(canvas, 0, 0);
  // 아래쪽 띠: 공원 이름 · 날짜 · 평점
  const s = canvas.width / Math.max(1, canvas.clientWidth);
  const h = 34 * s;
  c.fillStyle = 'rgba(20,26,14,0.72)';
  c.fillRect(0, shot.height - h, shot.width, h);
  c.fillStyle = '#f2c230';
  c.font = `bold ${16 * s}px ${BUBBLE_FONT}`;
  c.textBaseline = 'middle';
  const d = dateOf(world.tick);
  const name = world.parkName || '나의 놀이공원';
  c.fillText(`📷 ${name}`, 12 * s, shot.height - h / 2);
  c.textAlign = 'right';
  c.fillStyle = '#fff';
  c.font = `${13 * s}px ${BUBBLE_FONT}`;
  c.fillText(`${d.year}년차 ${d.month}월 ${d.day}일 · 손님 ${world.guests.length}명 · 평점 ${Math.round(world.rating)}`, shot.width - 12 * s, shot.height - h / 2);
  // 찰칵: 화면이 하얗게 번쩍
  const flash = document.createElement('div');
  flash.className = 'photo-flash';
  document.body.append(flash);
  setTimeout(() => flash.remove(), 500);
  sound.play('shutter');
  // 파일 이름은 영문으로(한글 파일 이름을 'download'로 바꿔 버리는 브라우저가 있다). 공원 이름은 사진 안에 들어간다
  const file = `park-photo_y${d.year}-m${d.month}-d${d.day}.png`;
  shot.toBlob((blob) => {
    if (!blob) return tools.fail('사진을 저장할 수 없습니다');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toasts.show('📷', '찰칵! 기념사진을 저장했어요', file, 'info');
  }, 'image/png');
}
// 모바일: 아래 도구 막대를 접어서 공원을 넓게 볼 수 있다(선택한 도구는 접어도 유지, 선택은 기억)
const TB_FOLD_KEY = 'park-builder:toolbar-folded';
const tbToggle = document.getElementById('tb-toggle')!;
const tbEl = document.getElementById('toolbar')!;
let tbFolded = false;
try { tbFolded = localStorage.getItem(TB_FOLD_KEY) === '1'; } catch { /* 저장소 사용 불가는 무시 */ }
function layoutToolbar(): void {
  document.body.classList.toggle('tb-folded', tbFolded);
  tbToggle.textContent = tbFolded ? '▲ 도구' : '▼ 접기';
  const root = document.documentElement.style;
  const h = tbFolded ? 0 : tbEl.offsetHeight; // 접으면 0(PC에서도 툴바 높이를 그대로 반영)
  root.setProperty('--tb-h', `${h}px`);
  root.setProperty('--tb-reserve', `${tbFolded ? 34 : h + 4}px`);
}
tbToggle.addEventListener('click', () => {
  tbFolded = !tbFolded;
  try { localStorage.setItem(TB_FOLD_KEY, tbFolded ? '1' : '0'); } catch { /* 무시 */ }
  layoutToolbar();
});
window.addEventListener('resize', layoutToolbar);
window.addEventListener('orientationchange', layoutToolbar);

const buildingPanel = new BuildingPanel(world, tools, testRun);
buildingPanel.onUpgrade = (ok) => sound.play(ok ? 'build' : 'error');

// ---- 공원 이름: 도구 없이 입구를 누르면 이름을 짓는다 ----
function renamePark(): void {
  const save = (): void => {
    world.parkName = cleanParkName(modal.inputValue);
    modal.hide();
    if (world.parkName) toasts.show('🏷️', `'${world.parkName}' 개장!`, `공원 이름을 '${world.parkName}'${withRo(world.parkName).slice(world.parkName.length)} 정했습니다`, 'info');
    else tools.notify('공원 이름을 지웠습니다');
    sound.play('chime');
    saveNow();
  };
  modal.show('rename', {
    title: '공원 이름 짓기',
    message: `입구 간판에 걸릴 이름이에요 (최대 ${MAX_PARK_NAME}글자).`,
    input: { value: world.parkName, maxLength: MAX_PARK_NAME * 2, placeholder: '예: 행복랜드', onEnter: save },
    buttons: [
      { label: '취소', onClick: () => modal.hide() },
      { label: '정하기', primary: true, onClick: save },
    ],
  });
}
tools.onGate = renamePark;
const guestPanel = new GuestPanel(world, tools);
const staffPanel = new StaffPanel(world, tools);
const trackEditor = new TrackEditor(world, tools, testRun);
const tutorialPanel = new TutorialPanel(world, toolbar);

input.onLeftDown = (t, pos) => tools.onDown(t, pos);
input.onTouchCancel = () => tools.cancelDrag();
// 한 손가락: 건설 도구가 켜져 있으면 건설 입력, 아니면 화면 이동/탭 선택
input.buildMode = () => tools.isBuilding;
// 건물·철거는 누르는 순간 실행되므로 터치에서는 손가락을 뗄 때 실행(위치를 맞춘 뒤 놓을 수 있게)
input.deferOnTouch = () => tools.tool.kind === 'build' || tools.tool.kind === 'move' || tools.tool.kind === 'demolish';

// 도구가 켜져 있을 때만 보이는 화면 버튼(R / Esc 대응)
const toolActions = document.getElementById('tool-actions')!;
document.getElementById('act-rotate')!.addEventListener('click', () => tools.rotate());
document.getElementById('act-cancel')!.addEventListener('click', () => tools.cancel());
function syncToolActions(): void {
  const k = tools.tool.kind;
  const show = k !== 'none' && k !== 'track';
  if (toolActions.hidden === show) toolActions.hidden = !show;
  const rot = document.getElementById('act-rotate')!;
  const canRotate = k === 'build' || k === 'move';
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
  else if (k === 'p') takePhoto();
  else if (k === 'escape') tools.cancel();
  // 속도 단축키: Space 일시정지 토글, 1/2/3 = 1x/2x/4x
  else if (k === ' ') loop.speed = loop.speed === 0 ? 1 : 0;
  else if (k === '1') loop.speed = 1;
  else if (k === '2') loop.speed = 2;
  else if (k === '3') loop.speed = 4;
};

/** 가려지지 않고 보이는 화면 영역(HUD 아래 ~ 트랙 편집 바·툴바 위) */
function openArea(): { top: number; bottom: number } {
  const hudEl = document.getElementById('hud')!;
  let top = hudEl.getBoundingClientRect().bottom;
  let bottom = cam.viewH;
  for (const id of ['toolbar', 'track-bar']) {
    const el = document.getElementById(id)!;
    if (el.hidden || getComputedStyle(el).display === 'none') continue;
    bottom = Math.min(bottom, el.getBoundingClientRect().top);
  }
  if (bottom - top < 80) { top = 0; bottom = cam.viewH; }
  return { top, bottom };
}

/**
 * 건물 도구인데 마우스/손가락이 화면 위에 없으면(터치에서 손을 뗐거나 툴바 위) 보이는 영역 가운데 칸에
 * 미리보기를 띄운다. 그래야 회전 버튼을 눌렀을 때 건물과 입구가 도는 모습이 보인다.
 */
function buildFallbackTile(): Tile | null {
  if (tools.tool.kind !== 'build' && tools.tool.kind !== 'move') return null;
  const { top, bottom } = openArea();
  const w = cam.screenToWorld(cam.viewW / 2, (top + bottom) / 2);
  const t = pickTile(world.map, w.x, w.y).tile;
  return world.map.inBounds(t.x, t.y) ? t : null;
}

/**
 * 트랙 편집: 다음 조각 위치(흰 화살표)가 편집 바·HUD에 가리거나 화면 밖으로 나가면 카메라를 부드럽게 옮긴다.
 * 조각을 놓거나 지울 때만 따라가므로, 그 사이에 손으로 화면을 옮기는 것은 방해하지 않는다.
 */
let followKey = '';
let followTarget: { x: number; y: number } | null = null;
function followTrackCursor(): void {
  const b = tools.trackBuilding;
  const t = b?.track;
  if (!b || !t || t.closed) {
    followKey = '';
    followTarget = null;
    return;
  }
  const c = t.cursor;
  const key = `${b.id}:${c.x},${c.y},${c.h}:${t.pieces.length}`;
  if (key !== followKey) {
    followKey = key;
    const w = tileToWorldZ(c.x + 0.5, c.y + 0.5, 0);
    const wy = w.y - c.h * LEVEL_PX; // 레일 높이
    const s = cam.worldToScreen(w.x, wy);
    const { top, bottom } = openArea();
    const mx = Math.min(120, cam.viewW * 0.15);
    const my = Math.min(70, (bottom - top) * 0.2);
    let dx = 0;
    let dy = 0;
    if (s.x < mx) dx = s.x - mx;
    else if (s.x > cam.viewW - mx) dx = s.x - (cam.viewW - mx);
    if (s.y < top + my + 30) dy = s.y - (top + my + 30); // 화살표 위로 솟는 루프·기둥 여유
    else if (s.y > bottom - my) dy = s.y - (bottom - my);
    // 벗어났으면 보이는 영역 가운데 쪽으로 넉넉히 옮긴다
    if (dx || dy) {
      const cy = (top + bottom) / 2;
      followTarget = {
        x: cam.x + (dx ? (s.x - cam.viewW / 2) : 0) / cam.zoom,
        y: cam.y + (dy ? (s.y - cy) : 0) / cam.zoom,
      };
    }
  }
  if (followTarget) {
    cam.x += (followTarget.x - cam.x) * 0.2;
    cam.y += (followTarget.y - cam.y) * 0.2;
    if (Math.abs(followTarget.x - cam.x) < 0.5 && Math.abs(followTarget.y - cam.y) < 0.5) followTarget = null;
  }
}
// 손으로 화면을 움직이기 시작하면 자동 이동을 멈춘다
canvas.addEventListener('pointerdown', () => { followTarget = null; });
canvas.addEventListener('wheel', () => { followTarget = null; });

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
  layoutToolbar();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // 고해상도 폰에서 픽셀 수 폭증 방지
  cam.viewW = window.innerWidth;
  cam.viewH = window.innerHeight;
  canvas.width = Math.floor(cam.viewW * dpr);
  canvas.height = Math.floor(cam.viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// 프로덕션 빌드에서만 서비스 워커 등록(오프라인 실행·홈 화면 앱)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* 지원 안 되는 환경은 무시 */ }); });
}

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
    camera: () => ({ x: cam.x, y: cam.y, zoom: cam.zoom }),
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
