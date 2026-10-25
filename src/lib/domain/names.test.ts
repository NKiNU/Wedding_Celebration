import { describe, expect, it } from "vitest";
import { nameProblem, normalizeName, suggestNames } from "./names";

describe("normalizeName", () => {
  it("trims and collapses runs of whitespace", () => {
    expect(normalizeName("  Aina \t  from\nKajang ")).toBe("Aina from Kajang");
  });

  it("drops control and invisible format characters that could fake a name", () => {
    expect(normalizeName("Al​i‮")).toBe("Ali");
  });

  it("drops invisible fillers so a blank-looking name stays blank", () => {
    expect(normalizeName("ㅤㅤ")).toBe("");
    expect(nameProblem(normalizeName("ㅤㅤ"))).not.toBeNull();
  });

  it("folds look-alike widths so a full-width name cannot pose as a plain one", () => {
    expect(normalizeName("Ａｌｉ")).toBe("Ali");
  });

  it("composes accents so the same name always compares equal", () => {
    expect(normalizeName("José")).toBe("José");
  });
});

describe("nameProblem", () => {
  it("accepts 2 to 24 characters", () => {
    expect(nameProblem("Al")).toBeNull();
    expect(nameProblem("a".repeat(24))).toBeNull();
  });

  it("rejects names that are too short", () => {
    expect(nameProblem("A")).toBe("Please enter at least 2 characters.");
    expect(nameProblem("")).toBe("Please enter at least 2 characters.");
  });

  it("rejects names that are too long", () => {
    expect(nameProblem("a".repeat(25))).toBe("Names can be up to 24 characters.");
  });

  it("counts an emoji as one character, not two", () => {
    expect(nameProblem("😀".repeat(24))).toBeNull();
    expect(nameProblem("😀".repeat(25))).toBe("Names can be up to 24 characters.");
  });
});

describe("suggestNames", () => {
  it("offers the number and the family variant first", () => {
    expect(suggestNames("Ali", new Set())).toEqual(["Ali 2", "Ali & family"]);
  });

  it("skips suggestions that are already taken, ignoring case", () => {
    expect(suggestNames("Ali", new Set(["ali 2"]))).toEqual(["Ali & family", "Ali 3"]);
  });

  it("skips suggestions that would be longer than a name may be", () => {
    const base = "a".repeat(20);
    expect(suggestNames(base, new Set())).toEqual([`${base} 2`, `${base} 3`]);
  });

  it("returns fewer than two when the name leaves no room", () => {
    expect(suggestNames("a".repeat(24), new Set())).toEqual([]);
  });
});
