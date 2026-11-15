/**
 * Test doubles for MapLibre and deck.gl's MapboxOverlay. jsdom has no WebGL, so the real libraries
 * can't run in Vitest. These fakes record what the app asked for so tests can assert on it.
 * Registered globally in `tests/setup.ts`.
 */

interface FakeControl {
  onAdd?: (map: unknown) => HTMLElement;
  onRemove?: () => void;
}

export class FakeMap {
  static instances: FakeMap[] = [];
  static nextError: Error | null = null;

  readonly controls: FakeControl[] = [];
  readonly fitBoundsCalls: [unknown, unknown][] = [];
  readonly setStyleCalls: unknown[] = [];
  removed = false;

  constructor(readonly options: Record<string, unknown>) {
    if (FakeMap.nextError) {
      const error = FakeMap.nextError;
      FakeMap.nextError = null;
      throw error;
    }
    FakeMap.instances.push(this);
  }

  addControl(control: FakeControl): this {
    this.controls.push(control);
    control.onAdd?.(this);
    return this;
  }

  fitBounds(bounds: unknown, options?: unknown): this {
    this.fitBoundsCalls.push([bounds, options]);
    return this;
  }

  setStyle(style: unknown): this {
    this.setStyleCalls.push(style);
    return this;
  }

  remove(): void {
    this.removed = true;
    for (const control of this.controls) {
      control.onRemove?.();
    }
  }
}

export class FakeNavigationControl {
  constructor(readonly options?: unknown) {}
  onAdd(): HTMLElement {
    return document.createElement('div');
  }
  onRemove(): void {}
}

export class FakeMapboxOverlay {
  static instances: FakeMapboxOverlay[] = [];
  props: { layers?: unknown[]; interleaved?: boolean };
  removed = false;

  constructor(props: { layers?: unknown[]; interleaved?: boolean }) {
    this.props = props;
    FakeMapboxOverlay.instances.push(this);
  }
  setProps(props: { layers?: unknown[] }): void {
    this.props = { ...this.props, ...props };
  }
  onAdd(): HTMLElement {
    return document.createElement('div');
  }
  onRemove(): void {
    this.removed = true;
  }
}

export function resetMapFakes(): void {
  FakeMap.instances = [];
  FakeMap.nextError = null;
  FakeMapboxOverlay.instances = [];
}

export const workerUrls: string[] = [];
export function fakeSetWorkerUrl(url: string): void {
  workerUrls.push(url);
}
