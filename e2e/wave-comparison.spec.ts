import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { OWNER_STATE, serviceDb } from "./support";

/**
 * Wave comparison, end to end, as the owner reaches it: from the survey list's
 * compare control to a group's saved comparisons, and from there into one
 * (docs/DECISIONS.md 035).
 *
 * The seeded comparison is read and never edited — both Playwright projects
 * and the db suite rely on it. The spec that edits builds its own comparison
 * over the seeded waves and deletes it afterwards.
 */

test.use({ storageState: OWNER_STATE });

/** Desktop only: the matching editor's column heads are a desktop layout. */
test.skip(({ isMobile }) => isMobile === true, "an owner-desktop surface");

/** From supabase/seed.sql: the seeded comparison's NPS row. */
const NPS_ROW = "30000000-0000-4000-8000-000000000008";

/**
 * Opens the seeded survey's wave group, by its own row.
 *
 * Scoped to the row on purpose: the seed has two wave groups, so a bare
 * compare control is ambiguous. It used to match nothing at all instead —
 * the control rendered its label twice, once visible and once `sr-only`, so
 * its accessible name was "VõrdleVõrdle" and both specs here failed. The
 * label is now `aria-label` plus one visible span, and this locator says
 * which group it means.
 */
async function openGroup(page: Page): Promise<void> {
    await page.goto("/surveys");
    await page
        .getByRole("row", { name: /Teenuse rahulolu/ })
        .getByRole("link", { name: "Võrdle" })
        .click();
    await page.waitForURL(/\/waves\/[0-9a-f-]{36}$/);
}

test("reads the seeded comparison from the survey list", async ({ page }) => {
    await openGroup(page);

    // Exact: the spec below builds comparisons over the same waves, and a
    // prefix match would also find "2025 – 2026 2" — including one left
    // behind by a run that failed before its cleanup.
    await page.getByRole("link", { name: "2025 – 2026", exact: true }).click();
    await page.waitForURL(/\/comparisons\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("link", { name: /2025/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /2026/ })).toBeVisible();
    await expect(page.getByText("60 vastust kokku")).toBeVisible();

    // A question the two waves word differently is one card, because the
    // owner's saved row says so — titled with the newer wording.
    await expect(
        page.getByRole("heading", {
            name: "Kui rahul olete meie teenusega sel aastal?"
        })
    ).toBeVisible();

    // Eight rows; the statement block gets no card.
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(8);

    // `line` is offered to a series and to nothing else (DECISIONS 017).
    const nps = page.locator(`[id='row-${NPS_ROW}']`);
    await nps.getByRole("tab", { name: "Joon" }).click();
    await expect(nps.locator("svg")).toBeVisible();
});

test.describe("a comparison the owner builds", () => {
    const name = `E2E ${crypto.randomUUID().slice(0, 8)}`;

    test.afterAll(async () => {
        await serviceDb().from("wave_comparisons").delete().eq("name", name);
    });

    test("is suggested, reviewed, edited and saved", async ({ page }) => {
        await openGroup(page);

        await page.getByRole("button", { name: "Uus võrdlus" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Nimi").fill(name);
        await dialog.getByRole("button", { name: "Loo võrdlus" }).click();
        await page.waitForURL(/\/comparisons\/[0-9a-f-]{36}$/);

        // Every question was copied from 2025 to 2026, so every one starts
        // out matched.
        await page.getByRole("link", { name: "Muuda vasteid" }).click();
        await page.waitForURL(/\/matches$/);

        const status = page.getByRole("status").filter({ hasText: /salvesta/ });
        const saved = async () => {
            await expect(status).toContainText("salvestamata");
            await expect(status).toContainText(/salvestatud$/, {
                timeout: 10_000
            });
        };

        const rows = page.getByRole("group", { name: /^Rida \d+$/ });
        await expect(rows).toHaveCount(8);

        // A question of another type is offered, disabled.
        const role = rows.first();
        await role
            .getByRole("combobox", { name: "Küsimus laines 2025" })
            .click();
        await expect(
            page.getByRole("option", { name: /^7\. Kui tõenäoliselt/ })
        ).toHaveAttribute("aria-disabled", "true");
        await page.keyboard.press("Escape");

        // Take the matrix out, then put it back by hand.
        await rows.last().getByRole("button", { name: "Eemalda rida" }).click();
        await expect(rows).toHaveCount(7);
        const unmatched = page
            .getByText("Küsimused, mis pole üheski reas")
            .locator("..");
        await expect(unmatched.getByText("8. Hinnake meie tiimi")).toHaveCount(
            2
        );

        await unmatched
            .getByRole("listitem")
            .filter({ hasText: "Hinnake meie tiimi" })
            .last()
            .getByRole("button", { name: "Lisa reana" })
            .click();
        await expect(rows).toHaveCount(8);
        await rows
            .last()
            .getByRole("combobox", { name: "Küsimus laines 2025" })
            .click();
        await page
            .getByRole("option", { name: /^8\. Hinnake meie tiimi/ })
            .click();
        await saved();

        // It stuck, and the removed match did not come back.
        await page.reload();
        await expect(rows).toHaveCount(8);
        await expect(
            page.getByText("Küsimused, mis pole üheski reas")
        ).toHaveCount(0);

        await page.getByRole("link", { name: "Valmis" }).click();
        await page.waitForURL(/\/comparisons\/[0-9a-f-]{36}$/);
        await expect(page.getByRole("heading", { level: 3 })).toHaveCount(8);
    });
});
