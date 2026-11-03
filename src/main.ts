import { GameLoop } from './core/loop';
import { Input } from './input/input';
import { ToolController } from './input/tools';
import { Camera } from './render/camera';
import { tileToWorld } from './render/iso';
import { drawFrame } from './render/renderer';
import { stepWorld } from './sim/sim';
import { World } from './sim/world';
import { Hud } from './ui/hud';
import { Toolbar } from './ui/toolbar';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const cam = new Camera();
const world = new World();
const tools = new ToolController(world);
const input = new Input(canvas, cam);
const hud = new Hud(world, tools);
const toolbar = new Toolbar(document.getElementById('toolbar')!, tools);

input.onLeftDown = (t) => tools.onDown(t);
input.onLeftUp = (t) => tools.onUp(t);
input.onKeyDown = (k) => {
  if (k === 'r') tools.rotate();
  else if (k === 'escape') tools.cancel();
  // 임시 속도 단축키 (7단계에서 HUD 버튼으로 대체): Space 일시정지, 1/2/3 = 1x/2x/4x
  else if (k === ' ') loop.speed = loop.speed === 0 ? 1 : 0;
  else if (k === '1') loop.speed = 1;
  else if (k === '2') loop.speed = 2;
  else if (k === '3') loop.speed = 4;
};

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

let lastFrame = performance.now();
const loop = new GameLoop(
  () => stepWorld(world),
  (alpha) => {
    const now = performance.now();
    input.update(Math.min((now - lastFrame) / 1000, 0.1));
    lastFrame = now;
    drawFrame(ctx, cam, world, input.hoverTile, tools.preview(input.hoverTile), alpha);
    hud.update();
    toolbar.sync();
  },
);
loop.start();
