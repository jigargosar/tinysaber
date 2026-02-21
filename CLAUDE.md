# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # start dev server at https://localhost:5173 (self-signed cert)
```

No build, lint, or test commands — this is a plain JS + Vite project with no TypeScript or test framework.

HTTPS is required because WebXR only works on secure origins. The self-signed cert warning in the browser is expected — accept it.

To test on a Quest headset over WiFi, access `https://<your-local-ip>:5173` from the Quest browser. `vite.config.js` already sets `host: true`.

## Architecture

Single-file game: `src/main.js` loaded by `index.html`. No modules, no components — everything is in one file by design.

Stack: Three.js (rendering) + IWER (WebXR emulation in browser) + Web Audio API (procedural music). No framework, no TypeScript.

### IWER

`@iwer/devui` is removed — do not add it back. It pulls in React and is incompatible with this plain JS project.

IWER emulates the Quest WebXR runtime in the browser so the session flow (`navigator.xr.requestSession`, `frame.getPose`, `inputSources`) works without a headset. Initialized before any WebXR calls:

```js
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.position.set(0, 1.6, 0);
```

IWER's `position` and `quaternion` are custom types — they have `.set(x,y,z)` / `.set(x,y,z,w)` but are NOT `THREE.Vector3` / `THREE.Quaternion`. Never call Three.js methods like `.addScaledVector()` directly on them. Use a local `THREE.Vector3` to accumulate then call `.set()`.

To control controllers programmatically:
- `xrDevice.controllers['left' | 'right'].position.set(x, y, z)`
- `xrDevice.controllers['left' | 'right'].quaternion.set(x, y, z, w)`
- `xrDevice.controllers['left' | 'right'].updateButtonValue('a-button' | 'trigger' | 'squeeze' | 'thumbstick', 0..1)`

### Game loop structure (`src/main.js`)

The render loop runs via `renderer.setAnimationLoop((time, frame) => { ... })`. Inside the loop, in order:

1. Block spawning and forward movement (Z+)
2. Controller button polling — `checkAllButtons(frame)` — must be inside the XR frame callback per WebXR Gamepads spec
3. Saber pose update from `frame.getPose(src.gripSpace, refSpace)` → decompose into saber mesh transform
4. Hit detection — `checkHits()` with sub-step interpolation (6 substeps) between previous and current blade positions
5. Particle pool update
6. `renderer.render(scene, camera)`

### Hit detection

Uses a line-segment vs AABB test (`segmentHitsBox`) with 6 sub-steps between the previous and current blade tip positions. This catches fast swings that would otherwise tunnel through blocks. Pre-allocated temporaries (`_box`, `_segA`, `_segB`, etc.) avoid GC in the hot path.

### Music

Procedural Web Audio, scheduled via `setInterval` lookahead (40ms interval, 120ms lookahead). Four stages (Intro → Main → Peak → Break), each 4 bars, cycling. Instruments: kick, snare, hi-hat, bass, arp. All synth — no audio file assets.

`startScheduler()` starts on page load but music only plays when `musicOn = true` (toggled by Quest A button).

### Controller button mapping (Quest 2)

- Right A = `buttons[4]` → toggle music
- Right B = `buttons[5]` → toggle wireframe
- Left Y = `buttons[5]` → spawn debug 4×3 block wave

### Particle pool

96-slot object pool, zero allocation per explosion. Active particles tracked in a separate array (`particles`). 12 particles per explosion max.
