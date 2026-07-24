import { describe, expect, it } from "vitest";
import { normalizeMemoryListLimit } from "../convex/memoryRecordLimits.js";

describe("normalizeMemoryListLimit", () => {
  it("truncates fractional limits before applying the cap", () => {
    expect(normalizeMemoryListLimit(10.5, 5_000)).toBe(10);
    expect(normalizeMemoryListLimit(0.9, 5_000)).toBe(0);
  });

  it("preserves the default and clamps out-of-range values", () => {
    expect(normalizeMemoryListLimit(undefined, 5_000)).toBe(100);
    expect(normalizeMemoryListLimit(-1, 5_000)).toBe(0);
    expect(normalizeMemoryListLimit(Number.POSITIVE_INFINITY, 5_000)).toBe(5_000);
    expect(normalizeMemoryListLimit(Number.NaN, 5_000)).toBe(0);
  });
});
