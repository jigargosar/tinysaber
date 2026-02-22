import * as THREE from 'three';

const CANVAS_W = 320;
const CANVAS_H = 80;

export interface HUD {
  root: THREE.Sprite;
  addScore: (amount: number) => void;
  reset: () => void;
}

export function createHUD(buildLabel: string): HUD {
  const canvas = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) throw new Error('2D context unavailable');
  const ctx = rawCtx;
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.position.set(0, 2.4, -3);
  sprite.scale.set(1.8, 0.45, 1);

  let score = 0;

  function draw(): void {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = 'hsl(270,80%,55%)';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(score), CANVAS_W / 2, CANVAS_H / 2);
    ctx.fillStyle = 'hsl(270,40%,45%)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(buildLabel, CANVAS_W - 2, 4);
    tex.needsUpdate = true;
  }

  draw();

  function addScore(amount: number): void {
    score += amount;
    draw();
  }

  function reset(): void {
    score = 0;
    draw();
  }

  return { root: sprite, addScore, reset };
}
