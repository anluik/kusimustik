import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

// Phase 0 smoke test: proves tsc -> eslint -> vitest actually runs end to end.
describe("cn", () => {
  it("merges conflicting Tailwind classes, last one winning", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy conditional classes", () => {
    expect(cn("rounded", false && "hidden", undefined)).toBe("rounded");
  });
});
