import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import appMessages from "@/messages/app/et.json";
import runnerMessages from "@/messages/runner/et.json";
import { APP_TIME_ZONE, DEFAULT_LOCALE } from "@/lib/i18n/locales";

/**
 * Rendering owner and runner components in jsdom.
 *
 * Both catalogues are provided at once, exactly as `next-intl.d.ts` types
 * them: the namespaces are disjoint (asserted in `lib/i18n/messages.test.ts`),
 * so one provider serves both surfaces and a component that names a key from
 * the wrong catalogue still fails the way it would in production.
 *
 * Estonian, because Estonian is the source of truth: a test that reads copy
 * off the screen is then reading the wording an owner actually sees.
 */
export function renderWithIntl(ui: ReactElement): RenderResult {
    return render(
        <NextIntlClientProvider
            locale={DEFAULT_LOCALE}
            timeZone={APP_TIME_ZONE}
            messages={{ ...appMessages, ...runnerMessages }}
        >
            {ui}
        </NextIntlClientProvider>
    );
}

/** The Estonian catalogues, for tests that assert on exact copy. */
export const MESSAGES = {
    app: appMessages,
    runner: runnerMessages
} as const;
