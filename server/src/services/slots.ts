import type { PostingSlot } from '../domain/types.ts';

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const c = wallClock(instant, timeZone);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Converts a local wall-clock time to an instant. Times skipped by DST move forward. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** All slot instants in (from, from + days], ascending. */
export function enumerateSlots(from: Date, days: number, slots: readonly PostingSlot[], timeZone: string): Date[] {
  const start = wallClock(from, timeZone);
  const found = new Set<number>();
  // One extra calendar day covers the partial day at the end of the window.
  for (let offset = 0; offset <= days; offset += 1) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    for (const slot of slots) {
      if (!slot.days.includes(date.getUTCDay())) continue;
      const [hour, minute] = slot.time.split(':').map(Number) as [number, number];
      const instant = zonedTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, timeZone);
      if (instant.getTime() > from.getTime() && instant.getTime() <= from.getTime() + days * 86_400_000) {
        found.add(instant.getTime());
      }
    }
  }
  return [...found].sort((a, b) => a - b).map((ms) => new Date(ms));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
