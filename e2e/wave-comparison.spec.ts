import { expect, test } from "@playwright/test";

import { OWNER_STATE } from "./support";

/**
 * Wave comparison, end to end: the seeded 2025 and 2026 waves, reached the way
 * an owner reaches them.
 *
 * The entry point is the survey list, which has grouped waves since Phase 4 and
 * deliberately had no compare control until there was something behind it
 * (docs/DECISIONS.md 013). This spec is the proof that the control, the route
 * and the screen line up — and that the join reaches the screen, not just the
 * repository: the card is titled with the 2026 wording of a question the two
 * waves word differently, which only lines up because they share a key.
 */

test.use({ storageState: OWNER_STATE });

/** Desktop only: the compare control's label is hidden below `sm`. */
test.skip(({ isMobile }) => isMobile === true, "an owner-desktop surface");

test("compares the seeded waves from the survey list", async ({ page }) => {
    await page.goto("/surveys");

    await page.getByRole("link", { name: "Võrdle" }).click();
    await page.waitForURL(/\/waves\/[0-9a-f-]{36}$/);

    // Both waves are the series, named by their labels, each linking to its
    // own results.
    await expect(page.getByRole("link", { name: /2025/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /2026/ })).toBeVisible();
    await expect(page.getByText("60 vastust kokku")).toBeVisible();

    // The 2026 wording of a question the 2025 wave words differently: the two
    // are one card because they share the key `satisfaction`.
    await expect(
        page.getByRole("heading", {
            name: "Kui rahul olete meie teenusega sel aastal?"
        })
    ).toBeVisible();

    // Eight answerable questions; the statement block gets no card.
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(8);
});

test("offers the line encoding a single wave never had", async ({ page }) => {
    await page.goto("/surveys");
    await page.getByRole("link", { name: "Võrdle" }).click();
    await page.waitForURL(/\/waves\/[0-9a-f-]{36}$/);

    // `line` has been in `CHART_KINDS` since Phase 7 with no call site — a
    // series is what turns it on (DECISIONS 017), so it is on this screen and
    // on no other.
    const nps = page
        .locator("[id='question-recommend']")
        .filter({ hasText: "NPS" });
    await nps.getByRole("tab", { name: "Joon" }).click();

    await expect(nps.locator("svg")).toBeVisible();
});
