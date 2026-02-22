# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # start dev server at https://localhost:5173 (self-signed cert)
pnpm typecheck  # run tsc --noEmit
pnpm build      # production build via Vite
```

HTTPS is required because WebXR only works on secure origins. Accept the self-signed cert warning in the browser.

To test on a Quest headset over WiFi, access `https://<your-local-ip>:5173` from the Quest browser. `vite.config.ts` already sets `host: true`.

## Stack

Three.js (rendering) + IWER (WebXR emulation in browser) + Web Audio API (procedural music) + TypeScript (strict mode). No framework. `src/main.ts` is the orchestrator loaded by `index.html`.

## IWER

`@iwer/devui` is removed — do not add it back. It pulls in React and is incompatible with this project.

IWER emulates the Quest WebXR runtime in the browser. Initialized before any WebXR calls:

```ts
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.position.set(0, 1.6, 0);
```

IWER's `position` and `quaternion` are custom types — they have `.set()` but are NOT `THREE.Vector3` / `THREE.Quaternion`. Never call Three.js methods like `.addScaledVector()` directly on them. Use a local `THREE.Vector3` to accumulate, then call `.set()`.

To control controllers programmatically:
- `xrDevice.controllers['left' | 'right'].position.set(x, y, z)`
- `xrDevice.controllers['left' | 'right'].quaternion.set(x, y, z, w)`
- `xrDevice.controllers['left' | 'right'].updateButtonValue('a-button' | 'trigger' | 'squeeze' | 'thumbstick', 0..1)`

See `docs/architecture.md` for render loop, hit detection, music, and particle system details.

## Source Structure

Each module returns a typed interface (e.g. `Sabers`, `Blocks`, `Particles`). Only `main.ts` calls `scene.add()`.

- `src/main.ts` — orchestrator: wires modules, owns game loop and session callbacks
- `src/scene.ts` — renderer, scene (bg/fog), camera, environment group (lights, grid, tunnel)
- `src/sabers.ts` — saber meshes; exports `createSabers()` → `Sabers` and `SABER_REACH`
- `src/blocks.ts` — block spawning, wireframe, movement tick, hit detection via `createHitTester()`
- `src/particles.ts` — pooled particle system; exports `createParticles()` → `Particles`
- `src/hud.ts` — canvas score sprite; exports `createHUD(buildLabel)` → `HUD`
- `src/controllers.ts` — XR button polling; exports `createControllers(music, toggleWireframe, spawnDebugWave)` → `Controllers`
- `src/xrSession.ts` — WebXR session lifecycle; exports `setupXRSession(renderer, onStart, onEnd)` → `XRSessionAPI`, also exports `Hand` type
- `src/music.ts` — procedural audio; exports `createMusic()` → `Music`
- `src/webxr-haptics.d.ts` — ambient augmentation for experimental GamepadHapticActuator.pulse API

## Conventions

**`BUILD` constant** (`src/main.ts` top) — increment on notable changes; displayed in the score HUD.

**Hot-path allocation** — pre-allocated temporaries (`_box`, `_segA`, `_segB`, `_d`, `_expanded`, `tmpPos`, etc.) avoid GC in the render loop. Never replace them with inline `new THREE.Vector3()` calls inside `setAnimationLoop` or `testHit`. Game loop callbacks (`onHit`, `onControllerFrame`) are hoisted named functions — never inline arrow functions inside `setAnimationLoop`.

**Group transform rule** — module root Groups must stay at identity transform. Hit detection uses `getWorldPosition()` so it is correct regardless, but movement tick uses local position which assumes identity.

**`createHitTester()`** — factory inside `createBlocks()`. Call once per saber: `hitTesters = { left: blocks.createHitTester(), right: blocks.createHitTester() }`. Call `reset()` on session end.

**`forEachController(frame, cb)`** — safe to call every frame; guards null frame and filters `handedness !== 'left'|'right'` internally. Callback receives `(hand: 'left'|'right', matrix: Float32Array)`.

## Scoring

Hitting a block with the correct saber color: +100 (`HIT_SCORE_CORRECT`). Wrong color: +25 (`HIT_SCORE_WRONG`). Score state owned by `hud.ts`; call `hud.addScore(amount)` — it redraws automatically.
