/**
 * Unit tests for the h3-kit `TimeField` ms <-> time-string conversion
 * (the UXP `timeedit` migration target). Pins the format / parse contract
 * and their round-trip.
 */

import { describe, it, expect } from "vitest";
import {
  formatMs,
  parseTime,
  parseTimeInput,
  stepUnitAt,
} from "../h3-kit/form/TimeField";

describe("TimeField formatMs", () => {
  it("formats ms as M:SS.mmm with zero-padded seconds / millis", () => {
    expect(formatMs(0)).toBe("0:00.000");
    expect(formatMs(500)).toBe("0:00.500");
    expect(formatMs(1000)).toBe("0:01.000");
    expect(formatMs(90500)).toBe("1:30.500");
    expect(formatMs(600000)).toBe("10:00.000");
  });

  it("adds an hour field past 60 minutes", () => {
    expect(formatMs(3600000)).toBe("1:00:00.000");
    expect(formatMs(3661500)).toBe("1:01:01.500");
  });

  it("clamps negatives and rounds fractional ms", () => {
    expect(formatMs(-5)).toBe("0:00.000");
    expect(formatMs(1500.7)).toBe("0:01.501");
  });
});

describe("TimeField parseTime", () => {
  it("parses S / M:S / H:M:S with a decimal-second fraction", () => {
    expect(parseTime("0:00.000")).toBe(0);
    expect(parseTime("1:30.500")).toBe(90500);
    expect(parseTime("1:30.5")).toBe(90500); // .5 = 500 ms (decimal fraction)
    expect(parseTime("0:10")).toBe(10000);
    expect(parseTime("90")).toBe(90000); // bare seconds
    expect(parseTime("1:01:01.500")).toBe(3661500);
  });

  it("round-trips with formatMs", () => {
    for (const ms of [0, 500, 1000, 90500, 600000, 3661500]) {
      expect(parseTime(formatMs(ms))).toBe(ms);
    }
  });

  it("returns null for malformed input", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("1:2:3:4")).toBeNull(); // too many colon parts
    expect(parseTime("1.2.3")).toBeNull(); // too many dots
    expect(parseTime("1:")).toBeNull(); // empty seconds field
  });
});

describe("TimeField parseTimeInput", () => {
  it("accepts a plain timecode (same as parseTime)", () => {
    expect(parseTimeInput("1:30.500", 0)).toBe(90500);
    expect(parseTimeInput("90", 0)).toBe(90000);
  });

  it("accepts a unit-suffixed number", () => {
    expect(parseTimeInput("250ms", 0)).toBe(250);
    expect(parseTimeInput("1.5s", 0)).toBe(1500);
    expect(parseTimeInput("2sec", 0)).toBe(2000);
    expect(parseTimeInput("2min", 0)).toBe(120000);
    expect(parseTimeInput("1h", 0)).toBe(3600000);
    expect(parseTimeInput("1.5 s", 0)).toBe(1500); // space before the unit
    expect(parseTimeInput("250MS", 0)).toBe(250); // case-insensitive
  });

  it("reads `m` as minutes and `ms` as milliseconds", () => {
    expect(parseTimeInput("2m", 0)).toBe(120000);
    expect(parseTimeInput("2ms", 0)).toBe(2);
  });

  it("offsets from the current value with a leading + / -", () => {
    expect(parseTimeInput("+500ms", 2000)).toBe(2500);
    expect(parseTimeInput("+2s", 1500)).toBe(3500);
    expect(parseTimeInput("-1:00", 90000)).toBe(30000);
    expect(parseTimeInput("- 250ms", 1000)).toBe(750);
  });

  it("keeps the bare-number-is-seconds rule in the relative form", () => {
    // The magnitude grammar is the same absolute or relative: `10` is 10 s in
    // both, so `+10` adds ten seconds (use `+10ms` for milliseconds).
    expect(parseTimeInput("10", 0)).toBe(10000);
    expect(parseTimeInput("+10", 2000)).toBe(12000);
  });

  it("may return a negative offset result (the caller clamps)", () => {
    expect(parseTimeInput("-10s", 2000)).toBe(-8000);
  });

  it("returns null for malformed input and unknown units", () => {
    expect(parseTimeInput("", 0)).toBeNull();
    expect(parseTimeInput("abc", 0)).toBeNull();
    expect(parseTimeInput("5frames", 0)).toBeNull();
    expect(parseTimeInput("+", 1000)).toBeNull();
  });
});

describe("TimeField stepUnitAt", () => {
  // "1:30.500" -- offsets: 0 min, 1 ':', 2-3 sec, 4 '.', 5-7 ms
  it("maps the caret to its segment's unit", () => {
    expect(stepUnitAt("1:30.500", 6)).toBe(100); // inside .mmm -> 100 ms (UXP)
    expect(stepUnitAt("1:30.500", 3)).toBe(1000); // seconds -> 1 s
    expect(stepUnitAt("1:30.500", 0)).toBe(60_000); // minutes -> 1 min
    expect(stepUnitAt("1:01:01.500", 0)).toBe(3_600_000); // hours -> 1 h
  });

  it("falls back to seconds with no caret (nothing / everything selected)", () => {
    expect(stepUnitAt("1:30.500", null)).toBe(1000);
  });

  it("treats a caret past the end as the last segment", () => {
    expect(stepUnitAt("1:30.500", 99)).toBe(100);
    expect(stepUnitAt("1:30", 99)).toBe(1000);
  });
});
