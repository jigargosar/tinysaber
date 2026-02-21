Beat Saber Web — Project Notes

## WebXR Emulation

@iwer/devui is deprecated — do not use it. It pulls in React, react-dom, and styled-components which are incompatible with this plain JS project.

Use the `iwer` package directly. The XRDevice is already initialized in playground.js:

```js
import { XRDevice, metaQuest3 } from 'iwer';
const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
```

VR simulation on desktop is done via mouse and keyboard by mapping input events to the IWER controller API:

- `xrDevice.controllers['left']` and `xrDevice.controllers['right']` — XRController instances
- `controller.updateButtonValue(buttonIndex, value)` — press/release buttons (0 = released, 1 = fully pressed)
- `controller.updateAxis(axisIndex, value)` — joystick axes
- `controller.position.set(x, y, z)` — move controller in world space
- `controller.quaternion.set(x, y, z, w)` — rotate controller

Typical desktop input mapping:
- Mouse movement → controller rotation / saber direction
- Mouse click → trigger press (`updateButtonValue`)
- WASD → controller position or locomotion axes
