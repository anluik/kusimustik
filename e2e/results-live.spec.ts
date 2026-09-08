import { expect, test } from "@playwright/test";

import {
    OWNER_STATE,
    createFixtureSurvey,
    deleteFixtureSurvey,
    oneTextQuestion,
    serviceDb
} from "./support";

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
 *
 * On a survey of its own, because the assertion is an exact figure and the
 * seed is shared: `runner.spec.ts` submits to it from two projects at once,
 * and a count that jumps from 30 to 32 never shows the 31 this waits for.
 */

test.use({ storageState: OWNER_STATE });

/** The survey this run built, deleted again with its responses. */
let surveyId: string | null = null;

test.afterEach(async () => {
    if (surveyId === null) return;
    await deleteFixtureSurvey(surveyId);
    surveyId = null;
});

test("the response count moves when a submission lands, without a reload", async ({
    page
}, testInfo) => {
    surveyId = await createFixtureSurvey({
        title: "Elav loendur",
        slug: `elav-loendur-${testInfo.project.name}`,
        elements: oneTextQuestion()
    });
    // One response already in, so the figure has somewhere to count from and
    // the assertion is about movement rather than about the first row.
    await serviceDb()
        .from("responses")
        .insert({ survey_id: surveyId, survey_version: 1, locale: "et" });

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

    await page.goto(`/surveys/${surveyId}/results`);

    // `StatCard` renders label, value and hint as siblings, so the figure is
    // the paragraph that follows the label the response count carries.
    const label = page.getByText("Vastuseid", { exact: true });
    await expect(label).toBeVisible();
    const figure = label.locator("xpath=../following-sibling::p[1]");

    const before = Number((await figure.innerText()).replace(/\D/g, ""));
    expect(before).toBeGreaterThan(0);

    await subscribed;

    const { error } = await serviceDb().from("responses").insert({
        survey_id: surveyId,
        survey_version: 1,
        locale: "et"
    });
    expect(error).toBeNull();

    // No reload, no navigation: the number has to arrive over the socket.
    await expect(figure).toHaveText(String(before + 1), { timeout: 15_000 });
});
