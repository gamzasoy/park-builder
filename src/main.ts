import { GameLoop } from './core/loop';
import { Camera } from './render/camera';
import { tileToWorld } from './render/iso';
import { drawFrame } from './render/renderer';
import { Input } from './input/input';
import { TileMap } from './sim/map';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const cam = new Camera();
const map = new TileMap();
const input = new Input(canvas, cam);

// 시작 시 맵 중앙을 화면 중앙에
const center = tileToWorld(map.width / 2, map.height / 2);
cam.x = center.x;
cam.y = center.y;

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
  () => { /* 시뮬레이션 틱: 이후 단계에서 채움 */ },
  () => {
    const now = performance.now();
    input.update(Math.min((now - lastFrame) / 1000, 0.1));
    lastFrame = now;
    drawFrame(ctx, cam, map, input.hoverTile);
  },
);
loop.start();
