import { describe, expect, it } from "vitest";

import { ROUTES, isPublicPath, safeReturnPath } from "@/lib/routes";

describe("isPublicPath", () => {
    it.each([
        "/login",
        "/auth/callback",
        "/k/maine26",
        "/k",
        ROUTES.events,
        // The landing page and its two translations (docs/DECISIONS.md 038).
        ROUTES.home,
        ROUTES.homeInLocale("en"),
        ROUTES.homeInLocale("ru")
    ])("lets %s through without a session", path => {
        expect(isPublicPath(path)).toBe(true);
    });

    it("matches the landing page whole, never as a prefix", () => {
        // The reason `/` is in `PUBLIC_EXACT` and not `PUBLIC_PREFIXES`: every
        // path in the application starts with it, so a prefix match would make
        // the entire owner app public in one edit and do it silently.
        expect(isPublicPath("/surveys")).toBe(false);
        expect(isPublicPath("/en/surveys")).toBe(false);
    });

    it("lets /et reach the page that redirects it", () => {
        // Estonian has no segment of its own, but the redirect to `/` is the
        // page's job — so the request has to get there rather than being sent
        // to a sign-in form.
        expect(isPublicPath(ROUTES.homeInLocale("et"))).toBe(true);
    });

    it.each([
        "/surveys",
        "/settings",
        "/surveys/abc/results",
        // The wave comparison is the owner's too, and it is protected by
        // being absent from `PUBLIC_PREFIXES` rather than by being listed.
        ROUTES.compare("abc"),
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

    it("sends the CSV download back to the page it is downloaded from", () => {
        // Signing in from an expired session on the export route used to hand
        // the owner a file rather than a screen.
        expect(safeReturnPath(ROUTES.export("abc"))).toBe(
            ROUTES.results("abc")
        );
    });

    it("refuses any other route handler", () => {
        expect(safeReturnPath("/api/events")).toBe(ROUTES.surveys);
        expect(safeReturnPath("/api/surveys/abc/export/extra")).toBe(
            ROUTES.surveys
        );
        expect(safeReturnPath("/api")).toBe(ROUTES.surveys);
    });

    it("refuses to bounce back to a public page", () => {
        // Returning to /login after signing in would look like a failed login.
        expect(safeReturnPath("/login")).toBe(ROUTES.surveys);
        expect(safeReturnPath("/k/maine26")).toBe(ROUTES.surveys);
    });
});
