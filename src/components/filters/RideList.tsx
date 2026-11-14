import { useId } from 'react';
import type { ActivityId } from '@/types';

export interface RideOption {
  readonly activityId: ActivityId;
  readonly name: string;
  /** Display date, already formatted. */
  readonly date: string;
}

interface RideListProps {
  rides: readonly RideOption[];
  excludedActivityIds: ReadonlySet<ActivityId>;
  onRideToggle: (activityId: ActivityId, included: boolean) => void;
}

/** Checkbox list for selecting and deselecting individual rides (BR-09). Prop-driven only. */
export function RideList({ rides, excludedActivityIds, onRideToggle }: RideListProps) {
  const legendId = useId();

  return (
    <fieldset aria-labelledby={legendId} className="flex min-w-0 flex-col gap-2">
      <legend id={legendId} className="text-xs font-medium tracking-wide text-slate-600 uppercase">
        Rides
      </legend>
      {rides.length === 0 ? (
        <p className="text-sm text-slate-500">Load your Strava export to choose rides.</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
          {rides.map((ride) => (
            <li key={ride.activityId}>
              <RideCheckbox
                ride={ride}
                checked={!excludedActivityIds.has(ride.activityId)}
                onChange={onRideToggle}
              />
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

interface RideCheckboxProps {
  ride: RideOption;
  checked: boolean;
  onChange: (activityId: ActivityId, included: boolean) => void;
}

function RideCheckbox({ ride, checked, onChange }: RideCheckboxProps) {
  const nameId = useId();
  const dateId = useId();
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-slate-50">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-orange-600"
        checked={checked}
        aria-labelledby={nameId}
        aria-describedby={dateId}
        onChange={(event) => onChange(ride.activityId, event.target.checked)}
      />
      <span className="flex min-w-0 flex-col">
        <span id={nameId} className="truncate text-slate-800">
          {ride.name}
        </span>
        <span id={dateId} className="text-xs text-slate-500">
          {ride.date}
        </span>
      </span>
    </label>
  );
}
