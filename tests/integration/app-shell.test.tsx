import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';

describe('application shell', () => {
  it('renders the title and the three dashboard regions', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Strava Cycling Heat Map' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Activity filters' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Activity statistics' })).toBeInTheDocument();
  });

  it('places the filter and statistics panels in their own regions', () => {
    render(<App />);

    const filters = screen.getByRole('complementary', { name: 'Activity filters' });
    const statistics = screen.getByRole('complementary', { name: 'Activity statistics' });

    expect(within(filters).getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    expect(within(statistics).getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
  });
});
