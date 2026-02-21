architecture

## Render Loop

`renderer.setAnimationLoop((time, frame) => { ... })` — order matters:

1. Block spawning and forward movement (Z+)
2. Controller button polling — `checkAllButtons(frame)` — must be inside the XR frame callback per WebXR Gamepads spec
3. Saber pose update from `frame.getPose(src.gripSpace, refSpace)` → decomposed into saber mesh transform
4. Hit detection — `checkHits()` with sub-step interpolation between previous and current blade positions
5. Particle pool update
6. `renderer.render(scene, camera)`

## Hit Detection

Line-segment vs AABB test (`segmentHitsBox`) with 6 sub-steps between the previous and current blade tip positions. Sub-stepping catches fast swings that would otherwise tunnel through blocks in a single frame. Pre-allocated temporaries (`_box`, `_segA`, `_segB`, etc.) avoid GC in the hot path.

## Music

Procedural Web Audio scheduled via `setInterval` lookahead (40ms interval, 120ms lookahead). Four stages cycling: Intro → Main → Peak → Break, each 4 bars. Instruments: kick, snare, hi-hat, bass, arp — all synthesised, no audio file assets.

`startScheduler()` runs on page load but music only plays when `musicOn = true`, toggled by the Quest A button.

## Controller Button Mapping (Quest 2)

- Right A = `buttons[4]` → toggle music
- Right B = `buttons[5]` → toggle wireframe
- Left Y  = `buttons[5]` → spawn debug 4×3 block wave

## Particle Pool

96-slot object pool, zero allocation per explosion. 12 particles emitted per hit, tracked in a separate `particles` array. Slots are reclaimed when `life <= 0`.
