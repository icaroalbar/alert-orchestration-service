export type Clock = () => Date;

export function nowIso(clock: Clock = () => new Date()): string {
  return clock().toISOString();
}
