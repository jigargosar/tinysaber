Code Review — Module Extraction Refactor

Reviewed: src/main.js, src/blocks.js, src/controllers.js, src/hud.js,
src/particles.js, src/sabers.js, src/scene.js, src/xrSession.js

## Bugs

### 1. Blocks spawn and accumulate outside XR session
`main.js:102-103` — the spawn timer runs unconditionally in the render loop. Blocks spawn at 1/sec, move forward, and get removed at `MISS_Z`. When the user hasn't entered VR, blocks still spawn into the scene and render on the 2D canvas behind the UI overlay. Wasteful and visible if the UI doesn't fully cover the canvas. Same behavior existed pre-refactor, but the refactor was an opportunity to fix it.

### 2. First frame phantom hit risk
`blocks.js:124-127` — each hit tester's `prev.start` / `prev.end` initialize to `(0,0,0)`. On the first frame of the *first* VR session, sub-step interpolation lerps from the origin to the actual saber position. If any block happens to be near the origin, the swept segment could register a false hit. The new code adds `reset()` on session *end* (fixing repeated sessions), but the first-ever session still has this.

## TDA Violations

### 3. main.js reaches into saber internals to set pose
`main.js:84-86`:
```js
const saber = sabers[hand];
tmpMat.fromArray(matrix);
tmpMat.decompose(saber.position, saber.quaternion, saber.scale);
```
The caller decomposes the matrix directly into the saber Group's `position`/`quaternion`/`scale`. The sabers module should own its pose update — expose a `setPose(hand, matrix)` method.

### 4. `hitCtx` mutable side-channel between `onControllerFrame` and `onHit`
`main.js:74` — `hitCtx` is a module-level mutable object set in `onControllerFrame` (line 93-94) and read in `onHit` (line 78-80). Correctness depends on `onHit` being called synchronously within `testHit` while `hitCtx` is still valid. This is implicit coupling — the callback's behavior depends on mutable state set by a different function.

A cleaner design: have `testHit` pass hand identity through to the callback, or let `onControllerFrame` bind a per-hand callback.

## ISI (Make Impossible States Impossible)

### 5. `hitCtx` has redundant `isLeftHand` field
`main.js:74`:
```js
const hitCtx = { isLeftHand: false, hand: 'left' };
```
`isLeftHand` is always `hand === 'left'`. Storing both creates two representations of the same fact that could theoretically diverge. Store only `hand` and derive `isLeftHand` in `onHit`.

### 6. `explode()` color comparison uses magic hex numbers
`particles.js:29`:
```js
const mat = color === 0xff2020 ? partMatRed : partMatBlue;
```
Any color value that isn't exactly `0xff2020` silently maps to blue. A boolean `isRed` parameter would make invalid inputs impossible instead of silently wrong.

## Encapsulation

### 7. World position vs local position inconsistency in blocks
- `blocks.js:133` — `testHit` uses `b.getWorldPosition(_blockPos)` (world space)
- `blocks.js:114` — `tick` uses `b.position.z > MISS_Z` (local space)

Currently `blocks.root` has identity transform so both are equivalent. But if `blocks.root` ever gets a transform, hit detection would use world coords while miss detection uses local coords. Both should use the same coordinate space.

### 8. `_hitPos` shared pre-allocated vector — fragile callback API
`blocks.js:149-150` — the `onHit` callback receives `_hitPos`, a module-level pre-allocated vector. The comment at line 122 documents this, but nothing prevents a future callback from storing the reference. The current caller (`particles.explode`) copies it, so it works today.

## What's Good

- **Session-end reset is improved** — the new code resets hit tester `prev` positions on session end, fixing a pre-existing bug where stale prev-blade data from a previous session could cause phantom hits.
- **Wall geometry sharing** — `scene.js` shares a single `PlaneGeometry` and material across all wall segments, fixing per-loop allocation from the old code.
- **`alive` flag correctly removed** — backward iteration with splice guarantees each block is visited at most once; the flag was redundant.
- **Error handling added to XR session** — `xrSession.js` has try/catch around session setup, which the old code lacked entirely.
- **Module boundaries are mostly clean** — blocks own their visual state (wireframe), particles own their pool, HUD owns score/draw. The factory+closure pattern keeps internals private.

## Summary by severity

```
+-----+========+======================================================+
| #   | Sev    | Issue                                                |
+-----+========+======================================================+
| 1   | Medium | Blocks spawn outside XR session (pre-existing)       |
+-----+--------+------------------------------------------------------+
| 2   | Low    | First-frame phantom hit from (0,0,0) prev positions  |
+-----+--------+------------------------------------------------------+
| 3   | Medium | TDA: main.js decomposes directly into saber fields   |
+-----+--------+------------------------------------------------------+
| 4   | Medium | TDA: hitCtx mutable side-channel implicit coupling   |
+-----+--------+------------------------------------------------------+
| 5   | Low    | ISI: redundant isLeftHand in hitCtx                  |
+-----+--------+------------------------------------------------------+
| 6   | Low    | ISI: color comparison with magic hex in particles    |
+-----+--------+------------------------------------------------------+
| 7   | Low    | World vs local position inconsistency in blocks      |
+-----+--------+------------------------------------------------------+
| 8   | Low    | Fragile shared pre-allocated vector callback API     |
+-----+--------+------------------------------------------------------+
```

No functional regressions found — the refactoring preserves all prior behavior correctly. Issues #1-2 are pre-existing. Issues #3-8 are design concerns surfaced by the module extraction.
