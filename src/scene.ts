import * as THREE from 'three';

const CAMERA_FOV  = 75;
const VIEW_NEAR   = 0.01;
const VIEW_FAR    = 100;
const EYE_HEIGHT  = 1.6;

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('hsl(270,100%,3%)');
  scene.fog = new THREE.Fog(0x050005, 20, 60);
  return scene;
}

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, VIEW_NEAR, VIEW_FAR);
  camera.position.set(0, EYE_HEIGHT, 0);
  return camera;
}

export function createEnvironment(): THREE.Group {
  const root = new THREE.Group();

  root.add(new THREE.AmbientLight(0x8866aa, 2));
  const fill = new THREE.DirectionalLight(0xffffff, 1.2);
  fill.position.set(0, 5, -5);
  root.add(fill);

  root.add(new THREE.GridHelper(40, 40, 0x330055, 0x1a0033));

  const wallGeo = new THREE.PlaneGeometry(0.02, 2.5);
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x220044, side: THREE.DoubleSide });
  for (let z = -2; z > -40; z -= 4) {
    for (const x of [-1.5, 1.5]) {
      const m = new THREE.Mesh(wallGeo, wallMat);
      m.position.set(x, 1.2, z);
      root.add(m);
    }
  }

  return root;
}
