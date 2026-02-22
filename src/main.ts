import * as THREE from 'three';
import { XRDevice, metaQuest3 } from 'iwer';
import { createRenderer, createScene, createCamera, createEnvironment } from './scene.js';
import { createSabers, SABER_REACH } from './sabers.js';
import { createBlocks } from './blocks.js';
import { createParticles } from './particles.js';
import { createHUD } from './hud.js';
import { createControllers } from './controllers.js';
import { setupXRSession } from './xrSession.js';
import { createMusic } from './music.js';

const BUILD = 'v18';

const $ = sel => document.querySelector(sel);
const updateStyle = (el, styles) => Object.assign(el.style, styles);

const HIT_SCORE_CORRECT = 100;
const HIT_SCORE_WRONG   = 25;
const HAPTIC_MS_CORRECT = 250;
const HAPTIC_MS_WRONG   = 120;
const SPAWN_INTERVAL    = 1.0;
const COLOR_RED         = 0xff2020;
const COLOR_BLUE        = 0x2060ff;

// ─── IWER — emulates WebXR device so we can test in-browser ───────────────
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.position.set(0, 1.6, 0);

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

const hitTesters  = {
  left:  blocks.createHitTester(),
  right: blocks.createHitTester(),
};

function resetGameState({ isStarting }) {
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

// Mutable context updated per controller — avoids per-frame closure allocation
const hitCtx = { isLeftHand: false, hand: 'left' };

function onHit(pos, isRed) {
  particles.explode(pos, isRed ? COLOR_RED : COLOR_BLUE);
  const correct = hitCtx.isLeftHand === isRed;
  hud.addScore(correct ? HIT_SCORE_CORRECT : HIT_SCORE_WRONG);
  xr.triggerHaptic(hitCtx.hand, 1.0, correct ? HAPTIC_MS_CORRECT : HAPTIC_MS_WRONG);
}

function onControllerFrame(hand, matrix) {
  const saber = sabers[hand];
  tmpMat.fromArray(matrix);
  tmpMat.decompose(saber.position, saber.quaternion, saber.scale);
  tmpPos.copy(saber.position);

  tmpForward.set(0, 0, -1).applyQuaternion(saber.quaternion);
  tmpStart.copy(tmpPos);
  tmpTip.copy(tmpPos).addScaledVector(tmpForward, SABER_REACH);

  hitCtx.isLeftHand = hand === 'left';
  hitCtx.hand = hand;
  hitTesters[hand].testHit(tmpStart, tmpTip, onHit);
}

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INTERVAL) { blocks.spawnBlock(); spawnTimer = 0; }

  blocks.tick(dt);
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
