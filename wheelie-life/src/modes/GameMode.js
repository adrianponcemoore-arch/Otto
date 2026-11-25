// Base class every game mode extends. A session calls these hooks; modes
// never touch input, physics or rendering setup directly — they get a ctx with
// the world, markers, hud, audio and haptics, so new modes (Trail Challenge,
// Endless Commute, Free Ride) slot in without changing the core loop.
export class GameMode {
  static id = 'base';
  static title = 'Mode';
  static icon = '🎮';
  static available = false;
  static blurb = '';

  constructor(ctx, level) {
    this.ctx = ctx;
    this.level = level;
    this.finished = false;
    this.result = null;
  }
  /** Where the bike starts: { x, z, yaw } */
  startPose() { return this.ctx.world.start; }
  start() {}
  /** Called every fixed step with the bike state. */
  update(dt, bike) {}
  /** Gameplay events from physics: crash, bump, pothole, land, scrape, hop. */
  onEvent(ev, bike) {}
  /** HUD objective: { title, sub, target: {x,z} | null } */
  objective() { return null; }
  /** Clock shown at the top of the HUD in seconds, or null. */
  clock() { return null; }
  dispose() {}
}
