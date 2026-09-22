export function demoTransportDuration(
  baseLatency: number,
  speed: number,
  jitterRange = 0,
  random = Math.random,
): number {
  return Math.max(120, (baseLatency + random() * jitterRange) / speed);
}
