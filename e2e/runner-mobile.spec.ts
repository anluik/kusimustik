import { expect, test } from "@playwright/test";

import { SEED_SLUG } from "./support";

/**
 * Mobile QA on the runner (docs/PLAN.md Phase 8), written as assertions rather
 * than as a checklist someone has to remember to walk.
 *
 * DESIGN §4 gives the runner a 380px baseline, `min-h 48` option rows and a
 * pinned header and action; §10 puts the floor at 44px and makes the runner
 * the priority surface, because an owner can be asked to use a modern browser
 * and a respondent cannot be asked anything. 320px is checked too — it is the
 * narrowest phone still in use, and the failure there is a page that scrolls
 * sideways, which is the one layout bug a respondent cannot work around.
 */

const SLUG = SEED_SLUG;

/** The baseline, not the device: both projects run this at the same width. */
test.use({ viewport: { width: 380, height: 780 } });

test.describe("the runner on a phone", () => {
    test("never scrolls sideways, at 380 or at 320", async ({ page }) => {
        for (const width of [380, 320]) {
            await page.setViewportSize({ width, height: 780 });
            await page.goto(`/k/${SLUG}`);
            await expect(
                page.getByRole("heading", { name: "Teenuse rahulolu-uuring" })
            ).toBeVisible();

            const overflow = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth
            }));
            expect(
                overflow.scrollWidth,
                `horizontal overflow at ${width}px`
            ).toBeLessThanOrEqual(overflow.clientWidth);
        }
    });

    test("gives every control a thumb-sized target", async ({ page }) => {
        await page.goto(`/k/${SLUG}`);

        // Measured in the page rather than through locators, because a
        // Playwright CSS locator pierces shadow DOM and would otherwise hand
        // us Next.js's own dev-mode indicator to fail on.
        const measured = await page.evaluate(() => {
            // Radios and checkboxes are a visually hidden input inside a
            // label, so what gets measured is the row that is really tapped.
            const controls = [
                ...document.querySelectorAll(
                    "label:has(input), button, select, textarea"
                )
            ].filter(node => node.closest("nextjs-portal") === null);

            const visible = controls
                .map(node => ({ node, box: node.getBoundingClientRect() }))
                .filter(({ box }) => box.width > 0 && box.height > 0);

            return {
                total: visible.length,
                short: visible
                    .filter(({ box }) => box.height < 44)
                    .map(
                        ({ node, box }) =>
                            `${node.tagName.toLowerCase()} "${(
                                node.textContent ?? ""
                            )
                                .trim()
                                .slice(0, 40)}" is ${Math.round(box.height)}px`
                    )
            };
        });

        // The seeded survey has eight questions' worth of controls; a locator
        // that quietly matched nothing would otherwise pass.
        expect(measured.total).toBeGreaterThan(10);
        expect(measured.short, "targets below the 44px floor").toEqual([]);
    });

    test("keeps the progress and the action pinned while answering", async ({
        page
    }) => {
        await page.goto(`/k/${SLUG}`);

        const submit = page.getByRole("button", { name: "Saada vastused" });
        const progress = page.getByRole("progressbar");
        await expect(submit).toBeInViewport();
        await expect(progress).toBeInViewport();

        // Half way down a nine-element survey: both must still be there, or
        // the respondent has to hunt for the way out. Scrolled from the page
        // rather than with the wheel, which mobile WebKit does not have.
        await page.evaluate(() => window.scrollBy(0, 1200));
        await expect(submit).toBeInViewport();
        await expect(progress).toBeInViewport();
    });

    test("shows the answer, the error and the retry without a horizontal jump", async ({
        page
    }) => {
        await page.goto(`/k/${SLUG}`);

        // Submitting an untouched survey is the loudest state the layout has
        // to hold: an alert above the action, and a problem on every required
        // question.
        await page.getByRole("button", { name: "Saada vastused" }).click();
        await expect(page.getByRole("alert").first()).toBeVisible();

        const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
});
