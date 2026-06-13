/**
 * Unit tests for the h3-kit `TimeField` ms <-> time-string conversion
 * (the UXP `timeedit` migration target). Pins the format / parse contract
 * and their round-trip.
 */

import { describe, it, expect } from "vitest";
import { formatMs, parseTime } from "../h3-kit/form/TimeField";

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
