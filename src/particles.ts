import * as THREE from 'three';

const POOL_SIZE             = 96;
const PARTICLES_PER_EXPLODE = 12;
const PARTICLE_SIZE         = 0.06;
const PARTICLE_SPEED        = 4;
const PARTICLE_GRAVITY      = 8;
const PARTICLE_LIFE_MIN     = 0.45;
const PARTICLE_LIFE_RANGE   = 0.2;

const partGeo     = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE);
const partMatRed  = new THREE.MeshBasicMaterial({ color: 0xff2020 });
const partMatBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });

interface ParticleData {
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

export interface Particles {
  root: THREE.Group;
  explode: (pos: THREE.Vector3, color: number) => void;
  tick: (dt: number) => void;
}

export function createParticles(): Particles {
  const root   = new THREE.Group();
  const pool:   THREE.Mesh[] = [];
  const active: THREE.Mesh[] = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const p = new THREE.Mesh(partGeo, partMatRed);
    p.visible = false;
    p.userData = { vel: new THREE.Vector3(), life: 0, active: false } satisfies ParticleData;
    root.add(p);
    pool.push(p);
  }

  function particleData(mesh: THREE.Mesh): ParticleData {
    return mesh.userData as ParticleData;
  }

  function explode(pos: THREE.Vector3, color: number): void {
    const mat = color === 0xff2020 ? partMatRed : partMatBlue;
    let spawned = 0;
    for (let i = 0; i < POOL_SIZE && spawned < PARTICLES_PER_EXPLODE; i++) {
      const p = pool[i];
      const data = particleData(p);
      if (data.active) continue;
      p.material = mat;
      p.position.copy(pos);
      p.visible = true;
      data.active = true;
      data.vel.set(
        (Math.random() - 0.5) * PARTICLE_SPEED,
        (Math.random() - 0.5) * PARTICLE_SPEED,
        (Math.random() - 0.5) * PARTICLE_SPEED
      );
      data.life = PARTICLE_LIFE_MIN + Math.random() * PARTICLE_LIFE_RANGE;
      active.push(p);
      spawned++;
    }
  }

  function tick(dt: number): void {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      const data = particleData(p);
      data.vel.y -= PARTICLE_GRAVITY * dt;
      p.position.addScaledVector(data.vel, dt);
      data.life -= dt;
      if (data.life <= 0) {
        p.visible = false;
        data.active = false;
        active.splice(i, 1);
      }
    }
  }

  return { root, explode, tick };
}
