import { describe, expect, it } from "vitest";
import { budgetToPriceLevels } from "../src/utils/budget";

describe("budgetToPriceLevels", () => {
  it("maps budget-ish text to $ only", () => {
    expect(budgetToPriceLevels("budget")).toEqual(["$"]);
    expect(budgetToPriceLevels("cheap")).toEqual(["$"]);
  });

  it("maps moderate-ish text to $ and $$", () => {
    expect(budgetToPriceLevels("moderate")).toEqual(["$", "$$"]);
  });

  it("maps luxury-ish text to $$$ and $$$$", () => {
    expect(budgetToPriceLevels("luxury")).toEqual(["$$$", "$$$$"]);
  });

  it("returns null for unrecognized, empty, or non-string input", () => {
    expect(budgetToPriceLevels("whatever")).toBeNull();
    expect(budgetToPriceLevels("")).toBeNull();
    expect(budgetToPriceLevels(undefined)).toBeNull();
    expect(budgetToPriceLevels(42)).toBeNull();
  });
});
