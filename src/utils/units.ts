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

/** Duration for display: "45 min", "3 h 05 min", "1,204 h 30 min". Rounded to whole minutes. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours.toLocaleString('en-US')} h ${String(minutes).padStart(2, '0')} min`;
}
