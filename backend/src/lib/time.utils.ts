// src/lib/time.utils.ts
import { DayOfWeek } from '@prisma/client';

/**
 * Validates if a string is in "HH:MM" format.
 */
export const isValidTimeFormat = (time: string): boolean => {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return false;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

/**
 * Converts "HH:MM" string to minutes since midnight.
 */
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Checks if two time slots overlap.
 * Assumes t1Start < t1End and t2Start < t2End.
 * @param t1Start Start time of slot 1 ("HH:MM")
 * @param t1End End time of slot 1 ("HH:MM")
 * @param t2Start Start time of slot 2 ("HH:MM")
 * @param t2End End time of slot 2 ("HH:MM")
 * @returns true if they overlap, false otherwise.
 */
export const doTimeSlotsOverlap = (
  t1Start: string,
  t1End: string,
  t2Start: string,
  t2End: string
): boolean => {
  const start1 = timeToMinutes(t1Start);
  const end1 = timeToMinutes(t1End);
  const start2 = timeToMinutes(t2Start);
  const end2 = timeToMinutes(t2End);

  // Overlap condition: one slot starts before the other ends,
  // AND the other slot starts before the first one ends.
  // Simplified: Max(start1, start2) < Min(end1, end2)
  return Math.max(start1, start2) < Math.min(end1, end2);
};

/**
 * Gets the DayOfWeek enum value from a Date object.
 * @param date The date to get the day of week from
 * @returns The corresponding DayOfWeek enum value
 */
export const getDayOfWeekFromDate = (date: Date): DayOfWeek => {
  const dayIndex = date.getUTCDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
  const days: DayOfWeek[] = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
  return days[dayIndex];
};