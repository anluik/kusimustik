import { describe, expect, it } from "vitest";

import { ROUTES, isPublicPath, safeReturnPath } from "@/lib/routes";

describe("isPublicPath", () => {
    it.each(["/login", "/auth/callback", "/k/maine26", "/k"])(
        "lets %s through without a session",
        path => {
            expect(isPublicPath(path)).toBe(true);
        }
    );

    it.each(["/", "/surveys", "/settings", "/surveys/abc/results"])(
        "protects %s",
        path => {
            expect(isPublicPath(path)).toBe(false);
        }
    );

    it("does not treat a prefix collision as public", () => {
        // `/kanalid` starts with `/k` but is not the runner.
        expect(isPublicPath("/kanalid")).toBe(false);
        expect(isPublicPath("/loginish")).toBe(false);
    });
});

describe("safeReturnPath", () => {
    it("keeps an owner path", () => {
        expect(safeReturnPath("/surveys/abc")).toBe("/surveys/abc");
    });

    it.each([
        "//evil.example",
        "https://evil.example",
        "http://evil.example/x",
        "evil.example",
        "",
        null,
        undefined
    ])("refuses %s", candidate => {
        expect(safeReturnPath(candidate)).toBe(ROUTES.surveys);
    });

    it("refuses to bounce back to a public page", () => {
        // Returning to /login after signing in would look like a failed login.
        expect(safeReturnPath("/login")).toBe(ROUTES.surveys);
        expect(safeReturnPath("/k/maine26")).toBe(ROUTES.surveys);
    });
});
