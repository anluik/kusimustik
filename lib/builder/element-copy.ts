import { createTranslator } from "next-intl";

import type { SurveyLocale } from "@/domain/content";
import type { ChoiceList } from "@/domain/localize";
import { APP_TIME_ZONE } from "@/lib/i18n/locales";
import type { ElementCopyMessages } from "@/lib/i18n/messages";
import type { ElementDefaults } from "@/lib/builder/new-element";

/**
 * The words a new element, option, row, column or "other" label is born with,
 * in the language it is being written in.
 *
 * These come out of the owner app's catalogue, but they are not chrome: they
 * are seeds for the *survey document*, and the document has a language of its
 * own. An author writing an Estonian survey from an English-language app was
 * getting "Option 1" and "Other" into their questions, and an author
 * translating into Russian was getting them into the Russian translation. So
 * the language is a parameter here, exactly as it is for the runner's
 * translations (`lib/i18n/runner.ts`), rather than whatever
 * `useTranslations()` happens to be bound to. See docs/DECISIONS.md 032.
 *
 * The messages for all three languages are loaded once on the server and
 * passed down — the subtree is six short strings, and the alternative is a
 * round trip on a keystroke.
 */
export type ElementCopy = ElementDefaults & {
    /** The label carried in when "allow a written answer" is switched on. */
    readonly otherLabel: string;
    /** The label a new entry in one of the three choice lists is born with. */
    readonly newLabel: (list: ChoiceList, index: number) => string;
};

/** The one-namespace catalogue this builds a translator over. */
type Catalogue = { readonly defaults: ElementCopyMessages[SurveyLocale] };

export function elementCopy(
    messages: ElementCopyMessages,
    locale: SurveyLocale
): ElementCopy {
    // Both type arguments, not one: supplying only the messages shape turns
    // off inference for the namespace, which then defaults to `never` and
    // makes every key below an error.
    const t = createTranslator<Catalogue, "defaults">({
        locale,
        messages: { defaults: messages[locale] },
        namespace: "defaults",
        timeZone: APP_TIME_ZONE
    });

    const optionLabel = (index: number) => t("optionLabel", { index });
    const rowLabel = (index: number) => t("rowLabel", { index });
    const columnLabel = (index: number) => t("columnLabel", { index });

    return {
        title: t("questionTitle"),
        statementTitle: t("statementTitle"),
        otherLabel: t("otherLabel"),
        optionLabel,
        rowLabel,
        columnLabel,
        newLabel: (list, index) =>
            list === "options"
                ? optionLabel(index)
                : list === "rows"
                  ? rowLabel(index)
                  : columnLabel(index)
    };
}
