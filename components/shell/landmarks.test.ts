import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One `main` per document.
 *
 * `SidebarInset` renders a `<main>`, so every owner page that reached for one
 * of its own was nesting a landmark inside a landmark — invalid HTML, and a
 * screen reader is entitled to do anything it likes with the second one. This
 * is not something a component test can see, because the offending pair is
 * split across a layout and a page that are rendered by the router.
 *
 * So it is checked as a property of the source: `<main>` may only appear in
 * the files below, each of which owns one document's landmark. Adding one
 * anywhere else fails here, with this list as the explanation.
 */

const ROOTS = ["app", "components"] as const;

const OWNS_A_LANDMARK: Readonly<Record<string, string>> = {
    // The `(app)` shell. Every owner page renders inside this one.
    "components/ui/sidebar.tsx": "SidebarInset",
    // The signed-out shell, which has no sidebar to inherit one from.
    "app/(auth)/layout.tsx": "the sign-in card's wrapper",
    // The runner's two mutually exclusive screens: the survey itself, and the
    // terminal notices that replace it.
    "components/runner/runner-screen.tsx": "the runner",
    "components/runner/runner-notice.tsx": "thanks, closed, not found, failed",
    // Their own documents: neither renders inside any layout.
    "app/global-error.tsx": "the root error page",
    "app/global-not-found.tsx": "the 404"
};

function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap(entry => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return path.endsWith(".tsx") ? [path] : [];
    });
}

describe("document landmarks", () => {
    const rendersMain = ROOTS.flatMap(root => sourceFiles(root))
        .filter(path => /<main[\s>]/.test(readFileSync(path, "utf8")))
        .map(path => relative(".", path).split(sep).join("/"))
        .sort();

    it("are rendered by exactly the files that own one", () => {
        // Both directions on purpose: a new `<main>` fails, and so does an
        // entry left behind by a file that no longer renders one — which
        // would otherwise sit here looking like permission.
        expect(rendersMain).toEqual(Object.keys(OWNS_A_LANDMARK).sort());
    });
});
