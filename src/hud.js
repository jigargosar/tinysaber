import * as THREE from 'three';

const CANVAS_W = 320;
const CANVAS_H = 80;

export function createHUD(buildLabel) {
  const canvas = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx    = canvas.getContext('2d');
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.position.set(0, 2.4, -3);
  sprite.scale.set(1.8, 0.45, 1);

  let score = 0;

  function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = 'hsl(270,80%,55%)';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(score, CANVAS_W / 2, CANVAS_H / 2);
    ctx.fillStyle = 'hsl(270,40%,45%)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(buildLabel, CANVAS_W - 2, 4);
    tex.needsUpdate = true;
  }

  draw();

  function addScore(amount) {
    score += amount;
    draw();
  }

  function reset() {
    score = 0;
    draw();
  }

  return { root: sprite, addScore, reset };
}
