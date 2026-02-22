import * as THREE from 'three';

const CUBE_SIZE       = 0.32;
const CUBE_GAP        = 0.15;
const LANE_SPACING    = CUBE_SIZE + CUBE_GAP;
const CUBE_HIT_MARGIN = Math.min(0.07, CUBE_GAP / 2);

const LANES_X    = [-1.5, -0.5, 0.5, 1.5].map(n => n * LANE_SPACING);
const LANES_Y    = [0.9, 1.35, 1.8];
const SPAWN_Z       = -14;
const DEBUG_WAVE_Z  =  -8;
const MISS_Z        =  1.2;
const CUBE_SPEED    =  4;
const SUBSTEPS      =  6;

const blockGeo     = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
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

// Pre-allocated temporaries — zero garbage in the hot path
const _blockPos  = new THREE.Vector3();
const _hitPos    = new THREE.Vector3();
const _box       = new THREE.Box3();
const _expanded  = new THREE.Box3();
const _d         = new THREE.Vector3();
const _segA      = new THREE.Vector3();
const _segB      = new THREE.Vector3();

function segmentHitsBox(a, b, box) {
  _expanded.copy(box).expandByScalar(CUBE_HIT_MARGIN);
  _d.subVectors(b, a);
  let tmin = 0, tmax = 1;
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

export function createBlocks() {
  const root = new THREE.Group();
  let blocks = [];
  let wireframeOn = true;

  function spawnCube(x, y, z, isRed) {
    const key = isRed ? 'red' : 'blue';
    const mesh = new THREE.Mesh(blockGeo, MATS[key]);
    mesh.position.set(x, y, z);
    const edges = new THREE.LineSegments(edgeGeo, EDGE_MATS[key]);
    edges.visible = wireframeOn;
    mesh.add(edges);
    mesh.userData = { isRed, edges };
    root.add(mesh);
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
    for (const b of blocks) root.remove(b);
    blocks = [];
  }

  function spawnDebugWave() {
    clearAllBlocks();
    for (const x of LANES_X)
      for (const y of LANES_Y)
        spawnCube(x, y, DEBUG_WAVE_Z, x < 0);
  }

  function toggleWireframe() {
    wireframeOn = !wireframeOn;
    for (const key of ['red', 'blue']) {
      MATS[key].opacity     = wireframeOn ? 0.45 : 1.0;
      MATS[key].transparent = wireframeOn;
      MATS[key].side        = wireframeOn ? THREE.DoubleSide : THREE.FrontSide;
      MATS[key].depthWrite  = !wireframeOn;
      MATS[key].needsUpdate = true;
    }
    for (const b of blocks) {
      b.userData.edges.visible = wireframeOn;
    }
  }

  function tick(dt) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      b.position.z += CUBE_SPEED * dt;
      if (b.position.z > MISS_Z) {
        root.remove(b);
        blocks.splice(i, 1);
      }
    }
  }

  // onHit(position: THREE.Vector3, isRed: boolean)
  // position is a shared pre-allocated vector — caller must not store the reference
  function createHitTester() {
    const prev = {
      start: new THREE.Vector3(),
      end:   new THREE.Vector3(),
    };

    function testHit(segStart, segEnd, onHit) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];

        b.getWorldPosition(_blockPos);
        const h = CUBE_SIZE / 2;
        _box.min.set(_blockPos.x - h, _blockPos.y - h, _blockPos.z - h);
        _box.max.set(_blockPos.x + h, _blockPos.y + h, _blockPos.z + h);

        let hit = false;
        for (let s = 0; s <= SUBSTEPS && !hit; s++) {
          const t = s / SUBSTEPS;
          _segA.lerpVectors(prev.start, segStart, t);
          _segB.lerpVectors(prev.end,   segEnd,   t);
          hit = segmentHitsBox(_segA, _segB, _box);
        }

        if (hit) {
          root.remove(b);
          blocks.splice(i, 1);
          _hitPos.copy(_blockPos);
          onHit(_hitPos, b.userData.isRed);
        }
      }

      prev.start.copy(segStart);
      prev.end.copy(segEnd);
    }

    function reset() {
      prev.start.set(0, 0, 0);
      prev.end.set(0, 0, 0);
    }

    return { testHit, reset };
  }

  return { root, spawnBlock, clearAllBlocks, spawnDebugWave, toggleWireframe, tick, createHitTester };
}
