// Heading-up circular minimap. The static city is pre-rendered once into an
// offscreen canvas; each frame we just blit it rotated and draw dynamic dots.
export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.scale = 2;   // px per metre on the base map
    this.view = 0.9;  // base-map px per css px... adjusted by zoom
    this._buildBase();
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = Math.max(60, r.width);
    this.canvas.width = Math.round(this.size * dpr);
    this.canvas.height = Math.round(this.size * dpr);
    this.dpr = dpr;
  }

  _buildBase() {
    const w = this.world, s = this.scale;
    const ext = w.half + 60;
    this.ext = ext;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(ext * 2 * s);
    const x = c.getContext('2d');
    const P = w.map.palette;
    const X = v => (v + ext) * s;
    x.fillStyle = '#5fa75a'; x.fillRect(0, 0, c.width, c.height);
    for (const b of w.blocks) {
      x.fillStyle = b.type === 'p' ? '#6fc36a' : b.type === 'z' ? '#efe3cc' : '#cfc9bf';
      x.fillRect(X(b.x0), X(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    }
    x.fillStyle = '#9aa0ad';
    for (const b of w.buildings) x.fillRect(X(b.x0), X(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    x.fillStyle = P.road;
    for (let i = 0; i <= w.N; i++) {
      const L = w.lineCoord(i);
      x.fillRect(X(-w.half - w.R / 2), X(L - w.R / 2), (w.W + w.R) * s, w.R * s);
      x.fillRect(X(L - w.R / 2), X(-w.half - w.R / 2), w.R * s, (w.W + w.R) * s);
    }
    this.base = c;
  }

  draw(bike, target, kind, cars) {
    const ctx = this.ctx, S = this.canvas.width, dpr = this.dpr;
    const zoom = 0.75 * dpr; // canvas px per base px  (base px = 0.5 m)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
    ctx.translate(S / 2, S / 2);
    // heading up: forward (+Z when yaw=0) must point up on screen
    ctx.rotate(Math.PI + bike.yaw);
    ctx.scale(zoom, zoom);
    const toB = v => (v + this.ext) * this.scale;
    ctx.translate(-toB(bike.x), -toB(bike.z));
    ctx.drawImage(this.base, 0, 0);
    const dot = (x, z, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(toB(x), toB(z), r / zoom * dpr, 0, Math.PI * 2); ctx.fill(); };
    for (const c of this.world.chargers) dot(c.x, c.z, 4, '#39ff88');
    if (cars) for (const c of cars) dot(c.x, c.z, 2.2, '#ffffff');
    ctx.restore();

    // target: clamp to the rim when off-map
    if (target) {
      const dx = target.x - bike.x, dz = target.z - bike.z;
      // world -> screen (heading up)
      const c = Math.cos(bike.yaw), sn = Math.sin(bike.yaw);
      const fwd = dx * sn + dz * c;            // along heading
      const right = -(dx * c - dz * sn);       // to rider's right (screen right)
      const k = zoom * this.scale;
      let sx = right * k, sy = -fwd * k;
      const rr = S / 2 - 8 * dpr, len = Math.hypot(sx, sy);
      const edge = len > rr;
      if (edge) { sx *= rr / len; sy *= rr / len; }
      ctx.fillStyle = kind === 'drop' ? '#22d3ee' : '#ffb020';
      ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(S / 2 + sx, S / 2 + sy, (edge ? 5 : 7) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // player arrow
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#c6ff3d'; ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -9 * dpr); ctx.lineTo(6 * dpr, 7 * dpr); ctx.lineTo(0, 3 * dpr); ctx.lineTo(-6 * dpr, 7 * dpr); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
