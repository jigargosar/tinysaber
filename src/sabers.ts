import * as THREE from 'three';

const HANDLE_LENGTH = 0.11;
const BLADE_LENGTH  = 1.10;

export const SABER_REACH = HANDLE_LENGTH + BLADE_LENGTH;

function makeSaber(color: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = -Math.PI / 2;
  g.add(inner);

  inner.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  ));

  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, BLADE_LENGTH, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  blade.position.y = HANDLE_LENGTH + BLADE_LENGTH / 2;
  inner.add(blade);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, BLADE_LENGTH, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, depthWrite: false })
  );
  glow.position.y = HANDLE_LENGTH + BLADE_LENGTH / 2;
  inner.add(glow);

  const light = new THREE.PointLight(color, 1.2, 1.5);
  light.position.y = SABER_REACH;
  inner.add(light);

  return g;
}

export interface Sabers {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
}

export function createSabers(): Sabers {
  const root  = new THREE.Group();
  const left  = makeSaber(0xff2020);
  const right = makeSaber(0x2060ff);
  left.position.set(-0.5, 1.2, -0.4);
  right.position.set(0.5, 1.2, -0.4);
  root.add(left, right);
  return { root, left, right };
}
