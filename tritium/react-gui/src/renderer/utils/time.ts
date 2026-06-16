/**
 * @file utils/time.ts
 * @description Time formatting utilities for the application.
 */

/**
 * Returns the current local time as a zero-padded "HH:MM:SS" string.
 *
 * @example
 * // At 09:04:07 local time:
 * nowTimestamp(); // -> "09:04:07"
 *
 * @returns A string in the format "HH:MM:SS".
 */
export const nowTimestamp = (): string => {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

/**
 * Formats an arbitrary Date object as a zero-padded "HH:MM:SS" string.
 * Useful for deterministic testing without mocking `Date`.
 *
 * @param date - The Date to format.
 * @returns A string in the format "HH:MM:SS".
 */
export const formatTimestamp = (date: Date): string =>
  [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
