// ============================================================================
// CALL OF FLAPPY — MODERN BIRDFARE
// A 3D military flappy game. Pilot an attack helicopter through hostile
// AA towers. Everything (textures, models, audio) is generated procedurally.
// ============================================================================
import * as THREE from './vendor/three.module.min.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const WORLD = {
  gravity: -32,
  flapImpulse: 10.6,
  baseSpeed: 10.5,
  maxSpeed: 16.5,
  ceiling: 15.6,
  floor: 1.05,          // heli center height at which we call it a crash
  towerSpacing: 13.5,
  towerWidth: 3.0,
  towerDepth: 3.6,
  gapStart: 5.6,        // full gap height at score 0
  gapMin: 4.1,
  playerX: 0,
  playerRadius: 0.85,
};

const KILLSTREAKS = {
  3:  ['UAV ONLINE',            'ENEMY POSITIONS REVEALED'],
  5:  ['COUNTER-UAV DEPLOYED',  'ENEMY RADAR SCRAMBLED'],
  7:  ['CARE PACKAGE INBOUND',  'WATCH FOR THE SMOKE'],
  10: ['PRECISION AIRSTRIKE',   'DANGER CLOSE'],
  13: ['SENTRY GUN DEPLOYED',   'COVERING YOUR SIX'],
  17: ['ATTACK HELICOPTER',     'FRIENDLY BIRD IN THE AO'],
  21: ['EMERGENCY AIRDROP',     'THREE PACKAGES INBOUND'],
  25: ['AC-130 ABOVE',          'DEATH FROM ABOVE'],
  30: ['TACTICAL NUKE INBOUND', 'IT\'S OVER... IT\'S FINALLY OVER'],
};

const DEATH_QUOTES = [
  ['"The early bird gets the worm. The late bird gets the tower."', 'CPT. J. SPARROW — 141ST FEATHERED RECON'],
  ['"Fly low and they hit you. Fly high and they hit you. So fly perfect."', 'ROTARY WING FIELD MANUAL, PAGE 1'],
  ['"In the absence of orders — flap."', 'GEN. H. FEATHERTON'],
  ['"War never changes. Gravity changes even less."', 'UNKNOWN DOOR GUNNER'],
  ['"A tower is just a wall with ambition."', 'COMBAT ENGINEER PROVERB'],
  ['"No bird ever won a war by gliding."', 'SGT. MAJ. TALON'],
  ['"Altitude, airspeed and ideas — you just ran out of all three."', 'FLIGHT SCHOOL INSTRUCTOR, FT. WINGER'],
  ['"The rotor giveth, the concrete taketh away."', 'MAINTENANCE CREW, 2ND AVIATION'],
  ['"Check your six. Also your twelve. Mostly your twelve."', 'LT. GOOSE JR.'],
  ['"Ain\'t no education in the second impact."', 'CHIEF WARRANT OFFICER MALLARD'],
];

// ---------------------------------------------------------------------------
// Procedural canvas textures
// ---------------------------------------------------------------------------
function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

const rand = (a, b) => a + Math.random() * (b - a);

const sandTex = makeCanvas(512, (g, s) => {
  g.fillStyle = '#b3985f'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const v = rand(-22, 22) | 0;
    g.fillStyle = `rgb(${179 + v},${152 + v},${95 + v * 0.8})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  // wind streaks
  g.globalAlpha = 0.10;
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = Math.random() > 0.5 ? '#8d7546' : '#cbb377';
    g.lineWidth = rand(1, 4);
    const y = Math.random() * s;
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(s * 0.3, y + rand(-20, 20), s * 0.6, y + rand(-20, 20), s, y + rand(-10, 10));
    g.stroke();
  }
  // scorch marks
  g.globalAlpha = 0.35;
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = rand(8, 30);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(30,25,18,.8)'); gr.addColorStop(1, 'rgba(30,25,18,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
});

const concreteTex = makeCanvas(512, (g, s) => {
  g.fillStyle = '#8f8a7d'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 12000; i++) {
    const v = rand(-18, 18) | 0;
    g.fillStyle = `rgb(${143 + v},${138 + v},${125 + v})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  // grime streaks running down
  g.globalAlpha = 0.14;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * s;
    g.fillStyle = '#4d4a41';
    g.fillRect(x, Math.random() * s * 0.4, rand(2, 8), rand(60, 300));
  }
  // cracks
  g.globalAlpha = 0.55; g.strokeStyle = '#3d3a33'; g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += rand(-40, 40); y += rand(10, 50); g.lineTo(x, y); }
    g.stroke();
  }
  // bullet impacts
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = rand(2, 6);
    g.globalAlpha = 0.7; g.fillStyle = '#35322c';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.globalAlpha = 0.35; g.fillStyle = '#c9c4b5';
    g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 1.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
});

const heliTex = makeCanvas(256, (g, s) => {
  g.fillStyle = '#4a4f3d'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000; i++) {
    const v = rand(-12, 12) | 0;
    g.fillStyle = `rgb(${74 + v},${79 + v},${61 + v})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  g.globalAlpha = 0.25; g.strokeStyle = '#2e3226'; g.lineWidth = 1;
  for (let i = 0; i < 30; i++) {  // panel scratches
    const x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-24, 24), y + rand(-6, 6)); g.stroke();
  }
  g.globalAlpha = 1;
});

const smokeTex = makeCanvas(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

const fireTex = makeCanvas(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,230,1)');
  gr.addColorStop(0.25, 'rgba(255,190,80,0.9)');
  gr.addColorStop(0.6, 'rgba(230,80,20,0.5)');
  gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc4ac82, 30, 140);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);

// Sky dome with dusty gradient + sun glow
const SUN_DIR = new THREE.Vector3(-0.35, 0.42, -0.6).normalize();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(280, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sunDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 haze   = vec3(0.78, 0.66, 0.48);
        vec3 zenith = vec3(0.38, 0.47, 0.55);
        vec3 col = mix(haze, zenith, pow(h, 0.55));
        float sun = clamp(dot(dir, sunDir), 0.0, 1.0);
        col += vec3(1.0, 0.85, 0.6) * pow(sun, 350.0) * 1.4;   // disc
        col += vec3(0.9, 0.7, 0.45) * pow(sun, 8.0) * 0.35;    // haze glow
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xcdd3de, 0x7a6a4a, 0.75);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe3b8, 2.2);
sun.position.copy(SUN_DIR).multiplyScalar(60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -10;
sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
sandTex.repeat.set(30, 12);
const groundGeo = new THREE.PlaneGeometry(360, 140, 90, 30);
{ // gentle dunes, kept flat near the play corridor
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i); // plane local: y maps to world -z
    const distFromLane = Math.max(0, Math.abs(y) - 8);
    pos.setZ(i, (Math.sin(x * 0.11) * Math.cos(y * 0.13) * 1.6 + Math.sin(x * 0.031 + y * 0.05) * 2.2) * (distFromLane / 60));
  }
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Distant ruined skyline (parallax layer)
const skyline = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6152, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const w = rand(4, 10), h = rand(4, 18), d = rand(4, 8);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(rand(-90, 90), h / 2 - rand(0, 2), rand(-55, -85));
    b.rotation.y = rand(-0.2, 0.2);
    skyline.add(b);
  }
}
scene.add(skyline);

// ---------------------------------------------------------------------------
// Helicopter
// ---------------------------------------------------------------------------
function buildHelicopter() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ map: heliTex, roughness: 0.72, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23261d, roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1b1e, roughness: 0.12, metalness: 0.9 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.5, 6, 14), hull);
  body.rotation.z = Math.PI / 2;
  g.add(body);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.position.set(0.75, 0.18, 0);
  canopy.rotation.z = -0.5;
  canopy.scale.set(1.15, 0.8, 0.82);
  g.add(canopy);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 2.1, 10), hull);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-1.95, 0.12, 0);
  g.add(boom);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.08), hull);
  fin.position.set(-2.95, 0.45, 0);
  fin.rotation.z = -0.35;
  g.add(fin);

  // stub wings + rocket pods
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.09, 1.5), hull);
    wing.position.set(-0.15, 0.05, side * 0.85);
    g.add(wing);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 10), dark);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(-0.1, -0.12, side * 1.35);
    g.add(pod);
  }

  // chin gun
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), dark);
  gun.rotation.z = Math.PI / 2;
  gun.position.set(0.95, -0.45, 0);
  g.add(gun);

  // skids
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.1, 8), dark);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, -0.78, side * 0.5);
    g.add(rail);
    for (const lx of [-0.55, 0.55]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), dark);
      strut.position.set(lx, -0.57, side * 0.44);
      strut.rotation.x = side * 0.25;
      g.add(strut);
    }
  }

  // main rotor
  const rotor = new THREE.Group();
  rotor.position.set(0, 0.75, 0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 10), dark);
  rotor.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.03, 0.16), dark);
    blade.position.x = 1.35;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 4) * Math.PI * 2;
    holder.add(blade);
    rotor.add(holder);
  }
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.75, 32),
    new THREE.MeshBasicMaterial({ color: 0x1a1c15, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  blurDisc.rotation.x = -Math.PI / 2;
  blurDisc.position.y = 0.02;
  rotor.add(blurDisc);
  g.add(rotor);

  // tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(-3.0, 0.55, 0.12);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.02), dark);
    b.rotation.z = i * Math.PI / 2;
    tailRotor.add(b);
  }
  g.add(tailRotor);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, rotor, tailRotor };
}

const heli = buildHelicopter();
heli.group.position.set(WORLD.playerX, 8, 0);
scene.add(heli.group);

// ---------------------------------------------------------------------------
// Obstacles: ruined AA towers
// ---------------------------------------------------------------------------
concreteTex.repeat.set(1.2, 3);
const towerMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95, metalness: 0.02 });
const rebarMat = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.7, metalness: 0.6 });
const windowMat = new THREE.MeshStandardMaterial({ color: 0x14120e, roughness: 0.9 });

function buildTowerSection(height, brokenTop, brokenBottom) {
  const grp = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(WORLD.towerWidth, height, WORLD.towerDepth), towerMat);
  box.position.y = height / 2;
  box.castShadow = true; box.receiveShadow = true;
  grp.add(box);

  // window slits on the camera-facing side
  const rows = Math.max(1, Math.floor(height / 2.2));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.1), windowMat);
      w.position.set((c - 0.5) * 1.3, (r + 0.6) * (height / (rows + 0.2)), WORLD.towerDepth / 2 + 0.02);
      grp.add(w);
    }
  }

  // exposed rebar at the shattered edge
  const addRebar = (yEdge, up) => {
    for (let i = 0; i < 6; i++) {
      const len = rand(0.35, 0.9);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), rebarMat);
      bar.position.set(rand(-1.2, 1.2), yEdge + (up ? len / 2 : -len / 2), rand(-1.4, 1.4));
      bar.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5));
      grp.add(bar);
    }
  };
  if (brokenTop) addRebar(height, true);
  if (brokenBottom) addRebar(0, false);
  return grp;
}

class Obstacle {
  constructor() {
    this.group = new THREE.Group();
    this.lower = null;
    this.upper = null;
    this.scored = false;
    this.gapLo = 0; this.gapHi = 0;
    scene.add(this.group);
  }
  reset(x, gapCenter, gapHalf) {
    this.group.position.x = x;
    this.scored = false;
    this.gapLo = gapCenter - gapHalf;
    this.gapHi = gapCenter + gapHalf;
    for (const old of [this.lower, this.upper]) {
      if (!old) continue;
      old.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      this.group.remove(old);
    }
    this.lower = buildTowerSection(this.gapLo, true, false);
    this.upper = buildTowerSection(20 - this.gapHi, false, true);
    this.upper.position.y = this.gapHi;
    this.group.add(this.lower, this.upper);
    // sandbag ring at the base
    for (let i = 0; i < 5; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(rand(0.5, 0.8), 0.3, 0.45), propMats.bags);
      bag.position.set(rand(-2, 2), 0.15, WORLD.towerDepth / 2 + rand(0.3, 1));
      bag.rotation.y = rand(0, 3);
      bag.castShadow = true;
      this.lower.add(bag);
    }
  }
  get x() { return this.group.position.x; }
  set x(v) { this.group.position.x = v; }
}

const obstacles = [];
for (let i = 0; i < 6; i++) obstacles.push(new Obstacle());

function layoutObstacles() {
  for (let i = 0; i < obstacles.length; i++) {
    spawnObstacleAt(obstacles[i], 26 + i * WORLD.towerSpacing);
  }
}
function currentGapHalf() {
  const t = Math.min(1, game.score / 25);
  return (WORLD.gapStart - (WORLD.gapStart - WORLD.gapMin) * t) / 2;
}
function spawnObstacleAt(ob, x) {
  const half = currentGapHalf();
  const center = rand(3.2 + half, 13.2 - half);
  ob.reset(x, center, half);
}

// ---------------------------------------------------------------------------
// Scrolling props (wrecks, palms, hedgehogs, sandbag walls)
// ---------------------------------------------------------------------------
const props = [];
const propMats = {
  rust: new THREE.MeshStandardMaterial({ color: 0x4d4136, roughness: 0.9, metalness: 0.35 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.6, metalness: 0.7 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 1 }),
  frond: new THREE.MeshStandardMaterial({ color: 0x39412a, roughness: 1, side: THREE.DoubleSide }),
  bags: new THREE.MeshStandardMaterial({ color: 0x9a8a5e, roughness: 1 }),
};

function buildTankWreck() {
  const g = new THREE.Group();
  const hullMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 1.8), propMats.rust);
  hullMesh.position.y = 0.75;
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.2), propMats.rust);
  turret.position.set(-0.2, 1.45, 0);
  turret.rotation.y = rand(-0.6, 0.6);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 8), propMats.darkMetal);
  barrel.rotation.z = Math.PI / 2 - 0.12;
  barrel.position.set(1.1, 1.55, 0);
  turret.add(barrel);
  const tracks = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 2.3), propMats.darkMetal);
  tracks.position.y = 0.3;
  g.add(hullMesh, turret, tracks);
  g.userData.smokes = true;
  return g;
}
function buildPalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 4.5, 7), propMats.trunk);
  trunk.position.y = 2.25; trunk.rotation.z = rand(-0.15, 0.15);
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), propMats.frond);
    f.position.y = 4.5;
    f.rotation.y = (i / 6) * Math.PI * 2;
    f.rotation.z = -0.5;
    f.translateX(0.9);
    g.add(f);
  }
  return g;
}
function buildHedgehog() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.16), propMats.darkMetal);
    beam.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    beam.position.y = 0.55;
    g.add(beam);
  }
  return g;
}
function buildSandbagWall() {
  const g = new THREE.Group();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5 - r; c++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.4), propMats.bags);
      bag.position.set((c - (4 - r) / 2) * 0.64, 0.16 + r * 0.27, 0);
      bag.rotation.y = rand(-0.12, 0.12);
      g.add(bag);
    }
  }
  return g;
}

const propBuilders = [buildTankWreck, buildPalm, buildHedgehog, buildSandbagWall, buildTankWreck];
for (let i = 0; i < 22; i++) {
  const p = propBuilders[i % propBuilders.length]();
  p.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const behind = Math.random() > 0.28;
  p.position.set(rand(-30, 130), 0, behind ? rand(-24, -6) : rand(6, 10));
  p.rotation.y = rand(0, Math.PI * 2);
  const s = rand(0.8, 1.25); p.scale.set(s, s, s);
  scene.add(p);
  props.push(p);
}

// ---------------------------------------------------------------------------
// Particles (smoke / fire sprites)
// ---------------------------------------------------------------------------
class SpritePool {
  constructor(tex, count, blending) {
    this.pool = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, blending, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.visible = false;
      sp.userData = { life: 0 };
      scene.add(sp);
      this.pool.push(sp);
    }
    this.i = 0;
  }
  spawn(x, y, z, opts) {
    const sp = this.pool[this.i = (this.i + 1) % this.pool.length];
    sp.visible = true;
    sp.position.set(x, y, z);
    const u = sp.userData;
    u.life = u.maxLife = opts.life;
    u.vx = opts.vx || 0; u.vy = opts.vy || 0; u.vz = opts.vz || 0;
    u.grow = opts.grow || 0;
    u.drag = opts.drag ?? 1;
    u.startScale = opts.scale;
    u.opacity = opts.opacity ?? 0.8;
    sp.scale.setScalar(opts.scale);
    sp.material.color.set(opts.color ?? 0xffffff);
    sp.material.rotation = rand(0, Math.PI * 2);
  }
  update(dt, scrollSpeed) {
    for (const sp of this.pool) {
      const u = sp.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      if (u.life <= 0) { sp.visible = false; sp.material.opacity = 0; continue; }
      u.vx *= u.drag; u.vy *= u.drag; u.vz *= u.drag;
      sp.position.x += (u.vx - scrollSpeed) * dt;
      sp.position.y += u.vy * dt;
      sp.position.z += u.vz * dt;
      const t = u.life / u.maxLife;
      sp.material.opacity = u.opacity * t;
      const sc = u.startScale + u.grow * (1 - t);
      sp.scale.setScalar(sc);
    }
  }
}
const smoke = new SpritePool(smokeTex, 110, THREE.NormalBlending);
const fire = new SpritePool(fireTex, 50, THREE.AdditiveBlending);

function explosion(x, y, z, big = 1) {
  for (let i = 0; i < 22 * big; i++) {
    fire.spawn(x + rand(-0.5, 0.5), y + rand(-0.5, 0.5), z + rand(-0.5, 0.5), {
      life: rand(0.25, 0.7), scale: rand(0.8, 2.2) * big, grow: 2.5 * big,
      vx: rand(-6, 6), vy: rand(-2, 9), vz: rand(-6, 6), drag: 0.94, opacity: 1,
    });
  }
  for (let i = 0; i < 16 * big; i++) {
    smoke.spawn(x + rand(-0.8, 0.8), y + rand(-0.4, 0.8), z + rand(-0.8, 0.8), {
      life: rand(1.2, 2.6), scale: rand(1, 2) * big, grow: 4 * big,
      vx: rand(-2, 2), vy: rand(1, 4), vz: rand(-2, 2), drag: 0.985,
      color: 0x2c2a26, opacity: 0.75,
    });
  }
  flashLight.position.set(x, y, z);
  flashLight.intensity = 60 * big;
}
const flashLight = new THREE.PointLight(0xffa040, 0, 40, 2);
scene.add(flashLight);

// ---------------------------------------------------------------------------
// Background war ambience: tracer fire arcs
// ---------------------------------------------------------------------------
const tracers = [];
{
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1.2, 0)]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    scene.add(line);
    tracers.push({ line, t: rand(0, 4), active: false, vx: 0, vy: 0 });
  }
}
function updateTracers(dt) {
  for (const tr of tracers) {
    if (!tr.active) {
      tr.t -= dt;
      if (tr.t <= 0) {
        tr.active = true;
        tr.line.visible = true;
        const fromGround = Math.random() > 0.45;
        tr.line.position.set(rand(-40, 70), fromGround ? rand(0, 2) : rand(14, 22), rand(-30, -60));
        const ang = fromGround ? rand(0.5, 1.2) : rand(-1.2, -0.5);
        const sp = rand(35, 55);
        tr.vx = Math.cos(ang) * sp * (Math.random() > 0.5 ? 1 : -1);
        tr.vy = Math.sin(ang) * sp;
        tr.life = rand(0.5, 1.1);
        tr.line.rotation.z = Math.atan2(tr.vy, tr.vx) - Math.PI / 2;
      }
    } else {
      tr.line.position.x += tr.vx * dt;
      tr.line.position.y += tr.vy * dt;
      tr.life -= dt;
      if (tr.life <= 0 || tr.line.position.y < 0) {
        tr.active = false; tr.line.visible = false; tr.t = rand(0.4, 3.5);
        if (tr.line.position.y < 0.5) {
          fire.spawn(tr.line.position.x, 0.4, tr.line.position.z, { life: 0.3, scale: 1.2, grow: 1.5, vy: 2, opacity: 0.9 });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Audio: fully synthesized battlefield
// ---------------------------------------------------------------------------
class WarAudio {
  constructor() { this.ctx = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise(2);
    this.startRotor();
    this.artilleryTimer = 2;
  }
  makeNoise(seconds) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  startRotor() {
    const ctx = this.ctx;
    // blade slap: noise, low-passed, amplitude-chopped at ~15 Hz
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    const chop = ctx.createGain(); chop.gain.value = 0.25;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 14.5;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain); lfoGain.connect(chop.gain);
    this.rotorGain = ctx.createGain(); this.rotorGain.gain.value = 0;
    src.connect(lp); lp.connect(chop); chop.connect(this.rotorGain);
    // turbine whine
    const whine = ctx.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 190;
    const whineLp = ctx.createBiquadFilter(); whineLp.type = 'lowpass'; whineLp.frequency.value = 600;
    const whineGain = ctx.createGain(); whineGain.gain.value = 0.025;
    whine.connect(whineLp); whineLp.connect(whineGain); whineGain.connect(this.rotorGain);
    this.rotorGain.connect(this.master);
    src.start(); lfo.start(); whine.start();
  }
  setRotor(on) {
    if (!this.ctx) return;
    this.rotorGain.gain.setTargetAtTime(on ? 1 : 0.25, this.ctx.currentTime, 0.4);
  }
  burst({ dur = 0.3, filter = 'lowpass', freq = 800, freqEnd, gain = 0.5, q = 1 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, rand(0, 1)); src.stop(t + dur + 0.05);
  }
  tone({ type = 'sine', from = 440, to, dur = 0.2, gain = 0.2, delay = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(from, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  flap() { if (!this.ctx) return; this.burst({ dur: 0.28, filter: 'bandpass', freq: 380, freqEnd: 1400, gain: 0.4, q: 1.4 }); }
  score() {
    if (!this.ctx) return;
    this.tone({ type: 'square', from: 1500, dur: 0.045, gain: 0.12 });
    this.tone({ type: 'square', from: 2100, dur: 0.05, gain: 0.09, delay: 0.05 });
  }
  streak() {
    if (!this.ctx) return;
    this.tone({ type: 'sawtooth', from: 196, dur: 0.22, gain: 0.16 });
    this.tone({ type: 'sawtooth', from: 294, dur: 0.32, gain: 0.16, delay: 0.14 });
    this.tone({ type: 'sawtooth', from: 392, dur: 0.42, gain: 0.14, delay: 0.28 });
  }
  explosion() {
    if (!this.ctx) return;
    this.burst({ dur: 1.3, filter: 'lowpass', freq: 900, freqEnd: 80, gain: 1.0 });
    this.burst({ dur: 0.25, filter: 'highpass', freq: 2000, gain: 0.3 });
    this.tone({ type: 'sine', from: 130, to: 28, dur: 1.1, gain: 0.7 });
  }
  distantBoom() {
    if (!this.ctx) return;
    this.burst({ dur: rand(0.8, 1.6), filter: 'lowpass', freq: rand(90, 160), gain: rand(0.12, 0.3), q: 0.5 });
  }
  update(dt) {
    if (!this.ctx) return;
    this.artilleryTimer -= dt;
    if (this.artilleryTimer <= 0) {
      this.artilleryTimer = rand(3, 9);
      this.distantBoom();
    }
  }
}
const audio = new WarAudio();

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const scoreEl = $('score'), streakEl = $('streakBanner'), altNeedle = $('altNeedle'),
  gsVal = $('gsVal'), compassTape = $('compassTape'), damageFlash = $('damageFlash'),
  hitmarker = $('hitmarker'), menuScreen = $('menuScreen'), deathScreen = $('deathScreen');

{ // build the compass tape
  const dirs = ['N', '015', '030', 'NE', '060', '075', 'E', '105', '120', 'SE', '150', '165',
    'S', '195', '210', 'SW', '240', '255', 'W', '285', '300', 'NW', '330', '345'];
  let html = '';
  for (let r = 0; r < 4; r++) for (const d of dirs) html += `<span>${d}</span>`;
  compassTape.innerHTML = html;
}

let bannerTimeout = null;
function showBanner(title, sub, hold = 2200) {
  streakEl.innerHTML = `${title}<small>${sub}</small>`;
  streakEl.classList.add('show');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => streakEl.classList.remove('show'), hold);
}

function showHitmarker() {
  hitmarker.style.transition = 'none';
  hitmarker.style.opacity = '1';
  requestAnimationFrame(() => {
    hitmarker.style.transition = 'opacity .25s';
    hitmarker.style.opacity = '0';
  });
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = {
  state: 'menu',        // menu | playing | dying | dead
  vy: 0,
  score: 0,
  best: +(localStorage.getItem('cof_best') || 0),
  speed: WORLD.baseSpeed,
  worldX: 0,            // total distance scrolled, drives compass/ground
  shake: 0,
  dieTimer: 0,
  spinVel: 0,
};

function resetRun() {
  game.vy = 0;
  game.score = 0;
  game.speed = WORLD.baseSpeed;
  game.shake = 0;
  heli.group.position.set(WORLD.playerX, 8, 0);
  heli.group.rotation.set(0, 0, 0);
  heli.group.visible = true;
  layoutObstacles();
  scoreEl.firstChild.textContent = '0';
}

function startRun() {
  resetRun();
  game.state = 'playing';
  menuScreen.classList.add('hidden');
  deathScreen.classList.add('hidden');
  damageFlash.style.opacity = '0';
  audio.setRotor(true);
  flap();
}

function flap() {
  game.vy = WORLD.flapImpulse;
  audio.flap();
  // downwash puff
  const p = heli.group.position;
  for (let i = 0; i < 3; i++) {
    smoke.spawn(p.x + rand(-0.6, 0.6), p.y - 1, p.z + rand(-0.4, 0.4), {
      life: 0.5, scale: 0.5, grow: 1.2, vy: -3, vx: rand(-1, 1), color: 0xcdbb92, opacity: 0.3,
    });
  }
}

function die(hitTower) {
  if (game.state !== 'playing') return;
  game.state = 'dying';
  game.dieTimer = 0;
  game.shake = 1;
  game.spinVel = rand(3, 6) * (Math.random() > 0.5 ? 1 : -1);
  game.vy = Math.min(game.vy, 2);
  const p = heli.group.position;
  explosion(p.x, p.y, p.z, hitTower ? 1.4 : 1.1);
  audio.explosion();
  audio.setRotor(false);
  damageFlash.style.opacity = '1';
  setTimeout(() => { damageFlash.style.opacity = '0.55'; }, 180);
}

function showDeathScreen() {
  game.state = 'dead';
  const isRecord = game.score > game.best;
  if (isRecord) {
    game.best = game.score;
    localStorage.setItem('cof_best', String(game.best));
  }
  $('finalScore').textContent = game.score;
  $('bestScore').textContent = game.best;
  $('newRecord').style.display = isRecord && game.score > 0 ? 'block' : 'none';
  const q = DEATH_QUOTES[(Math.random() * DEATH_QUOTES.length) | 0];
  $('deathQuote').innerHTML = `${q[0]}<span class="who">— ${q[1]}</span>`;
  deathScreen.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
let deadInputLockUntil = 0;
function onAction() {
  audio.ensure();
  if (game.state === 'menu') { startRun(); return; }
  if (game.state === 'playing') { flap(); return; }
  if (game.state === 'dead' && performance.now() > deadInputLockUntil) startRun();
}
addEventListener('pointerdown', onAction);
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    onAction();
  }
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let camY = 8;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.033);
  const p = heli.group.position;
  const playing = game.state === 'playing';
  const dying = game.state === 'dying';

  audio.update(dt);

  // ---- physics ----
  if (playing || dying) {
    game.vy += WORLD.gravity * dt;
    p.y += game.vy * dt;

    if (playing) {
      heli.group.rotation.z = THREE.MathUtils.clamp(game.vy * 0.05, -0.55, 0.38);
      heli.group.rotation.x = Math.sin(performance.now() * 0.002) * 0.02;
    } else {
      heli.group.rotation.z += game.spinVel * dt;
      heli.group.rotation.x += game.spinVel * 0.4 * dt;
      // burning on the way down
      if (Math.random() < 0.6) {
        fire.spawn(p.x + rand(-0.5, 0.5), p.y + rand(-0.3, 0.5), p.z, { life: 0.35, scale: 1, grow: 1, vy: 2, opacity: 0.9 });
        smoke.spawn(p.x, p.y + 0.5, p.z, { life: 1.4, scale: 0.8, grow: 2.5, vy: 2.5, color: 0x1e1c1a, opacity: 0.8 });
      }
      game.dieTimer += dt;
      if (p.y <= WORLD.floor) {
        p.y = WORLD.floor;
        if (heli.group.visible) {
          explosion(p.x, 1, p.z, 1.6);
          audio.explosion();
          heli.group.visible = false;
          game.shake = 1;
        }
      }
      if (game.dieTimer > 1.4) {
        deadInputLockUntil = performance.now() + 450;
        showDeathScreen();
      }
    }
  } else if (game.state === 'menu') {
    p.y = 8 + Math.sin(performance.now() * 0.0016) * 0.5;
    heli.group.rotation.z = Math.sin(performance.now() * 0.001) * 0.05;
  }

  // ---- world scroll ----
  const scroll = (playing || dying) ? (dying ? game.speed * 0.25 : game.speed) : game.speed * 0.35;
  game.worldX += scroll * dt;
  sandTex.offset.x = (game.worldX / 12) % 1;
  skyline.position.x -= scroll * 0.12 * dt;
  if (skyline.position.x < -60) skyline.position.x += 120;

  for (const ob of obstacles) {
    ob.x -= scroll * dt;
    if (ob.x < -22) {
      let maxX = -Infinity;
      for (const o of obstacles) maxX = Math.max(maxX, o.x);
      spawnObstacleAt(ob, maxX + WORLD.towerSpacing);
    }
    // scoring
    if (playing && !ob.scored && ob.x + WORLD.towerWidth / 2 < p.x - WORLD.playerRadius) {
      ob.scored = true;
      game.score++;
      game.speed = Math.min(WORLD.maxSpeed, WORLD.baseSpeed + game.score * 0.14);
      scoreEl.firstChild.textContent = String(game.score);
      showHitmarker();
      audio.score();
      const ks = KILLSTREAKS[game.score];
      if (ks) { showBanner(ks[0], ks[1]); audio.streak(); }
    }
    // collision
    if (playing) {
      const dx = Math.abs(p.x - ob.x);
      if (dx < WORLD.towerWidth / 2 + WORLD.playerRadius * 0.9) {
        if (p.y - WORLD.playerRadius < ob.gapLo || p.y + WORLD.playerRadius > ob.gapHi) die(true);
      }
    }
  }

  for (const pr of props) {
    pr.position.x -= scroll * dt;
    if (pr.position.x < -40) {
      pr.position.x += 170;
      pr.rotation.y = rand(0, Math.PI * 2);
    }
    if (pr.userData.smokes && Math.random() < dt * 2.2 && pr.position.x > -20 && pr.position.x < 60) {
      smoke.spawn(pr.position.x, 1.6, pr.position.z, {
        life: rand(2, 3.5), scale: 0.9, grow: 3, vy: rand(1.2, 2.2), vx: rand(0.5, 1.5),
        color: 0x1f1d1b, opacity: 0.5,
      });
    }
  }

  // bounds
  if (playing) {
    if (p.y <= WORLD.floor) { p.y = WORLD.floor; die(false); }
    if (p.y >= WORLD.ceiling) { p.y = WORLD.ceiling; game.vy = Math.min(game.vy, 0); }
    // rotor dust near the deck
    if (p.y < 4 && Math.random() < dt * 14) {
      smoke.spawn(p.x + rand(-1.5, 1.5), 0.3, p.z + rand(-1.5, 1.5), {
        life: 0.9, scale: 1, grow: 2.5, vy: rand(0.5, 1.5), vx: rand(-2, 2), vz: rand(-1, 1),
        color: 0xc3ab7c, opacity: 0.35,
      });
    }
  }

  // ---- rotors ----
  const rotorSpeed = dying ? 8 : 46;
  heli.rotor.rotation.y += rotorSpeed * dt;
  heli.tailRotor.rotation.z += rotorSpeed * 2.6 * dt;

  // ---- particles / ambience ----
  smoke.update(dt, scroll * 0.6);
  fire.update(dt, scroll * 0.6);
  updateTracers(dt);
  flashLight.intensity = Math.max(0, flashLight.intensity - flashLight.intensity * 6 * dt);

  // ---- camera ----
  camY += (p.y * 0.55 + 3.6 - camY) * Math.min(1, dt * 4);
  game.shake = Math.max(0, game.shake - dt * 1.6);
  const sh = game.shake * game.shake;
  camera.position.set(
    4.2 + rand(-sh, sh) * 0.8,
    camY + rand(-sh, sh) * 0.8,
    16.5 + rand(-sh, sh) * 0.5
  );
  camera.lookAt(3.2, camY + 2.4, 0);
  camera.rotation.z += Math.sin(performance.now() * 0.0008) * 0.004 + (playing ? game.vy * -0.002 : 0);

  sun.target.position.set(0, 0, 0);

  // ---- HUD ----
  altNeedle.style.top = `${(1 - p.y / 16) * 100}%`;
  if (Math.random() < 0.1) gsVal.textContent = String((scroll * 13.5 + rand(-2, 2)) | 0);
  const tapeW = compassTape.scrollWidth / 4;
  compassTape.style.transform = `translateX(${-((game.worldX * 6) % tapeW)}px)`;

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

layoutObstacles();
tick();

// debug/autopilot hook (harmless in production)
window.__cof = { game, heli, obstacles, WORLD };
