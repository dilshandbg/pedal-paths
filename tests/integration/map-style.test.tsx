import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useMapStyleStore } from '@/features/heatmap/store/mapStyleStore';
import { BASE_MAP_STORAGE_KEY, HEAT_PALETTE_STORAGE_KEY } from '@/features/heatmap/utils/baseMap';
import { FakeMap } from '../mocks/mapLibraries';

// These tests wait for the lazy-loaded map (up to 15 s): give them room beyond the 5 s default,
// which a cold map import can exceed while the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

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
  useMapStyleStore.setState({ baseMapId: null, heatPaletteId: null });
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

  it('lets the user choose the heat colours, magenta–purple by default, and remembers them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await mapInstance();
    const colours = screen.getByRole('combobox', { name: 'Heat colours' });
    expect(colours).toHaveValue('magenta-purple');
    expect(
      within(colours)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Magenta–purple', 'Fire (orange–red)']);
    await user.selectOptions(colours, 'Fire (orange–red)');
    expect(colours).toHaveValue('fire');
    expect(stored.get(HEAT_PALETTE_STORAGE_KEY)).toBe('fire');
    expect(screen.getByRole('group', { name: 'Map display' })).toBeInTheDocument();
  });

  it('opens with the remembered heat colours, or the default for an unknown one', async () => {
    useMapStyleStore.setState({ heatPaletteId: 'fire' });
    const { unmount } = render(<App />);
    expect(screen.getByRole('combobox', { name: 'Heat colours' })).toHaveValue('fire');
    unmount();
    useMapStyleStore.setState({ heatPaletteId: 'rainbow' });
    render(<App />);
    expect(screen.getByRole('combobox', { name: 'Heat colours' })).toHaveValue('magenta-purple');
  });
});
