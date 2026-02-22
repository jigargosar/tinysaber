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

export function createParticles() {
  const root   = new THREE.Group();
  const pool   = [];
  const active = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const p = new THREE.Mesh(partGeo, partMatRed);
    p.visible = false;
    p.userData = { vel: new THREE.Vector3(), life: 0, active: false };
    root.add(p);
    pool.push(p);
  }

  function explode(pos, color) {
    const mat = color === 0xff2020 ? partMatRed : partMatBlue;
    let spawned = 0;
    for (let i = 0; i < POOL_SIZE && spawned < PARTICLES_PER_EXPLODE; i++) {
      const p = pool[i];
      if (p.userData.active) continue;
      p.material = mat;
      p.position.copy(pos);
      p.visible = true;
      p.userData.active = true;
      p.userData.vel.set(
        (Math.random() - 0.5) * PARTICLE_SPEED,
        (Math.random() - 0.5) * PARTICLE_SPEED,
        (Math.random() - 0.5) * PARTICLE_SPEED
      );
      p.userData.life = PARTICLE_LIFE_MIN + Math.random() * PARTICLE_LIFE_RANGE;
      active.push(p);
      spawned++;
    }
  }

  function tick(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.userData.vel.y -= PARTICLE_GRAVITY * dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        p.visible = false;
        p.userData.active = false;
        active.splice(i, 1);
      }
    }
  }

  return { root, explode, tick };
}
