import { expect, test } from "@playwright/test";

import { OWNER_STATE, SEED_SURVEY_ID, serviceDb } from "./support";

/**
 * The live response count on the results page.
 *
 * This is the one thing on the owner's screen that is not a server render, and
 * it was broken for as long as it had existed: the channel joined before the
 * browser client had resolved its session from cookies, so Realtime saw `anon`
 * — which cannot read `responses` — and refused the subscription. The hook
 * swallowed the failure by design, so the page looked exactly like a survey
 * nobody was answering. Nothing here can be asserted from a unit test: it
 * needs a real socket, a real session and a real INSERT.
 *
 * The insert goes in through the secret key rather than through the runner,
 * because the runner's own submission is already covered and this test is
 * about what the *owner's* page does when a row lands.
 */

test.use({ storageState: OWNER_STATE });

/**
 * Desktop only. The two projects run in parallel against one seeded survey,
 * and this spec asserts the figure reaches exactly one more than it read — two
 * workers inserting at once could take it from 30 to 32 without ever showing
 * 31. The results page is not a phone-specific surface, so the second run
 * would buy nothing to pay for that with.
 */
test.skip(
    ({ isMobile }) => isMobile === true,
    "one project, so the seeded count moves by exactly one"
);

/** The response this run added, removed again in `afterEach`. */
let added: string | null = null;

test.afterEach(async () => {
    // `lib/db/seed.db.test.ts` asserts on the seed's exact distributions, so a
    // run of this spec has to leave it as it found it — the same contract
    // `runner.spec.ts` keeps.
    if (added === null) return;
    await serviceDb().from("responses").delete().eq("id", added);
    added = null;
});

test("the response count moves when a submission lands, without a reload", async ({
    page
}) => {
    /**
     * The insert has to come *after* the channel is listening, or a pass would
     * mean nothing — and waiting a fixed second or two is a race against a
     * cold dev-server compile. Realtime announces the subscription on the
     * socket, so that announcement is the signal to wait for. It is also the
     * frame the broken version never got: a refused subscription fails here,
     * with the server's own reason in the timeout, rather than as a number
     * that quietly never moves.
     */
    const subscribed = new Promise<void>(resolve => {
        page.on("websocket", socket => {
            if (!socket.url().includes("/realtime/")) return;
            socket.on("framereceived", frame => {
                if (String(frame.payload).includes("Subscribed to PostgreSQL"))
                    resolve();
            });
        });
    });

    await page.goto(`/surveys/${SEED_SURVEY_ID}/results`);

    // `StatCard` renders label, value and hint as siblings, so the figure is
    // the paragraph that follows the label the response count carries.
    const label = page.getByText("Vastuseid", { exact: true });
    await expect(label).toBeVisible();
    const figure = label.locator("xpath=../following-sibling::p[1]");

    const before = Number((await figure.innerText()).replace(/\D/g, ""));
    expect(before).toBeGreaterThan(0);

    await subscribed;

    const { data, error } = await serviceDb()
        .from("responses")
        .insert({
            survey_id: SEED_SURVEY_ID,
            survey_version: 1,
            locale: "et"
        })
        .select("id")
        .single();
    expect(error).toBeNull();
    added = data?.id ?? null;

    // No reload, no navigation: the number has to arrive over the socket.
    await expect(figure).toHaveText(String(before + 1), { timeout: 15_000 });
});
