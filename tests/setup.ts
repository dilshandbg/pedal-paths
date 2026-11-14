import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetMapFakes } from './mocks/mapLibraries';

// jsdom has no WebGL: replace the map libraries with recording fakes in every test.
vi.mock('maplibre-gl', async () => {
  const fakes = await import('./mocks/mapLibraries');
  return {
    Map: fakes.FakeMap,
    NavigationControl: fakes.FakeNavigationControl,
    setWorkerUrl: fakes.fakeSetWorkerUrl,
  };
});
vi.mock('@deck.gl/mapbox', async () => {
  const fakes = await import('./mocks/mapLibraries');
  return { MapboxOverlay: fakes.FakeMapboxOverlay };
});

beforeEach(() => {
  resetMapFakes();
});

afterEach(() => {
  cleanup();
});
