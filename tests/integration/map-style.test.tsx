import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { useMapStyleStore } from '@/features/heatmap/store/mapStyleStore';
import { BASE_MAP_STORAGE_KEY } from '@/features/heatmap/utils/baseMap';
import { FakeMap } from '../mocks/mapLibraries';

const mapInstance = async () => {
  // The map is lazily loaded; under a full parallel test run that can take a few seconds.
  await waitFor(() => expect(FakeMap.instances).toHaveLength(1), { timeout: 10_000 });
  return FakeMap.instances[0] as FakeMap;
};

/** In-memory localStorage: jsdom on some Node versions does not provide one. */
let stored: Map<string, string>;
const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(() => {
  stored = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
  });
  useMapStyleStore.setState({ baseMapId: null });
});
afterEach(() => {
  if (original) Object.defineProperty(window, 'localStorage', original);
  else Reflect.deleteProperty(window, 'localStorage');
});

describe('BR-32: choosing the map style', () => {
  it('starts on the colourful map, switches style in place and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);
    const map = await mapInstance();
    expect(map.options.style).toBe('https://tiles.openfreemap.org/styles/liberty');

    const select = within(screen.getByRole('main')).getByRole('combobox', { name: 'Map style' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Colourful', 'Light grey', 'Dark']);
    await user.selectOptions(select, 'Dark');

    expect(map.setStyleCalls).toEqual(['https://tiles.openfreemap.org/styles/dark']);
    expect(FakeMap.instances).toHaveLength(1); // the same map, not a new one
    expect(stored.get(BASE_MAP_STORAGE_KEY)).toBe('dark');
  });

  it('opens with the remembered style', async () => {
    useMapStyleStore.setState({ baseMapId: 'positron' });
    render(<App />);
    const map = await mapInstance();
    expect(map.options.style).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(screen.getByRole('combobox', { name: 'Map style' })).toHaveValue('positron');
  });

  it('falls back to the default for a remembered style that no longer exists', async () => {
    useMapStyleStore.setState({ baseMapId: 'removed-style' });
    render(<App />);
    expect((await mapInstance()).options.style).toBe(
      'https://tiles.openfreemap.org/styles/liberty',
    );
  });
});
