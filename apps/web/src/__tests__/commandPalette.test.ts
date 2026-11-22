import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../CommandPalette";

describe("fuzzyScore", () => {
  it("matches subsequences in order and rejects the rest", () => {
    expect(fuzzyScore("adag", "Add Agent")).toBeGreaterThan(0);
    expect(fuzzyScore("gaad", "Add Agent")).toBe(-1);
  });

  it("ranks word-start and consecutive matches higher", () => {
    expect(fuzzyScore("agent", "Add Agent")).toBeGreaterThan(fuzzyScore("agent", "Add Management Tool"));
  });

  it("is case-insensitive and ignores spaces in the query", () => {
    expect(fuzzyScore("ADD AG", "add agent")).toBeGreaterThan(0);
  });

  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("  ", "anything")).toBe(0);
  });
});
