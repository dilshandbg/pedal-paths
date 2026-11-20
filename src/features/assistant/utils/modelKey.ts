/**
 * The key two names of the same model share in the screens: `qwen3` and `qwen3:latest` are one
 * model (the backend uses this rule too).
 */
export function modelKey(name: string): string {
  const lower = name.trim().toLowerCase();
  const lastSegment = lower.slice(lower.lastIndexOf('/') + 1);
  return lastSegment.includes(':') ? lower : `${lower}:latest`;
}
