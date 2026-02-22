export function setupXRSession(renderer, onSessionStart, onSessionEnd) {
  let xrSession = null;
  let refSpace  = null;
  const inputSources = { left: null, right: null };

  document.getElementById('enter-btn').addEventListener('click', async () => {
    if (!navigator.xr) { setStatus('WebXR not available'); return; }
    const ok = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    if (!ok) { setStatus('immersive-vr not supported on this device/browser'); return; }

    try {
      xrSession = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking'],
      });

      xrSession.addEventListener('end', () => {
        xrSession = null;
        refSpace  = null;
        inputSources.left  = null;
        inputSources.right = null;
        onSessionEnd();
      });

      refSpace = await xrSession.requestReferenceSpace('local-floor');
      await renderer.xr.setSession(xrSession);
      onSessionStart();
    } catch (err) {
      setStatus(`Failed to start VR session: ${err.message}`);
      if (xrSession) { xrSession.end().catch(() => {}); xrSession = null; }
    }
  });

  function setStatus(msg) {
    document.getElementById('status').textContent = msg;
  }

  function forEachController(frame, callback) {
    if (!frame || !refSpace) return;
    for (const src of frame.session.inputSources) {
      const hand = src.handedness;
      if (hand !== 'left' && hand !== 'right') continue;
      if (!src.gripSpace) continue;
      const pose = frame.getPose(src.gripSpace, refSpace);
      if (!pose) continue;
      inputSources[hand] = src;
      callback(hand, pose.transform.matrix);
    }
  }

  function triggerHaptic(hand, intensity = 0.8, ms = 100) {
    inputSources[hand]?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);
  }

  return { forEachController, triggerHaptic };
}
