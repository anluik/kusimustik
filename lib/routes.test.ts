import { describe, expect, it } from "vitest";

import { ROUTES, isPublicPath, safeReturnPath } from "@/lib/routes";

describe("isPublicPath", () => {
    it.each(["/login", "/auth/callback", "/k/maine26", "/k", ROUTES.events])(
        "lets %s through without a session",
        path => {
            expect(isPublicPath(path)).toBe(true);
        }
    );

    it.each([
        "/",
        "/surveys",
        "/settings",
        "/surveys/abc/results",
        // The beacon is exempt by endpoint, not by prefix: Phase 8's CSV
        // download lands under /api and belongs to the owner.
        "/api/surveys/abc/export"
    ])("protects %s", path => {
        expect(isPublicPath(path)).toBe(false);
    });

    it("keeps the CSV download behind a session", () => {
        // The one thing that could go wrong quietly: someone adds `/api` to
        // `PUBLIC_PREFIXES` for the beacon's sake and takes the owner's export
        // with it.
        expect(ROUTES.export("abc")).toBe("/api/surveys/abc/export");
        expect(isPublicPath(ROUTES.export("abc"))).toBe(false);
    });

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
