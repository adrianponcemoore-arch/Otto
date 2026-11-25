// Touch-first input. Left half of the screen: drag to steer (floating
// stick). Right half: hold to ride, swipe up to bunny-hop, swipe down and hold
// to tuck. Brake / assist / pause are separate buttons. Keyboard and optional
// tilt steering feed the same state.
export class Input {
  constructor(layer, { onPause, onAssist } = {}) {
    this.layer = layer;
    this.onPause = onPause;
    this.onAssist = onAssist;
    this.state = { steer: 0, throttle: false, brake: false, tuck: false, hop: false };
    this.sensitivity = 1;
    this.tilt = false;
    this.leftHanded = false;
    this.enabled = false;
    this._steerId = null;
    this._throttleId = null;
    this._keys = new Set();
    this._tiltSteer = 0;
    this._hopQueued = false;

    this.stickBase = document.getElementById('stick');
    this.stickKnob = document.getElementById('stick-knob');
    this.throttleRing = document.getElementById('throttle-ring');

    layer.addEventListener('pointerdown', e => this._down(e));
    layer.addEventListener('pointermove', e => this._move(e));
    layer.addEventListener('pointerup', e => this._up(e));
    layer.addEventListener('pointercancel', e => this._up(e));
    layer.addEventListener('lostpointercapture', e => this._up(e));
    layer.addEventListener('contextmenu', e => e.preventDefault());

    const hold = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = e => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture?.(e.pointerId); this.state[key] = true; el.classList.add('held'); };
      const off = e => { e.preventDefault(); this.state[key] = false; el.classList.remove('held'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    hold('btn-brake', 'brake');

    window.addEventListener('keydown', e => this._key(e, true));
    window.addEventListener('keyup', e => this._key(e, false));
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('deviceorientation', e => this._orient(e));
  }

  clear() {
    this.state.steer = 0; this.state.throttle = false; this.state.brake = false; this.state.tuck = false;
    this._steerId = this._throttleId = null;
    this._keys.clear();
    this.stickBase?.classList.remove('on');
    this.throttleRing?.classList.remove('on');
    document.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
  }

  _isSteerSide(x) {
    const left = x < window.innerWidth / 2;
    return this.leftHanded ? !left : left;
  }

  _down(e) {
    // touches are tracked even during the countdown so a held finger launches at GO
    e.preventDefault();
    this.layer.setPointerCapture?.(e.pointerId);
    if (this._isSteerSide(e.clientX) && !this.tilt) {
      if (this._steerId !== null) return;
      this._steerId = e.pointerId;
      this._sx = e.clientX; this._sy = e.clientY;
      this.stickBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stickKnob.style.transform = 'translateX(0px)';
      this.stickBase.classList.add('on');
    } else {
      if (this._throttleId !== null) return;
      this._throttleId = e.pointerId;
      this._hist = [[e.clientY, performance.now()]];
      this._gestUntil = 0;
      this.state.throttle = true;
      this.throttleRing.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.throttleRing.classList.add('on');
    }
  }

  _move(e) {
    if (e.pointerId === this._steerId) {
      const R = 70 / this.sensitivity;
      let dx = e.clientX - this._sx;
      // floating origin: drag past the rim drags the stick along
      if (Math.abs(dx) > R) { this._sx += dx - Math.sign(dx) * R; dx = Math.sign(dx) * R; this.stickBase.style.transform = `translate(${this._sx}px, ${this._sy}px)`; }
      const v = dx / R;
      this.state.steer = Math.sign(v) * Math.min(1, Math.abs(v)) ** 1.25;
      this.stickKnob.style.transform = `translateX(${dx * (60 / R)}px)`;
    } else if (e.pointerId === this._throttleId) {
      // swipes are detected over a sliding window, so they work mid-hold
      const now = performance.now(), y = e.clientY;
      const h = this._hist;
      h.push([y, now]);
      // keep the newest sample older than the window as the baseline (finger may have been still)
      while (h.length > 2 && now - h[1][1] > 300) h.shift();
      if (now < this._gestUntil) return;
      let lo = Infinity, hi = -Infinity;
      for (const [hy] of h) { if (hy < lo) lo = hy; if (hy > hi) hi = hy; }
      if (hi - y > 40) {                       // moved up fast: hop (also cancels tuck)
        this._hopQueued = true; this.state.tuck = false;
        this._flash('hop'); this._gestUntil = now + 250; h.length = 0; h.push([y, now]);
      } else if (y - lo > 40 && !this.state.tuck) {  // moved down fast: tuck while held
        this.state.tuck = true; this._tuckY = y;
        this._flash('tuck'); this._gestUntil = now + 200; h.length = 0; h.push([y, now]);
      } else if (this.state.tuck && y < this._tuckY - 30) {
        this.state.tuck = false;                // slid back up: sit up
      }
    }
  }

  _up(e) {
    if (e.pointerId === this._steerId) {
      this._steerId = null;
      this.state.steer = 0;
      this.stickBase.classList.remove('on');
    } else if (e.pointerId === this._throttleId) {
      this._throttleId = null;
      this.state.throttle = false;
      this.state.tuck = false;
      this.throttleRing.classList.remove('on');
    }
  }

  _flash(kind) {
    const el = document.getElementById('gesture-hint');
    if (!el) return;
    el.textContent = kind === 'hop' ? 'HOP!' : 'TUCK';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  _key(e, down) {
    const k = e.key.toLowerCase();
    if (down && (k === 'escape' || k === 'p')) { this.onPause?.(); return; }
    // held keys are tracked during the countdown too (read() gates output)
    if (down) this._keys.add(k); else this._keys.delete(k);
    if (!this.enabled) return;
    if (down && (k === 'e' || k === 'q') && !e.repeat) { this.onAssist?.(); return; }
    if (down && k === ' ' && !e.repeat) { this._hopQueued = true; e.preventDefault(); }
  }

  _orient(e) {
    if (!this.tilt || e.gamma == null) return;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let t;
    if (angle === 90) t = e.beta;
    else if (angle === -90 || angle === 270) t = -e.beta;
    else t = e.gamma;
    this._tiltSteer = Math.max(-1, Math.min(1, (t / 28) * this.sensitivity));
  }

  static async requestTiltPermission() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      try { return (await D.requestPermission()) === 'granted'; } catch (e) { return false; }
    }
    return !!D;
  }

  /** Merge touch, keys and tilt into one frame's input. hop is edge-triggered. */
  read() {
    if (!this.enabled) { this._hopQueued = false; return { steer: 0, throttle: false, brake: false, tuck: false, hop: false }; }
    const k = this._keys, s = this.state;
    const keySteer = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    let steer = s.steer;
    if (keySteer) steer = keySteer;
    else if (this.tilt) steer = Math.abs(this._tiltSteer) < 0.06 ? 0 : this._tiltSteer;
    const out = {
      steer,
      throttle: s.throttle || k.has('arrowup') || k.has('w'),
      brake: s.brake || k.has('arrowdown') || k.has('s'),
      tuck: s.tuck || k.has('shift'),
      hop: this._hopQueued,
    };
    this._hopQueued = false;
    return out;
  }
}
