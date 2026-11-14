const KM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const METRES = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Distance for display, metric (ADR-0007): "1,234.5 km". */
export function formatDistanceKm(distanceKm: number): string {
  return `${KM.format(distanceKm)} km`;
}

/** Elevation for display, metric (ADR-0007): "12,345 m". */
export function formatElevationM(elevationM: number): string {
  return `${METRES.format(elevationM)} m`;
}
