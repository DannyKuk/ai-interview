// 462 → "07:42"
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(whole / 60)).padStart(2, "0");
  const ss = String(whole % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
