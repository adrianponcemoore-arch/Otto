// Generic object pool. Used for traffic, markers, rain, HUD popups — anything
// that spawns and despawns repeatedly — so gameplay never allocates per frame.
export class Pool {
  constructor(create, { reset = null, initial = 0 } = {}) {
    this._create = create;
    this._reset = reset;
    this.free = [];
    this.active = new Set();
    for (let i = 0; i < initial; i++) this.free.push(create());
  }
  acquire() {
    const obj = this.free.pop() || this._create();
    this.active.add(obj);
    return obj;
  }
  release(obj) {
    if (!this.active.delete(obj)) return;
    if (this._reset) this._reset(obj);
    this.free.push(obj);
  }
  releaseAll() {
    for (const o of [...this.active]) this.release(o);
  }
}
