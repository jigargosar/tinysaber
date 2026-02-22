const RIGHT_A_BUTTON = 4;
const RIGHT_B_BUTTON = 5;
const LEFT_Y_BUTTON  = 5;

export function createControllers(music, toggleWireframe, spawnDebugWave) {
  const btnWas = { A: false, B: false, Y: false };

  function checkAllButtons(frame) {
    if (!frame) return;
    for (const src of frame.session.inputSources) {
      const gp = src?.gamepad;
      if (!gp) continue;
      if (src.handedness === 'right') {
        const aDown = gp.buttons[RIGHT_A_BUTTON]?.pressed ?? false;
        const bDown = gp.buttons[RIGHT_B_BUTTON]?.pressed ?? false;
        if (aDown && !btnWas.A) music.toggle();
        btnWas.A = aDown;
        if (bDown && !btnWas.B) toggleWireframe();
        btnWas.B = bDown;
      }
      if (src.handedness === 'left') {
        const yDown = gp.buttons[LEFT_Y_BUTTON]?.pressed ?? false;
        if (yDown && !btnWas.Y) spawnDebugWave();
        btnWas.Y = yDown;
      }
    }
  }

  return { checkAllButtons };
}
