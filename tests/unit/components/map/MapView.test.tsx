import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapView } from '@/components/map/MapView';

describe('MapView placeholder', () => {
  it('asks for a Strava export ZIP before any data is loaded', () => {
    render(<MapView loadedRideCount={null} />);

    expect(screen.getByRole('region', { name: 'Map' })).toHaveTextContent('Strava export ZIP');
  });

  it('shows how many rides are loaded once a dataset exists', () => {
    render(<MapView loadedRideCount={1234} />);

    expect(screen.getByRole('region', { name: 'Map' })).toHaveTextContent('1,234 rides loaded');
  });
});
