# CALL OF FLAPPY — Modern Birdfare

A super-realistic military-themed 3D flappy game. Pilot an attack helicopter
through a war-torn desert canyon of ruined anti-air towers.

## Features

- Full 3D scene (Three.js, vendored — no CDN needed): dusty desert atmosphere,
  volumetric-style sky with sun haze, soft shadows, ACES filmic tone mapping
- Procedurally generated everything — concrete, sand and camo textures, the
  helicopter model, ruined towers with exposed rebar, tank wrecks, palms,
  sandbag walls, czech hedgehogs
- Battlefield ambience: background tracer fire, burning wrecks, distant
  artillery, rotor dust when flying low
- COD-style HUD: compass tape, altimeter, kill counter, hitmarkers,
  killstreak banners (UAV at 3 ... Tactical Nuke at 30)
- Power-ups floating in the corridor: **Tactical Nuke** (white-out flash that
  clears every tower in the AO, each counting as a kill), **Juggernaut Armor**
  (a shield bubble that absorbs one tower impact — the tower explodes instead
  of you), and **Stim** (5 seconds of slow-mo reflex boost)
- Fully synthesized audio (Web Audio API): rotor blade slap + turbine whine,
  collective whoosh, hitmarker ticks, killstreak stings, explosions,
  distant artillery — no audio files
- Cinematic death: explosion, tumbling crash, screen shake, damage vignette,
  film grain, MISSION FAILED screen with rotating parody death quotes
- Career-best score persisted in localStorage

## Controls

Tap / click / `Space` / `W` / `↑` — collective up (flap). Avoid the towers,
the deck and the ceiling.

## Run it

Module scripts need a web server (opening `index.html` via `file://` won't work):

```sh
cd cod-flappy-3d
python3 -m http.server 8080
# open http://localhost:8080
```

If the repo is deployed as a static site, the game is served at `/cod-flappy-3d/`.
