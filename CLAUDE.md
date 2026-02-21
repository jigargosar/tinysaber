# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # start dev server at https://localhost:5173 (self-signed cert)
```

No build, lint, or test commands — plain JS + Vite, no TypeScript or test framework.

HTTPS is required because WebXR only works on secure origins. Accept the self-signed cert warning in the browser.

To test on a Quest headset over WiFi, access `https://<your-local-ip>:5173` from the Quest browser. `vite.config.js` already sets `host: true`.

## Stack

Three.js (rendering) + IWER (WebXR emulation in browser) + Web Audio API (procedural music). No framework, no TypeScript. Single-file game: `src/main.js` loaded by `index.html`.

## IWER

`@iwer/devui` is removed — do not add it back. It pulls in React and is incompatible with this plain JS project.

IWER emulates the Quest WebXR runtime in the browser. Initialized before any WebXR calls:

```js
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
