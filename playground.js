import * as THREE from 'three';
import { XRDevice, metaQuest3 } from 'iwer';

// ── IWER must be installed before any WebXR calls ──────────────────────────
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.position.set(0, 1.6, 0);

// ── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06010f);
scene.fog = new THREE.FogExp2(0x06010f, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 80);
camera.position.set(0, 1.6, 0);
scene.add(camera);

// Lighting
scene.add(new THREE.AmbientLight(0x6b21a8, 3));
const spot = new THREE.DirectionalLight(0xc084fc, 2);
spot.position.set(2, 6, -4);
scene.add(spot);

// Floor
const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshLambertMaterial({ color: 0x0d0020 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Grid overlay
const grid = new THREE.GridHelper(20, 20, 0x2d0060, 0x150030);
scene.add(grid);

// ── Target cubes ──────────────────────────────────────────────────────────
const targets = [];
const CUBE_COLORS = [0xff2060, 0x2060ff, 0xff8800, 0x00ffaa];

function makeTarget(x, y, z, colorIdx) {
  const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const mat = new THREE.MeshLambertMaterial({
    color: CUBE_COLORS[colorIdx % CUBE_COLORS.length],
    transparent: true, opacity: 0.85
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);

  // Wireframe edge highlight
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
  );
  mesh.add(edges);

  // Glow point light
  const light = new THREE.PointLight(CUBE_COLORS[colorIdx % CUBE_COLORS.length], 0.8, 1.2);
  mesh.add(light);

  mesh.userData = { alive: true, colorIdx, baseY: y };
  scene.add(mesh);
  targets.push(mesh);
  return mesh;
}

// Static arrangement — 3 rows, spread across player's reach
const positions = [
  [-0.8, 1.0, -2],  [-0.8, 1.5, -2],
  [ 0.0, 1.0, -2],  [ 0.0, 1.5, -2],  [ 0.0, 1.8, -2],
  [ 0.8, 1.0, -2],  [ 0.8, 1.5, -2],
  [-0.5, 1.2, -2.8],[ 0.5, 1.2, -2.8],
];
positions.forEach(([x, y, z], i) => makeTarget(x, y, z, i));

// ── Controller representations ─────────────────────────────────────────────
function makeSaber(color) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = -Math.PI / 2;
  g.add(inner);

  // Handle
  inner.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8),
    new THREE.MeshLambertMaterial({ color: 0x333333 })
  ));

  // Blade
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.9, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  blade.position.y = 0.09 + 0.9 / 2;
  inner.add(blade);

  // Glow
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false })
  );
  glow.position.y = 0.09 + 0.9 / 2;
  inner.add(glow);

  const light = new THREE.PointLight(color, 1.5, 1.2);
  light.position.y = 1.0;
  inner.add(light);

  scene.add(g);
  return g;
}

const leftSaber  = makeSaber(0xff2060);
const rightSaber = makeSaber(0x2060ff);
leftSaber.position.set(-0.4, 1.2, -0.3);
rightSaber.position.set( 0.4, 1.2, -0.3);

// Tip positions for hit detection
const BLADE_REACH = 0.09 + 0.9;
const prevTip = {
  left:  new THREE.Vector3(-0.4, 1.2, -0.3 - BLADE_REACH),
  right: new THREE.Vector3( 0.4, 1.2, -0.3 - BLADE_REACH),
};

// ── Score ─────────────────────────────────────────────────────────────────
let score = 0;
const scoreEl    = document.getElementById('score-display');
const scoreValEl = document.getElementById('score-val');
function addScore(n) {
  score += n;
  scoreValEl.textContent = score;
}

// ── Hit Detection ─────────────────────────────────────────────────────────
const _box = new THREE.Box3();
const _segDir = new THREE.Vector3();
const _diff   = new THREE.Vector3();

function segmentHitsBox(a, b, center, half) {
  _box.min.set(center.x - half, center.y - half, center.z - half);
  _box.max.set(center.x + half, center.y + half, center.z + half);
  _segDir.subVectors(b, a);
  let tmin = 0, tmax = 1;
  for (const axis of ['x', 'y', 'z']) {
    const d = _segDir[axis];
    if (Math.abs(d) < 1e-8) {
      if (a[axis] < _box.min[axis] || a[axis] > _box.max[axis]) return false;
    } else {
      const t0 = (_box.min[axis] - a[axis]) / d;
      const t1 = (_box.max[axis] - a[axis]) / d;
      tmin = Math.max(tmin, Math.min(t0, t1));
      tmax = Math.min(tmax, Math.max(t0, t1));
      if (tmin > tmax) return false;
    }
  }
  return true;
}

const _tipA = new THREE.Vector3();
const _tipB = new THREE.Vector3();
const _fwd  = new THREE.Vector3();

function checkSaberHits(saber, prevTipPos, isLeft) {
  _fwd.set(0, 0, -1).applyQuaternion(saber.quaternion);
  _tipA.copy(prevTipPos);
  _tipB.copy(saber.position).addScaledVector(_fwd, BLADE_REACH);

  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (!t.userData.alive) continue;
    if (segmentHitsBox(_tipA, _tipB, t.position, 0.18)) {
      t.userData.alive = false;
      scene.remove(t);
      targets.splice(i, 1);
      addScore(100);
      spawnParticles(t.position, CUBE_COLORS[t.userData.colorIdx % CUBE_COLORS.length]);
    }
  }

  prevTipPos.copy(_tipB);
}

// ── Particles ─────────────────────────────────────────────────────────────
const partGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const partPool = Array.from({ length: 60 }, () => {
  const p = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  p.visible = false;
  p.userData = { vel: new THREE.Vector3(), life: 0, active: false };
  scene.add(p);
  return p;
});
const activeParticles = [];

function spawnParticles(pos, color) {
  let count = 0;
  for (const p of partPool) {
    if (p.userData.active || count >= 10) continue;
    p.material.color.set(color);
    p.position.copy(pos);
    p.visible = true;
    p.userData.active = true;
    p.userData.life = 0.4 + Math.random() * 0.2;
    p.userData.vel.set(
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5
    );
    activeParticles.push(p);
    count++;
  }
}

// ── Desktop VR Controls ───────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

const playerPos = new THREE.Vector3(0, 1.6, 0);
let playerYaw = 0;
const MOVE_SPEED = 2; // m/s
const _moveDir = new THREE.Vector3();
const _moveQuat = new THREE.Quaternion();

renderer.domElement.addEventListener('click', () => {
  if (xrSession) renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || !xrSession) return;
  playerYaw -= e.movementX * 0.002;
  _moveQuat.setFromEuler(new THREE.Euler(0, playerYaw, 0, 'YXZ'));
  xrDevice.quaternion.set(_moveQuat.x, _moveQuat.y, _moveQuat.z, _moveQuat.w);
});

// ── XR Session ────────────────────────────────────────────────────────────
let xrSession = null, refSpace = null;

document.getElementById('enter-btn').addEventListener('click', async () => {
  console.log('click: navigator.xr =', navigator.xr);
  if (!navigator.xr) return;
  const supported = await navigator.xr.isSessionSupported('immersive-vr').catch((e) => { console.error('isSessionSupported error', e); return false; });
  console.log('click: supported =', supported);
  if (!supported) return;

  xrSession = await navigator.xr.requestSession('immersive-vr', {
    requiredFeatures: ['local-floor'],
  }).catch(e => { console.error('requestSession error', e); });
  console.log('xrSession =', xrSession);
  if (!xrSession) return;
  refSpace = await xrSession.requestReferenceSpace('local-floor').catch(e => { console.error('requestReferenceSpace error', e); });
  console.log('refSpace =', refSpace);
  await renderer.xr.setSession(xrSession).catch(e => { console.error('setSession error', e); });
  console.log('setSession done');

  xrSession.addEventListener('end', () => {
    xrSession = null; refSpace = null;
    document.getElementById('overlay').style.display = 'flex';
    scoreEl.classList.remove('active');
  });

  document.getElementById('overlay').style.display = 'none';
  scoreEl.classList.add('active');
});

// ── Render Loop ───────────────────────────────────────────────────────────
const tmpMat = new THREE.Matrix4();
let lastTime = 0;

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  // Animate targets — gentle bob
  for (const t of targets) {
    if (t.userData.alive) {
      t.position.y = t.userData.baseY + Math.sin(time * 0.001 + t.userData.colorIdx) * 0.04;
      t.rotation.y += dt * 0.4;
    }
  }

  // Controller poses from XR
  if (frame && refSpace) {
    for (const src of frame.session.inputSources) {
      if (!src.gripSpace) continue;
      const pose = frame.getPose(src.gripSpace, refSpace);
      if (!pose) continue;

      const saber = src.handedness === 'left' ? leftSaber : rightSaber;
      const prev  = src.handedness === 'left' ? prevTip.left : prevTip.right;

      tmpMat.fromArray(pose.transform.matrix);
      tmpMat.decompose(saber.position, saber.quaternion, saber.scale);

      checkSaberHits(saber, prev, src.handedness === 'left');
    }
  }

  // Particles
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.userData.vel.y -= 9 * dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.life -= dt;
    if (p.userData.life <= 0) {
      p.visible = false;
      p.userData.active = false;
      activeParticles.splice(i, 1);
    }
  }

  // WASD + Space/Shift locomotion — world-axis aligned, no camera rotation applied
  if (xrSession) {
    _moveDir.set(0, 0, 0);
    if (keys['w'])      _moveDir.z -= 1;
    if (keys['s'])      _moveDir.z += 1;
    if (keys['a'])      _moveDir.x -= 1;
    if (keys['d'])      _moveDir.x += 1;
    if (keys[' '])      _moveDir.y += 1;
    if (keys['shift'])  _moveDir.y -= 1;
    if (_moveDir.lengthSq() > 0) {
      _moveDir.normalize();
      playerPos.addScaledVector(_moveDir, MOVE_SPEED * dt);
      xrDevice.position.set(playerPos.x, playerPos.y, playerPos.z);
    }
  }

  renderer.render(scene, camera);
});

// ── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
