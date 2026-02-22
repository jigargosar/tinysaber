import * as THREE from 'three';
import { XRDevice, metaQuest3 } from 'iwer';
import { createRenderer, createScene, createCamera, createEnvironment } from './scene';
import { createSabers, SABER_REACH } from './sabers';
import { createBlocks } from './blocks';
import { createParticles } from './particles';
import { createHUD } from './hud';
import { createControllers } from './controllers';
import { setupXRSession } from './xrSession';
import type { Hand } from './xrSession';
import { createMusic } from './music';
import { COLOR_RED, COLOR_BLUE } from './colors';

const BUILD = 'v18';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const updateStyle = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => Object.assign(el.style, styles);

const HIT_SCORE_CORRECT = 100;
const HIT_SCORE_WRONG   = 25;
const HAPTIC_MS_CORRECT = 250;
const HAPTIC_MS_WRONG   = 120;
const SPAWN_INTERVAL    = 1.0;
const EYE_HEIGHT        = 1.6;

// ─── IWER — emulates WebXR device so we can test in-browser ───────────────
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.position.set(0, EYE_HEIGHT, 0);

// ─── Scene ────────────────────────────────────────────────────────────────
const renderer    = createRenderer();
const scene       = createScene();
const camera      = createCamera();

const environment = createEnvironment();
const sabers      = createSabers();
const blocks      = createBlocks();
const particles   = createParticles();
const hud         = createHUD(BUILD);

scene.add(camera, environment, sabers.root, blocks.root, particles.root, hud.root);

// ─── Systems ──────────────────────────────────────────────────────────────
const music       = createMusic();
const controllers = createControllers(music, blocks.toggleWireframe, blocks.spawnDebugWave);

const hitTesters = {
  left:  blocks.createHitTester(),
  right: blocks.createHitTester(),
};

let sessionActive = false;

function resetGameState({ isStarting }: { isStarting: boolean }): void {
  sessionActive = isStarting;
  blocks.clearAllBlocks();
  spawnTimer = 0;
  hud.reset();
  hitTesters.left.reset();
  hitTesters.right.reset();
  if (isStarting) {
    updateStyle($('#ui'), { display: 'none' });
    music.start();
  } else {
    updateStyle($('#ui'), { display: 'flex' });
    music.stop();
  }
}

const xr = setupXRSession(renderer,
  () => resetGameState({ isStarting: true }),
  () => resetGameState({ isStarting: false })
);

// ─── Game Loop ────────────────────────────────────────────────────────────
let lastTime = 0, spawnTimer = 0;

const tmpPos     = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpStart   = new THREE.Vector3();
const tmpTip     = new THREE.Vector3();
const tmpMat     = new THREE.Matrix4();

function onHit(pos: THREE.Vector3, isRed: boolean, hand: Hand): void {
  particles.explode(pos, isRed ? COLOR_RED : COLOR_BLUE);
  const correct = (hand === 'left') === isRed;
  hud.addScore(correct ? HIT_SCORE_CORRECT : HIT_SCORE_WRONG);
  xr.triggerHaptic(hand, 1.0, correct ? HAPTIC_MS_CORRECT : HAPTIC_MS_WRONG);
}

function onControllerFrame(hand: Hand, matrix: Float32Array): void {
  const saber = sabers[hand];
  tmpMat.fromArray(matrix);
  tmpMat.decompose(saber.position, saber.quaternion, saber.scale);
  tmpPos.copy(saber.position);

  tmpForward.set(0, 0, -1).applyQuaternion(saber.quaternion);
  tmpStart.copy(tmpPos);
  tmpTip.copy(tmpPos).addScaledVector(tmpForward, SABER_REACH);

  hitTesters[hand].testHit(tmpStart, tmpTip, hand, onHit);
}

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (sessionActive) {
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) { blocks.spawnBlock(); spawnTimer = 0; }
    blocks.tick(dt);
  }

  particles.tick(dt);

  controllers.checkAllButtons(frame);
  xr.forEachController(frame, onControllerFrame);

  renderer.render(scene, camera);
});

// ─── Resize ───────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
