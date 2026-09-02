/**
 * @file __test__/timeMath.test.ts
 * @description Unit tests for the `TimeField` arithmetic: the ms <-> string
 * conversion (the UXP `timeedit` contract, unchanged from the pre-segment
 * field) and the segment model built on it -- split / join with carry, which
 * segments are shown, per-unit steps and modifiers, digit overwrite, segment
 * navigation, and the nearest-segment hit test.
 */

import { describe, it, expect } from "vitest";
import {
  UNIT_MS,
  formatMs,
  joinParts,
  modifierOf,
  neighborUnit,
  parseTime,
  parseTimeInput,
  resolveUnit,
  segmentAtX,
  segmentText,
  separatorBefore,
  splitMs,
  stepMs,
  stepValue,
  visibleUnits,
  withSegmentDigits,
} from "@renderer/h3-kit/form/TimeField/timeMath";
import type { TimeUnit } from "@renderer/h3-kit/form/TimeField/timeMath";

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

describe("TimeField segments: split / join", () => {
  it("splits into h / m / s / ms and joins back", () => {
    expect(splitMs(3661500)).toEqual({ h: 1, m: 1, s: 1, ms: 500 });
    expect(splitMs(0)).toEqual({ h: 0, m: 0, s: 0, ms: 0 });
    expect(joinParts(splitMs(3661500))).toBe(3661500);
    expect(splitMs(-5)).toEqual({ h: 0, m: 0, s: 0, ms: 0 });
    expect(splitMs(1500.7).ms).toBe(501);
  });

  it("carries an overflowing segment on join", () => {
    expect(joinParts({ h: 0, m: 0, s: 75, ms: 0 })).toBe(75000); // 1:15
    expect(formatMs(joinParts({ h: 0, m: 75, s: 0, ms: 0 }))).toBe("1:15:00.000");
  });

  it("shows hours from exactly one hour on", () => {
    expect(visibleUnits(UNIT_MS.h - 1)).toEqual(["m", "s", "ms"]);
    expect(visibleUnits(UNIT_MS.h)).toEqual(["h", "m", "s", "ms"]);
  });

  it("segment texts joined by their separators read as formatMs", () => {
    for (const ms of [0, 500, 90500, 600000, 3661500, 36000000]) {
      const units = visibleUnits(ms);
      const parts = splitMs(ms);
      const text = units
        .map((u, i) => (i > 0 ? separatorBefore(u) : "") + segmentText(u, parts, units))
        .join("");
      expect(text).toBe(formatMs(ms));
    }
  });
});

describe("TimeField segments: steps and modifiers", () => {
  it("steps by the unit, a tenth of it with Shift (min 1 ms), ten times with Ctrl", () => {
    expect(stepMs("h", "normal")).toBe(3_600_000);
    expect(stepMs("h", "fine")).toBe(360_000);
    expect(stepMs("h", "coarse")).toBe(36_000_000);
    expect(stepMs("m", "normal")).toBe(60_000);
    expect(stepMs("m", "fine")).toBe(6_000);
    expect(stepMs("m", "coarse")).toBe(600_000);
    expect(stepMs("s", "normal")).toBe(1_000);
    expect(stepMs("s", "fine")).toBe(100);
    expect(stepMs("s", "coarse")).toBe(10_000);
    expect(stepMs("ms", "normal")).toBe(1);
    expect(stepMs("ms", "fine")).toBe(1); // floor: never below 1 ms
    expect(stepMs("ms", "coarse")).toBe(10);
  });

  it("reads Shift as fine and Ctrl / Cmd as coarse, Shift winning", () => {
    const ev = (o: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }>) => ({
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      ...o,
    });
    expect(modifierOf(ev({}))).toBe("normal");
    expect(modifierOf(ev({ shiftKey: true }))).toBe("fine");
    expect(modifierOf(ev({ ctrlKey: true }))).toBe("coarse");
    expect(modifierOf(ev({ metaKey: true }))).toBe("coarse");
    expect(modifierOf(ev({ shiftKey: true, ctrlKey: true }))).toBe("fine");
  });

  it("stepValue moves one segment, keeps the others, and clamps", () => {
    expect(stepValue(2345, "s", 1, "normal", 0, Infinity)).toBe(3345);
    expect(stepValue(2345, "m", -1, "normal", 0, Infinity)).toBe(0); // clamp at min
    expect(stepValue(2345, "ms", 1, "coarse", 0, 2350)).toBe(2350); // clamp at max
    expect(stepValue(2345, "s", 1, "fine", 0, Infinity)).toBe(2445);
  });
});

describe("TimeField segments: digits and navigation", () => {
  it("withSegmentDigits overwrites one segment, carries, and clamps", () => {
    expect(withSegmentDigits(1500, "s", "7", 0, Infinity)).toBe(7500);
    expect(withSegmentDigits(1500, "s", "75", 0, Infinity)).toBe(75500); // 1:15.500
    expect(withSegmentDigits(1500, "ms", "5", 0, Infinity)).toBe(1005);
    expect(withSegmentDigits(1500, "s", "", 0, Infinity)).toBe(500); // Backspace
    expect(withSegmentDigits(1500, "s", "9", 0, 5000)).toBe(5000);
  });

  it("neighborUnit stops at the ends and resolveUnit falls back downward", () => {
    const three: TimeUnit[] = ["m", "s", "ms"];
    expect(neighborUnit(three, "s", 1)).toBe("ms");
    expect(neighborUnit(three, "ms", 1)).toBe("ms");
    expect(neighborUnit(three, "m", -1)).toBe("m");
    expect(resolveUnit(three, "h")).toBe("m");
    expect(resolveUnit(three, "s")).toBe("s");
  });

  it("segmentAtX picks the nearest centre (separators, padding, outside)", () => {
    const rects = [
      { unit: "m" as const, left: 0, right: 20 },
      { unit: "s" as const, left: 30, right: 50 },
      { unit: "ms" as const, left: 60, right: 90 },
    ];
    expect(segmentAtX(rects, 25)).toBe("m"); // on the separator, nearer m (10 vs 40)
    expect(segmentAtX(rects, 55)).toBe("s");
    expect(segmentAtX(rects, -100)).toBe("m");
    expect(segmentAtX(rects, 1000)).toBe("ms");
    expect(segmentAtX([], 10)).toBeNull();
  });
});
