import * as THREE from 'three';
import { XRDevice, metaQuest3 } from 'iwer';
import { createMusic } from './music.js';

const BUILD = 'v18';

// ─── IWER — emulates WebXR device so we can test in-browser ───────────────
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.position.set(0, 1.6, 0);

// ─── Renderer ─────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ─── Scene ────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color('hsl(270,100%,3%)');
scene.fog = new THREE.Fog(0x050005, 20, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 0);
scene.add(camera);

// Lighting
scene.add(new THREE.AmbientLight(0x8866aa, 2));
const fill = new THREE.DirectionalLight(0xffffff, 1.2);
fill.position.set(0, 5, -5);
scene.add(fill);

// Floor grid
const grid = new THREE.GridHelper(40, 40, 0x330055, 0x1a0033);
scene.add(grid);

// Tunnel walls
for (let z = -2; z > -40; z -= 4) {
  const geo = new THREE.PlaneGeometry(0.02, 2.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0x220044, side: THREE.DoubleSide });
  [-1.5, 1.5].forEach(x => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1.2, z);
    scene.add(m);
  });
}

// ─── Sabers ───────────────────────────────────────────────────────────────
const SABER_REACH = 0.11 + 1.10;

function makeSaber(color) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = -Math.PI / 2;
  g.add(inner);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  inner.add(handle);

  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 1.10, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  blade.position.y = 0.11 + 1.10 / 2;
  inner.add(blade);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, depthWrite: false })
  );
  glow.position.y = 0.11 + 1.10 / 2;
  inner.add(glow);

  const light = new THREE.PointLight(color, 1.2, 1.5);
  light.position.y = 1.21;
  inner.add(light);

  scene.add(g);
  return g;
}

const sabers = {
  left:  makeSaber(0xff2020),
  right: makeSaber(0x2060ff),
};

sabers.left.position.set(-0.5, 1.2, -0.4);
sabers.right.position.set(0.5, 1.2, -0.4);

// ─── Blocks ───────────────────────────────────────────────────────────────
const CUBE_SIZE       = 0.32;
const CUBE_GAP        = 0.15;
const LANE_SPACING    = CUBE_SIZE + CUBE_GAP;
const CUBE_HIT_MARGIN = Math.min(0.07, CUBE_GAP / 2);
const LANES_X = [-1.5, -0.5, 0.5, 1.5].map(n => n * LANE_SPACING);
const LANES_Y = [0.9, 1.35, 1.8];
const SPAWN_Z = -14;
const MISS_Z  =  1.2;
const CUBE_SPEED = 4;

const blockGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const collisionGeo = new THREE.BoxGeometry(
  CUBE_SIZE + CUBE_HIT_MARGIN * 2,
  CUBE_SIZE + CUBE_HIT_MARGIN * 2,
  CUBE_SIZE + CUBE_HIT_MARGIN * 2
);
const edgeGeo = new THREE.EdgesGeometry(collisionGeo);
const MATS = {
  red:  new THREE.MeshLambertMaterial({ color: 0xff2020, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  blue: new THREE.MeshLambertMaterial({ color: 0x2060ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
};
const EDGE_MATS = {
  red:  new THREE.LineBasicMaterial({ color: 0xffffff }),
  blue: new THREE.LineBasicMaterial({ color: 0xffffff }),
};

let blocks = [];

function spawnCube(x, y, z, isRed) {
  const key = isRed ? 'red' : 'blue';
  const mesh = new THREE.Mesh(blockGeo, MATS[key]);
  mesh.position.set(x, y, z);
  const edges = new THREE.LineSegments(edgeGeo, EDGE_MATS[key]);
  edges.visible = wireframeOn;
  mesh.add(edges);
  mesh.userData = { isRed, alive: true };
  scene.add(mesh);
  blocks.push(mesh);
}

function spawnBlock() {
  spawnCube(
    LANES_X[Math.floor(Math.random() * LANES_X.length)],
    LANES_Y[Math.floor(Math.random() * LANES_Y.length)],
    SPAWN_Z, Math.random() < 0.5
  );
}

function clearAllBlocks() {
  for (const b of blocks) scene.remove(b);
  blocks = [];
}

function spawnDebugWave() {
  clearAllBlocks();
  for (const x of LANES_X)
    for (const y of LANES_Y)
      spawnCube(x, y, -8, x < 0);
}

// ─── Particles — object pool, zero per-explosion allocation ───────────────
const partGeo     = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const partMatRed  = new THREE.MeshBasicMaterial({ color: 0xff2020 });
const partMatBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });

const POOL_SIZE = 96;  // max ~8 simultaneous explosions × 12
const partPool  = [];
for (let i = 0; i < POOL_SIZE; i++) {
  const p = new THREE.Mesh(partGeo, partMatRed);
  p.visible = false;
  p.userData = { vel: new THREE.Vector3(), life: 0, active: false };
  scene.add(p);
  partPool.push(p);
}
let particles = []; // active subset

function explode(pos, color) {
  const mat = color === 0xff2020 ? partMatRed : partMatBlue;
  let spawned = 0;
  for (let i = 0; i < POOL_SIZE && spawned < 12; i++) {
    const p = partPool[i];
    if (p.userData.active) continue;
    p.material = mat;
    p.position.copy(pos);
    p.visible = true;
    p.userData.active = true;
    p.userData.vel.set(
      (Math.random()-0.5)*4,
      (Math.random()-0.5)*4,
      (Math.random()-0.5)*4
    );
    p.userData.life = 0.45 + Math.random() * 0.2;
    particles.push(p);
    spawned++;
  }
}

// ─── Score HUD ────────────────────────────────────────────────────────────
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 320; hudCanvas.height = 80;
const hudCtx = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas);
const hudSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hudTex, depthTest: false }));
hudSprite.position.set(0, 2.4, -3);
hudSprite.scale.set(1.8, 0.45, 1);
scene.add(hudSprite);

let score = 0;
function drawHUD() {
  hudCtx.clearRect(0, 0, 320, 80);
  hudCtx.fillStyle = 'hsl(270,80%,55%)';
  hudCtx.font = 'bold 52px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText(score, 160, 40);
  hudCtx.fillStyle = 'hsl(270,40%,45%)';
  hudCtx.font = '16px monospace';
  hudCtx.textAlign = 'right';
  hudCtx.textBaseline = 'top';
  hudCtx.fillText(BUILD, 318, 4);
  hudTex.needsUpdate = true;
}
drawHUD();

// ─── Cheat Sheet ─────────────────────────────────────────────────────────
// DISABLED: re-enable by uncommenting. Draws once at startup (safe), but
// adds a world-space mesh + CanvasTexture draw call — commented for cleanliness.
/*
const sheetCanvas = document.createElement('canvas');
sheetCanvas.width = 256; sheetCanvas.height = 230;
const sheetCtx = sheetCanvas.getContext('2d');
const sheetTex = new THREE.CanvasTexture(sheetCanvas);
const sheetMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.58, 0.53),
  new THREE.MeshBasicMaterial({ map: sheetTex, transparent: true, side: THREE.DoubleSide })
);
sheetMesh.position.set(-1.6, 1.5, -1.0);
sheetMesh.rotation.y = Math.atan2(1.6, 1.0);
scene.add(sheetMesh);
(function drawSheet() {
  sheetCtx.clearRect(0, 0, 256, 230);
  sheetCtx.fillStyle = 'rgba(0,0,0,0.75)';
  sheetCtx.roundRect(4, 4, 248, 222, 12); sheetCtx.fill();
  sheetCtx.strokeStyle = 'hsl(270,60%,50%)';
  sheetCtx.lineWidth = 2;
  sheetCtx.roundRect(4, 4, 248, 222, 12); sheetCtx.stroke();
  sheetCtx.font = 'bold 20px monospace';
  sheetCtx.textAlign = 'left';
  const lines = [
    ['CONTROLS',             'hsl(270,90%,85%)'],
    ['',                     ''],
    ['A  →  Music on/off',   'hsl(0,0%,80%)'],
    ['B  →  Wireframe',      'hsl(0,0%,80%)'],
    ['X  →  (broken, ignored)', 'hsl(0,0%,45%)'],
    ['Y  →  Spawn 4x3 grid',   'hsl(0,0%,80%)'],
    ['',                     ''],
    ['Red   = Left saber',   'hsl(0,70%,70%)'],
    ['Blue  = Right saber',  'hsl(210,70%,70%)'],
  ];
  lines.forEach(([text, color], i) => {
    sheetCtx.fillStyle = color;
    sheetCtx.fillText(text, 18, 34 + i * 26);
  });
  sheetTex.needsUpdate = true;
})();
*/

// ─── Debug Button Panel ───────────────────────────────────────────────────
// DISABLED: was calling drawDebugPanel() every VR frame → needsUpdate every
// frame → GPU texture re-upload at 72fps → primary cause of VR slowdown.
// Re-enable by uncommenting everything below AND the drawDebugPanel() call
// in the render loop. When re-enabling, add a dirty-flag so it only redraws
// on actual button state change, not every frame.
/*
const dbgCanvas = document.createElement('canvas');
dbgCanvas.width = 320; dbgCanvas.height = 520;
const dbgCtx = dbgCanvas.getContext('2d');
const dbgTex = new THREE.CanvasTexture(dbgCanvas);
const dbgMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.72, 1.17),
  new THREE.MeshBasicMaterial({ map: dbgTex, transparent: true, side: THREE.DoubleSide })
);
dbgMesh.position.set(1.6, 1.5, -1.0);
dbgMesh.rotation.y = -Math.atan2(1.6, 1.0);
scene.add(dbgMesh);

function drawDebugPanel(inputSources) {
  dbgCtx.clearRect(0, 0, 320, 320);
  dbgCtx.fillStyle = 'rgba(0,0,0,0.80)';
  dbgCtx.roundRect(4, 4, 312, 512, 12); dbgCtx.fill();
  dbgCtx.strokeStyle = 'hsl(60,60%,50%)';
  dbgCtx.lineWidth = 2;
  dbgCtx.roundRect(4, 4, 312, 512, 12); dbgCtx.stroke();
  dbgCtx.font = 'bold 18px monospace';
  dbgCtx.textAlign = 'left';
  dbgCtx.fillStyle = 'hsl(60,90%,80%)';
  dbgCtx.fillText('BUTTON DEBUG', 14, 28);

  let y = 52;
  for (const src of inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    dbgCtx.fillStyle = src.handedness === 'left' ? 'hsl(0,80%,70%)' : 'hsl(210,80%,70%)';
    dbgCtx.fillText(src.handedness.toUpperCase(), 14, y); y += 22;
    for (let i = 0; i < gp.buttons.length; i++) {
      const btn = gp.buttons[i];
      const val = btn.value.toFixed(2);
      const pressed = btn.pressed;
      dbgCtx.fillStyle = pressed ? 'hsl(120,90%,70%)' : 'hsl(0,0%,65%)';
      dbgCtx.fillText(`  [${i}] val:${val} ${pressed ? '■ PRESSED' : ''}`, 14, y);
      y += 20;
    }
    y += 6;
  }
  dbgTex.needsUpdate = true;
}
*/

// ─── Controller Buttons ───────────────────────────────────────────────────
// Quest 2: Right A=buttons[4] B=buttons[5] | Left X=buttons[4] Y=buttons[5]
const music = createMusic();
let wireframeOn = true;

const btnWas = { A: false, B: false, X: false };

function setWireframe(on) {
  wireframeOn = on;
  for (const key of ['red', 'blue']) {
    MATS[key].opacity     = on ? 0.45 : 1.0;
    MATS[key].transparent = on;
    MATS[key].side        = on ? THREE.DoubleSide : THREE.FrontSide;
    MATS[key].depthWrite  = !on;
    MATS[key].needsUpdate = true;
  }
  for (const b of blocks) {
    if (b.children[0]) b.children[0].visible = on;
  }
}

// FIX v09: accepts frame so gamepad state is read inside the XR frame callback,
// guaranteeing fresh data per the WebXR Gamepads spec.
function checkAllButtons(frame) {
  for (const src of frame.session.inputSources) {
    const gp = src?.gamepad;
    if (!gp) continue;
    if (src.handedness === 'right') {
      const aDown = gp.buttons[4]?.pressed;
      const bDown = gp.buttons[5]?.pressed;
      if (aDown && !btnWas.A) music.toggle();
      btnWas.A = aDown;
      if (bDown && !btnWas.B) setWireframe(!wireframeOn);
      btnWas.B = bDown;
    }
    if (src.handedness === 'left') {
      const yDown = gp.buttons[5]?.pressed;
      if (yDown && !btnWas.X) spawnDebugWave();
      btnWas.X = yDown;
    }
  }
}

function haptic(src, intensity = 0.8, ms = 100) {
  src?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);
}

// ─── Hit Detection ────────────────────────────────────────────────────────
const SUBSTEPS = 6;

// Pre-allocated temporaries — zero garbage in the hot path
const _box     = new THREE.Box3();
const _expanded = new THREE.Box3();
const _d       = new THREE.Vector3();
const _segA    = new THREE.Vector3();
const _segB    = new THREE.Vector3();

function segmentHitsBox(a, b, box) {
  _expanded.copy(box).expandByScalar(CUBE_HIT_MARGIN);
  _d.subVectors(b, a);
  let tmin = 0, tmax = 1;
  // Unrolled — no array allocation per call (was ['x','y','z'] each time)
  let da, t0, t1;
  da = _d.x;
  if (Math.abs(da) < 1e-8) { if (a.x < _expanded.min.x || a.x > _expanded.max.x) return false; }
  else { t0 = (_expanded.min.x - a.x) / da; t1 = (_expanded.max.x - a.x) / da; tmin = Math.max(tmin, Math.min(t0,t1)); tmax = Math.min(tmax, Math.max(t0,t1)); if (tmin > tmax) return false; }
  da = _d.y;
  if (Math.abs(da) < 1e-8) { if (a.y < _expanded.min.y || a.y > _expanded.max.y) return false; }
  else { t0 = (_expanded.min.y - a.y) / da; t1 = (_expanded.max.y - a.y) / da; tmin = Math.max(tmin, Math.min(t0,t1)); tmax = Math.min(tmax, Math.max(t0,t1)); if (tmin > tmax) return false; }
  da = _d.z;
  if (Math.abs(da) < 1e-8) { if (a.z < _expanded.min.z || a.z > _expanded.max.z) return false; }
  else { t0 = (_expanded.min.z - a.z) / da; t1 = (_expanded.max.z - a.z) / da; tmin = Math.max(tmin, Math.min(t0,t1)); tmax = Math.min(tmax, Math.max(t0,t1)); if (tmin > tmax) return false; }
  return true;
}

function checkHits(bladeStart, bladeEnd, prevStart, prevEnd, inputSrc, isLeftHand) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (!b.userData.alive) continue;

    const h = CUBE_SIZE / 2;
    _box.min.set(b.position.x - h, b.position.y - h, b.position.z - h);
    _box.max.set(b.position.x + h, b.position.y + h, b.position.z + h);
    let hit = false;

    for (let s = 0; s <= SUBSTEPS && !hit; s++) {
      const t = s / SUBSTEPS;
      _segA.lerpVectors(prevStart, bladeStart, t);
      _segB.lerpVectors(prevEnd,   bladeEnd,   t);
      hit = segmentHitsBox(_segA, _segB, _box);
    }

    if (hit) {
      b.userData.alive = false;
      scene.remove(b);
      blocks.splice(i, 1);
      explode(b.position, b.userData.isRed ? 0xff2020 : 0x2060ff);
      const correct = isLeftHand === b.userData.isRed;
      score += correct ? 100 : 25;
      drawHUD();
      haptic(inputSrc, 1.0, correct ? 250 : 120);
    }
  }
}

// ─── XR Session ───────────────────────────────────────────────────────────
let xrSession = null, refSpace = null;

document.getElementById('enter-btn').addEventListener('click', async () => {
  if (!navigator.xr) { status('WebXR not available'); return; }
  const ok = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) { status('immersive-vr not supported on this device/browser'); return; }

  xrSession = await navigator.xr.requestSession('immersive-vr', {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hand-tracking'],
  });
  refSpace = await xrSession.requestReferenceSpace('local-floor');

  await renderer.xr.setSession(xrSession);

  xrSession.addEventListener('end', () => {
    xrSession = null; refSpace = null;
    clearAllBlocks();
    score = 0; spawnTimer = 0;
    drawHUD();
    document.getElementById('ui').style.display = 'flex';
  });

  document.getElementById('ui').style.display = 'none';
  music.toggle();
});

function status(msg) {
  document.getElementById('status').textContent = msg;
}

// ─── Game Loop ────────────────────────────────────────────────────────────
let lastTime = 0, spawnTimer = 0;
const SPAWN_INTERVAL = 1.0;
const tmpPos     = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpStart   = new THREE.Vector3();
const tmpTip     = new THREE.Vector3();
const tmpMat     = new THREE.Matrix4();

const prevBlade = {
  left:  { start: new THREE.Vector3(), end: new THREE.Vector3() },
  right: { start: new THREE.Vector3(), end: new THREE.Vector3() },
};

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  // Beat handled by lookahead scheduler (startScheduler)

  // Spawn
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INTERVAL) { spawnBlock(); spawnTimer = 0; }

  // Move blocks
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    b.position.z += CUBE_SPEED * dt;
    if (b.position.z > MISS_Z) {
      scene.remove(b);
      blocks.splice(i, 1);
    }
  }

  // Controllers — button polling and pose must be inside the XR frame callback
  if (frame && refSpace) {
    checkAllButtons(frame);
    // drawDebugPanel(frame.session.inputSources); // DISABLED — see comment above

    for (const src of frame.session.inputSources) {
      if (!src.gripSpace) continue;
      const pose = frame.getPose(src.gripSpace, refSpace);
      if (!pose) continue;

      const hand = src.handedness === 'left' ? 'left' : 'right';
      const saber = sabers[hand];
      tmpMat.fromArray(pose.transform.matrix);
      tmpMat.decompose(saber.position, saber.quaternion, saber.scale);
      tmpPos.copy(saber.position);

      tmpForward.set(0, 0, -1).applyQuaternion(saber.quaternion);
      tmpStart.copy(tmpPos);
      tmpTip.copy(tmpPos).addScaledVector(tmpForward, SABER_REACH);

      checkHits(tmpStart, tmpTip, prevBlade[hand].start, prevBlade[hand].end, src, hand === 'left');

      prevBlade[hand].start.copy(tmpStart);
      prevBlade[hand].end.copy(tmpTip);
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.vel.y -= 8 * dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.life -= dt;
    if (p.userData.life <= 0) {
      p.visible = false;
      p.userData.active = false;
      particles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
});

// ─── Resize ───────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

