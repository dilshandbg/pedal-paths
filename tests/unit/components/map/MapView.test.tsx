import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapView } from '@/components/map/MapView';

describe('MapView placeholder', () => {
  it('renders a labelled map region that explains what will appear', () => {
    render(<MapView />);

    const region = screen.getByRole('region', { name: 'Map' });
    expect(region).toHaveTextContent('Strava export ZIP');
  });
});
