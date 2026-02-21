# Beat Saber Web — Dev Onboarding

## What this project is
A browser-based Beat Saber clone targeting Meta Quest via WebXR. Single-file MVP (`index.html`) built with Three.js loaded from CDN. Now migrating to a Vite-bundled setup so we can use IWER + DevUI for desktop controller emulation during development.

## Current state (as of this writing)

### What exists
- `index.html` — contains the full IWER playground scene (sabers, targets, hit detection, particles). Still uses broken importmap CDN approach for `three`, `iwer`, `@iwer/devui`. Needs to be converted to use Vite.
- `vite.config.js` — already correct, uses `@vitejs/plugin-basic-ssl` for HTTPS (required for WebXR on localhost)
- `package.json` — has `vite` + `@vitejs/plugin-basic-ssl` as devDeps. **Missing:** `three`, `iwer`, `@iwer/devui`
- `backups/` — old single-file MVP versions (v002–v004)
- `pnpm-workspace.yaml` — pnpm setup already in place
- `node_modules/` — vite installed, but three/iwer/devui not yet

### What is NOT done yet
- `pnpm add three iwer @iwer/devui` — **run this first**
- `main.js` — does not exist yet, needs to be created
- `index.html` — needs the inline `<script type="module">` block replaced with `<script type="module" src="/main.js">`

## Immediate next steps

### Step 1 — Install deps
```bash
pnpm add three iwer @iwer/devui
```

### Step 2 — Create `main.js`
Extract everything inside `<script type="module">` from `index.html` into `main.js`.

Change the imports at the top from CDN URLs to bare specifiers:
```js
import * as THREE from 'three';
import { XRDevice, metaQuest3 } from 'iwer';
import { DevUI } from '@iwer/devui';
```
Remove the `<script type="importmap">` block from `index.html` entirely.

### Step 3 — Update `index.html`
Replace:
```html
<script type="importmap">...</script>
...
<script type="module">
  // all the code
</script>
```
With:
```html
<script type="module" src="/main.js"></script>
```

### Step 4 — Run dev server
```bash
pnpm dev
```
Opens at `https://localhost:5173` (self-signed cert, accept the warning).
Click **ENTER VR** — IWER DevUI overlay appears. Enable **Play Mode** for FPS-style mouse+keyboard controller emulation.

## Architecture: how IWER fits in

IWER must be initialised **before** any WebXR API calls. The pattern is:
```js
import { XRDevice, metaQuest3 } from 'iwer';
import { DevUI } from '@iwer/devui';

const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();       // patches navigator.xr
const devui = new DevUI(xrDevice); // mounts the overlay UI
```
After this, the rest of the code is identical to real WebXR — `navigator.xr.requestSession`, `frame.getPose`, `inputSources`, gamepad buttons — all emulated by IWER.

## DevUI play mode controls (once in VR)
- **Mouse** — moves right controller / look direction
- **WASD** — moves left controller
- **Click** — squeeze/trigger on active hand
- Drag the overlay panel to reposition it

## Programmatic controller control (for testing specific inputs)
```js
// Press A button on right controller
xrDevice.controllers['right'].updateButtonValue('a-button', 1);
xrDevice.controllers['right'].updateButtonValue('a-button', 0); // release

// Move a controller
xrDevice.controllers['left'].position.set(-0.5, 1.2, -0.4);
```

## Beat Saber MVP context
The original game (`backups/`, now `index.html` pre-IWER) had:
- Block spawning at Z=-14, travelling toward player at 4 m/s
- 4 lanes × 3 heights
- Left saber = red, right = blue. Red blocks = left hand, blue = right
- Score: 100 correct, 25 wrong hand
- Controller buttons: A = music on/off, B = wireframe, Y = spawn debug wave
- Web Audio music with 4-stage arrangement (Intro → Main → Peak → Break)
- Object pool for particles (96 slots, 12 per explosion)
- Sub-step hit detection (6 substeps) to catch fast swings

## Toolchain
- **pnpm** (at `C:\Users\jigar\AppData\Local\pnpm\pnpm.exe` if not on PATH)
- **Vite 7** with `@vitejs/plugin-basic-ssl`
- **Three.js r167** (to be installed)
- **IWER 1.x** + **@iwer/devui 1.1.x** (to be installed)
- No framework, no TypeScript — plain JS

## Key files
| File | Purpose |
|------|---------|
| `index.html` | Entry point + HTML/CSS shell |
| `main.js` | To be created — all Three.js + IWER scene code |
| `vite.config.js` | Vite config with HTTPS plugin |
| `package.json` | Deps |
| `backups/` | Old single-file MVP versions for reference |
