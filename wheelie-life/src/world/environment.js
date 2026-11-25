// Sky, sun/moon lighting, fog, day/night cycle and weather (rain + wind).
import * as THREE from '../../vendor/three.module.min.js';

const lerp = (a, b, t) => a + (b - a) * t;
const C = hex => new THREE.Color(hex);

// Keyframes over the day: [hour, skyTop, skyHorizon, sunColor, sunIntensity, hemiIntensity]
const KEYS = [
  [0,   C('#0b1030'), C('#1b2350'), C('#8aa0ff'), 0.25, 0.35],
  [5,   C('#141a44'), C('#3a3a6a'), C('#8aa0ff'), 0.25, 0.4],
  [6.5, C('#5f7fc8'), C('#ffb38a'), C('#ffb070'), 1.2,  0.9],
  [8,   C('#5aaef0'), C('#cfe9ff'), C('#fff1d6'), 2.4,  1.35],
  [12,  C('#4aa6f2'), C('#d6efff'), C('#ffffff'), 2.8,  1.5],
  [17,  C('#5aa2e6'), C('#ffe0b8'), C('#fff0d0'), 2.3,  1.3],
  [19,  C('#5464b4'), C('#ff9a6a'), C('#ff9050'), 1.1,  0.85],
  [20.5,C('#1d2458'), C('#5a4a7a'), C('#8aa0ff'), 0.3,  0.45],
  [24,  C('#0b1030'), C('#1b2350'), C('#8aa0ff'), 0.25, 0.35],
];

export class Environment {
  constructor(scene, quality) {
    this.scene = scene;
    this.tod = 9;
    this.todSpeed = 0.2;      // game minutes per real second
    this.rain = 0;
    this.targetRain = 0;
    this.windX = 0; this.windZ = 0;
    this.night = 0;
    this.time = 0;

    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#7a9a5a', 1.4);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#ffffff', 2.6);
    this.sun.castShadow = quality.shadows;
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
    this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog('#d6efff', 90, 330);

    // Gradient sky dome
    this.skyUniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, top, pow(max(y, 0.0), 0.55));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunCol * (pow(s, 900.0) * 2.0 + pow(s, 12.0) * 0.25);
          vec3 q = floor(vDir * 220.0);
          float star = step(0.9975, h(q)) * night * smoothstep(0.05, 0.3, y);
          c += vec3(star);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), skyMat);
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Rain: pooled line segments recycled in a box around the camera
    const N = quality.rainDrops;
    this.rainCount = N;
    const pos = new Float32Array(N * 6);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainDrops = [];
    for (let i = 0; i < N; i++) this.rainDrops.push({ x: (Math.random() - 0.5) * 50, y: Math.random() * 25, z: (Math.random() - 0.5) * 50, v: 18 + Math.random() * 6 });
    this.rainMat = new THREE.LineBasicMaterial({ color: '#cfe2ff', transparent: true, opacity: 0.0, depthWrite: false });
    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    scene.add(this.rainLines);

    this._apply();
  }

  setConditions({ timeOfDay = 9, todSpeed = 0.2, rain = 0, wind = 0, windDir = 0 }) {
    this.tod = timeOfDay;
    this.todSpeed = todSpeed;
    this.rain = this.targetRain = rain;
    this.windX = Math.sin(windDir) * wind;
    this.windZ = Math.cos(windDir) * wind;
    this._apply();
  }

  get wet() { return this.rain > 0.2; }
  get windSpeed() { return Math.hypot(this.windX, this.windZ); }

  _sample() {
    const t = ((this.tod % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = (t - a[0]) / (b[0] - a[0]);
    return {
      top: a[1].clone().lerp(b[1], f), hor: a[2].clone().lerp(b[2], f), sun: a[3].clone().lerp(b[3], f),
      sunI: lerp(a[4], b[4], f), hemiI: lerp(a[5], b[5], f),
    };
  }

  _apply() {
    const k = this._sample();
    const t = this.tod;
    // sun arc: rises 6:00 east (+X), sets 18:00 west (-X); moon on the opposite side at night
    const ang = ((t - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    this.night = THREE.MathUtils.clamp(1 - (elev + 0.12) / 0.3, 0, 1);
    const dir = elev > -0.05
      ? new THREE.Vector3(Math.cos(ang), Math.max(0.12, elev), 0.35).normalize()
      : new THREE.Vector3(-Math.cos(ang), Math.max(0.3, -elev), -0.3).normalize();
    this.sunDir = dir;

    const rainDim = 1 - this.rain * 0.45;
    const grey = new THREE.Color('#8f9aa8');
    k.top.lerp(grey, this.rain * 0.6);
    k.hor.lerp(grey, this.rain * 0.6);

    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI * rainDim;
    this.hemi.intensity = k.hemiI * (1 - this.rain * 0.2);
    this.hemi.color.copy(k.hor).lerp(new THREE.Color('#ffffff'), 0.4);
    this.hemi.groundColor.set(this.night > 0.5 ? '#2a3050' : '#7a9a5a');

    this.skyUniforms.top.value.copy(k.top);
    this.skyUniforms.horizon.value.copy(k.hor);
    this.skyUniforms.sunDir.value.copy(dir);
    this.skyUniforms.sunCol.value.copy(k.sun).multiplyScalar(elev > -0.05 ? 1 - this.rain : 0.25);
    this.skyUniforms.night.value = this.night * (1 - this.rain);

    this.scene.fog.color.copy(k.hor);
    this.scene.fog.near = lerp(90, 30, this.rain);
    this.scene.fog.far = lerp(330, 200, this.rain) * (1 - this.night * 0.25);
  }

  update(dt, focus) {
    this.time += dt;
    this.tod = (this.tod + (this.todSpeed * dt) / 60) % 24;
    this.rain += (this.targetRain - this.rain) * Math.min(1, dt * 0.5);
    this._apply();

    // shadow camera follows the player
    this.sun.position.set(focus.x + this.sunDir.x * 80, focus.y + this.sunDir.y * 80, focus.z + this.sunDir.z * 80);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(focus);

    // rain
    const on = this.rain > 0.02;
    this.rainLines.visible = on;
    if (on) {
      this.rainMat.opacity = 0.55 * this.rain;
      const a = this.rainGeo.attributes.position.array;
      const wx = this.windX * 0.08, wz = this.windZ * 0.08;
      for (let i = 0; i < this.rainCount; i++) {
        const d = this.rainDrops[i];
        d.y -= d.v * dt;
        if (d.y < -2) { d.y = 22 + Math.random() * 4; d.x = (Math.random() - 0.5) * 50; d.z = (Math.random() - 0.5) * 50; }
        const x = focus.x + d.x, y = focus.y + d.y, z = focus.z + d.z, o = i * 6;
        a[o] = x; a[o + 1] = y; a[o + 2] = z;
        a[o + 3] = x - wx; a[o + 4] = y + 0.9; a[o + 5] = z - wz;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }
  }
}
