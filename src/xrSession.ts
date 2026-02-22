import type { WebGLRenderer } from 'three';

export type Hand = 'left' | 'right';

export type ControllerCallback = (hand: Hand, matrix: Float32Array) => void;

export interface XRSessionAPI {
  forEachController: (frame: XRFrame | undefined, callback: ControllerCallback) => void;
  triggerHaptic: (hand: Hand, intensity?: number, ms?: number) => void;
}

export function setupXRSession(
  renderer: WebGLRenderer,
  onSessionStart: () => void,
  onSessionEnd: () => void,
): XRSessionAPI {
  let xrSession: XRSession | null = null;
  let refSpace: XRReferenceSpace | null = null;
  const inputSources: Record<Hand, XRInputSource | null> = { left: null, right: null };

  const enterBtn = document.getElementById('enter-btn');
  if (!enterBtn) throw new Error('Missing #enter-btn element');

  enterBtn.addEventListener('click', async () => {
    if (xrSession) return;
    if (!navigator.xr) { setStatus('WebXR not available'); return; }
    const ok = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    if (!ok) { setStatus('immersive-vr not supported on this device/browser'); return; }

    enterBtn.setAttribute('disabled', 'true');
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
        enterBtn.removeAttribute('disabled');
        onSessionEnd();
      });

      refSpace = await xrSession.requestReferenceSpace('local-floor');
      await renderer.xr.setSession(xrSession);
      onSessionStart();
    } catch (err) {
      enterBtn.removeAttribute('disabled');
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Failed to start VR session: ${message}`);
      if (xrSession) { xrSession.end().catch(() => {}); xrSession = null; }
    }
  });

  function setStatus(msg: string): void {
    const el = document.getElementById('status');
    if (el) el.textContent = msg;
  }

  function forEachController(frame: XRFrame | undefined, callback: ControllerCallback): void {
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

  function triggerHaptic(hand: Hand, intensity = 0.8, ms = 100): void {
    inputSources[hand]?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);
  }

  return { forEachController, triggerHaptic };
}
