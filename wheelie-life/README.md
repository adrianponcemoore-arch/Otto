# WHEELIE LIFE

A 3D e-bike riding game for phones. You ride a low-poly city and manage
battery charge. Pedal assist and Turbo drain the battery. Coasting downhill,
regenerative braking and charging stations refill it. Run the battery flat and
you're left pedalling slowly on leg power.

This is the **first playable vertical slice**:

- one district, **Downtown**: a 7×7 block grid with bike lanes, zebra crossings,
  pocket parks with dirt and gravel paths, a fountain plaza, potholes, and a
  hill climbing up to the north-east
- one mode, **Delivery Rush**, with three shifts (Morning, Rainy Lunch,
  Night Owl) and a 3-star rating on each
- two bikes: the **Trail E-Moto**, a Sur-Ron-style electric dirt bike (the default), and the
  **City Commuter** pedal-assist e-bike. Both have working batteries and Eco/Tour/Turbo assist
- a rigged 3D rider (a CC0 character model) posed on the bike with IK: hands on the grips,
  feet on the pegs or turning the pedals, leaning into tucks and back in wheelies
- touch controls, the HUD, five upgrade tracks, a cosmetics shop, and local saves

It's built with Three.js (vendored, so there's no CDN and no build step) and
runs in mobile Safari and Chrome, in portrait or landscape.

## Run it

ES modules need a web server (`file://` won't work):

```sh
cd wheelie-life
python3 -m http.server 8080
# open http://localhost:8080 (or your machine's LAN IP from a phone)
```

On a phone, use **Add to Home Screen** to run it full screen with the icon.
Run the unit tests with `npm test` (Node 18+; nothing to install).

## Controls

| Touch | Action |
|---|---|
| Left half: drag left/right | Steer (a floating stick appears under your thumb) |
| Right half: hold | Pedal / accelerate with the current assist level |
| Right half: swipe up | Bunny-hop (clears potholes and curbs) |
| Right half: swipe down and hold | Tuck: less drag on descents, no pedalling |
| **WHEELIE** button: hold | Pedal and lift the front wheel. Every 2 m of wheelie adds 1 point to your score. A crash cancels it |
| **ASSIST** button | Cycle Eco → Tour → Turbo |
| **BRAKE** button | Brake, with a little regenerative charge |
| ❚❚ | Pause. The game also pauses when the app goes to the background |

Settings has optional **tilt to steer** (iOS asks for motion permission),
steering sensitivity, a left/right swap, haptics, volume and graphics quality.
On a keyboard: WASD or arrow keys, Space to hop, Shift to tuck, E to change
assist, R to wheelie, Esc to pause.

## Bikes

| | Trail E-Moto | City Commuter |
|---|---|---|
| Top speed Eco / Tour / Turbo | ~35 / 45 / 60 km/h | ~25 / 32 / 43 km/h |
| Battery use | 1.3× | 1× |
| Empty battery | paddle with your feet, ~10 km/h | pedal, ~15 km/h |
| Stars | needs 30% higher scores | standard |

Pick your bike in the **Garage**. The e-moto is an unbranded Sur-Ron-style model built in code
(`src/bike/emotoModel.js`); it uses your Shop paint colour on its plastics.

## How the battery works

| Assist | Top assisted speed | Drain at full load |
|---|---|---|
| Eco | ~25 km/h | 0.24 %/s |
| Tour | ~32 km/h | 0.45 %/s |
| Turbo | ~43 km/h | 1.0 %/s, plus an FOV kick and speed lines |

- **Leg power only** (empty battery) tops out around 15 km/h and crawls up hills.
- **Coasting downhill** (no pedalling, grade over 1.5%) regenerates up to 0.35 %/s.
- **Braking** regenerates up to 0.8 %/s.
- **Charging stations** (green rings, ⚡ on the minimap) add 9 %/s while you're stopped on the pad.
- **Wind** acts on relative airspeed. **Rain** cuts grip by 28%, so the bike slides wider in corners.

## Delivery Rush

Ride to the amber beam to pick up a package, then take it to the cyan beam.
Slow below about 15 km/h to hand it over. Each delivery pays a tip:
40 base, up to 60 for speed (against a par time for the distance), and up to 50
for cargo condition. Crashes, potholes, hard curb hits and big landings damage
the cargo, and the suspension upgrade reduces that damage. Each delivery adds 15 s to
the shift clock. Time left over at the end is added to your score.
★ = finish every delivery, ★★/★★★ = reach the score shown on the results screen.
Coins earned equal your score.

## Code layout

```
wheelie-life/
  index.html, style.css      DOM shell, HUD and controls (safe-area aware, portrait + landscape)
  src/main.js                App: boot, render loop, menus <-> session, pause/background, adaptive quality
  src/config.js              Tuning tables: assist levels, physics, surfaces, upgrades, frames, cosmetics
  src/game/session.js        One play-through: fixed-step physics (120 Hz), event routing, battery alerts
  src/bike/bikePhysics.js    Pure arcade physics and battery (no Three.js, unit tested)
  src/bike/bikeModel.js      Bike rig: lean, suspension, wheelie pivot, steering, headlight; switches bikes
  src/bike/emotoModel.js     Sur-Ron-style e-moto geometry and its IK markers (grips, pegs)
  src/bike/rider.js          Loads the rigged rider (GLB) and poses it with two-bone IK
  assets/models/             rider.glb (CC0, Quaternius) + CREDITS.md
  vendor/addons/             Three.js GLTFLoader + meshopt decoder (MIT)
  src/modes/GameMode.js      Base class every mode implements
  src/modes/DeliveryRush.js  Delivery Rush
  src/modes/index.js         Mode registry (Trail / Endless / Free Ride listed as "coming soon")
  src/data/levels.js         Level data (conditions, deliveries, time limit, star thresholds)
  src/world/maps/*.js        District definitions (pure data) + registry
  src/world/world.js         Builds a district from map data; height/surface/collision queries; LOD
  src/world/environment.js   Sky, sun/moon, fog, day/night cycle, rain, wind
  src/world/traffic.js       Pooled, instanced traffic that yields to the rider
  src/fx/*                   Chase camera, speed lines, objective markers + nav arrow, light trail
  src/core/*                 Touch/keyboard/tilt input, synthesized audio, haptics, saves, pooling, RNG
  src/ui/*                   HUD, minimap, menus (main, map select, garage, shop, settings, pause, results)
  tests/physics.test.mjs     Node unit tests for physics + battery
```

### Adding content

- **A mode:** subclass `GameMode`, implementing `start`, `update`, `onEvent`, `objective`,
  `clock` and `result`. Register it in `modes/index.js` and add its levels to `data/levels.js`.
  The session, HUD, minimap and results screen work with it unchanged.
- **A district:** add a map file next to `downtown.js` with blocks, hills, chargers,
  shop names and palette, then mark it `available` in `maps/index.js`.
- **A bike frame:** the `FRAMES` entries in `config.js` already carry the mass, grip, rolling
  resistance, drag and turn values the physics uses. Set `available: true` and add a model.
- **Upgrades and cosmetics:** add rows to `UPGRADES` or `COSMETICS`. The menus render from that data.

## Performance notes

- The whole static city is about 55–60 draw calls and roughly 100k triangles.
  Roads, sidewalks, curbs and markings are one vertex-coloured mesh. Buildings are
  instanced and chunked per 2×2 blocks. Traffic is two instanced draws.
- **LOD:** trees and rooftop props are instanced with high/low-detail meshes and
  re-bucketed by camera distance 10× a second. Far trees are dropped, and so are
  trees that would block the view between the camera and the rider.
- **Culling:** there's per-chunk frustum and distance culling, with fog hiding the
  cut-off. WebGL through Three.js has no hardware occlusion culling, so this is the
  stand-in; true occlusion culling would come with a native (Unity) port.
- **Pooling:** cars, objective markers, rain drops and HUD popups are pooled, so
  gameplay doesn't allocate per frame.
- **Auto quality:** the default mode caps the pixel ratio at 1.5 and steps it down to
  0.65 if the frame rate drops under 50 fps. If that's still not enough it turns off
  shadows, and it raises resolution again when there's headroom. Low and High presets are in Settings.

## Platform notes

- **Haptics** use the Vibration API, which works on Android. iOS Safari doesn't
  expose vibration to web pages, so it's a no-op there. A native wrapper (Capacitor,
  or a Unity port) can swap `core/haptics.js` for the Taptic Engine.
- **Audio** is fully synthesized with Web Audio. There's deliberately no motor whine; you hear
  tire noise shaped per surface (asphalt, concrete, gravel, dirt, grass, wet),
  wind, rain, a charging hum and SFX. It unlocks on the first touch, as iOS requires.
- **Saves:** progress lives in `localStorage` (`wheelielife.save.v1`, versioned schema).
  Private browsing still plays, it just won't persist.
- There are no ads and no in-app purchases. Coins only come from riding.

## Not in this slice

Trail Challenge, Endless Commute, Free Ride (with collectibles and viewpoints), the
other districts, extra frames, daily challenges and pedestrians. Each one already has
a registry slot or data stub so it can be added without restructuring.
