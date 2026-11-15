/** Whether a base map is light or dark; the heat map colours follow it (BR-32). */
export type BaseMapTheme = 'light' | 'dark';

/** A heat map colour ramp the user can choose (OD-27). */
export type HeatPaletteId = 'magenta-purple' | 'fire';

/** A base map the user can choose (BR-32). */
export interface BaseMapOption {
  readonly id: string;
  readonly label: string;
  /** MapLibre style URL. */
  readonly url: string;
  readonly theme: BaseMapTheme;
}
