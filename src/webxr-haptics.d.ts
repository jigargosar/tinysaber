// Augment Gamepad with experimental WebXR haptic feedback API
// (hapticActuators + pulse are used by Quest controllers but absent from lib.dom.d.ts)
interface GamepadHapticActuator {
  pulse(value: number, duration: number): Promise<boolean>;
}

interface Gamepad {
  readonly hapticActuators?: ReadonlyArray<GamepadHapticActuator>;
}
