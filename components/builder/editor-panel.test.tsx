import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CollectedAnswersProvider } from "@/components/builder/collected-answers";
import { EditorPanel } from "@/components/builder/editor-panel";
import { TranslationProvider } from "@/components/builder/translation";
import { MESSAGES, renderWithIntl } from "@/components/test-support";
import { authorElement, elementTexts } from "@/domain/localize";
import type { SurveyLocale } from "@/domain/content";
import { elementCopy } from "@/lib/builder/element-copy";
import ruMessages from "@/messages/app/ru.json";
import type { SurveyElement } from "@/domain/question";
import type { CreatableElementType } from "@/lib/builder/new-element";
import { createElement } from "@/lib/builder/new-element";
import type { SurveyKeys } from "@/lib/builder/keys";

/**
 * The builder's editor panel, rendered.
 *
 * Three data-loss incidents in one review session came from this panel: with
 * the editor open as a `Sheet`, its Delete button sat on the pixels the app
 * bar's "add question" button occupies when the sheet is closed, and deleting
 * was immediate — no confirmation, no undo. Both halves of the fix are held
 * here: the destructive action is not in the header any more, and it does not
 * fire until it has been confirmed.
 *
 * These are also the builder's first rendering tests. Every defect the MVP
 * review found was in the rendered UI, which nothing exercised; a component
 * that renders here is a component whose update loops, missing focus and
 * mis-aimed handlers fail a test rather than a person.
 */

const copy = MESSAGES.app.Builder;

const KEYS: SurveyKeys = { policy: "derive", reserved: [] };

const defaults = {
    title: copy.defaults.questionTitle,
    statementTitle: copy.defaults.statementTitle,
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

/**
 * The panel reads the language it is editing from context, so these render it
 * in the survey's own — the case where the projection is the resolution and
 * nothing about the fields differs from before Phase 12. The seed words come
 * from the real catalogue, which is what makes "Muu" appear when the "other"
 * toggle is switched on.
 */
const ELEMENT_COPY = {
    et: copy.defaults,
    en: copy.defaults,
    ru: ruMessages.Builder.defaults
};

/** The label a message key resolves to for the default question. */
function label(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, value),
        template
    );
}

const DELETE_LABEL = label(copy.editor.deleteLabel, {
    title: copy.defaults.questionTitle
});

/**
 * The panel with a document of its own, because the editor is controlled: an
 * option it adds only appears once the parent applies the element it handed
 * back, which is what `useSurveyBuilder` does in the real builder.
 */
function StatefulPanel({
    initial,
    onDelete = () => {},
    collected = 0,
    locale = "et"
}: {
    readonly initial: SurveyElement;
    readonly onDelete?: () => void;
    /** Responses the survey has already taken; 0 is an unpublished draft. */
    readonly collected?: number;
    /** The language the panel is editing; the survey's own is always `et`. */
    readonly locale?: SurveyLocale;
}) {
    const [element, setElement] = useState(initial);

    return (
        <CollectedAnswersProvider count={collected}>
            <TranslationProvider
                locale={locale}
                source="et"
                texts={elementTexts(authorElement(element, "et"))}
                copy={elementCopy(ELEMENT_COPY, locale)}
            >
                <EditorPanel
                    target={{ kind: "element", element }}
                    elements={[element]}
                    keys={{ policy: "derive", reserved: [] }}
                    onChange={setElement}
                    onHeadChange={() => {}}
                    onDuplicate={() => {}}
                    onDelete={onDelete}
                />
            </TranslationProvider>
        </CollectedAnswersProvider>
    );
}

function renderPanel(
    type: CreatableElementType,
    onDelete?: () => void,
    collected = 0
) {
    const element = createElement(type, defaults, [], KEYS);
    return renderWithIntl(
        <StatefulPanel
            initial={element}
            collected={collected}
            {...(onDelete !== undefined && { onDelete })}
        />
    );
}

describe("deleting an element", () => {
    it("is not one of the header's actions", () => {
        const { container } = renderPanel("single_choice");

        // The header is the strip the sheet's own close button overlaps and
        // that the app bar's add button sits on top of. Duplicate may live
        // there — a stray copy is undone by deleting it — but nothing that
        // destroys work may.
        const header = container.querySelector("h2")?.parentElement;
        expect(header).not.toBeNull();
        expect(
            within(header as HTMLElement).queryByRole("button", {
                name: DELETE_LABEL
            })
        ).toBeNull();

        // Still reachable, just not from there.
        expect(
            screen.getByRole("button", { name: DELETE_LABEL })
        ).not.toBeNull();
    });

    it("asks before it deletes", () => {
        const onDelete = vi.fn();
        renderPanel("single_choice", onDelete);

        fireEvent.click(screen.getByRole("button", { name: DELETE_LABEL }));

        expect(onDelete).not.toHaveBeenCalled();
        expect(
            screen.getByText(copy.editor.deleteWarning.title)
        ).not.toBeNull();
    });

    it("deletes once the confirmation is accepted", () => {
        const onDelete = vi.fn();
        renderPanel("single_choice", onDelete);

        fireEvent.click(screen.getByRole("button", { name: DELETE_LABEL }));
        fireEvent.click(
            screen.getByRole("button", {
                name: copy.editor.deleteWarning.confirm
            })
        );

        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("keeps the element when the confirmation is declined", () => {
        const onDelete = vi.fn();
        renderPanel("long_text", onDelete);

        fireEvent.click(screen.getByRole("button", { name: DELETE_LABEL }));
        fireEvent.click(
            screen.getByRole("button", {
                name: copy.editor.deleteWarning.cancel
            })
        );

        expect(onDelete).not.toHaveBeenCalled();
    });
});

describe("adding an option", () => {
    it("puts the caret in the row it created", () => {
        // Typing straight after "add option" used to go nowhere: focus stayed
        // on the button, which made a five-option question fifteen actions.
        renderPanel("single_choice");

        fireEvent.click(
            screen.getByRole("button", { name: copy.editor.addOption })
        );

        const third = screen.getByLabelText(
            label(copy.editor.optionLabel, { index: "3" })
        );
        expect(document.activeElement).toBe(third);
    });

    it("selects the default label, so typing replaces it", () => {
        renderPanel("multi_choice");

        fireEvent.click(
            screen.getByRole("button", { name: copy.editor.addOption })
        );

        const third = screen.getByLabelText(
            label(copy.editor.optionLabel, { index: "3" })
        ) as HTMLInputElement;
        expect([third.selectionStart, third.selectionEnd]).toEqual([
            0,
            third.value.length
        ]);
    });

    it("does not re-steal focus when the editor renders again", () => {
        renderPanel("single_choice");

        fireEvent.click(
            screen.getByRole("button", { name: copy.editor.addOption })
        );

        // Editing the title re-renders the whole panel. The added row must not
        // grab the caret back out of the field being typed into.
        const title = screen.getByLabelText(copy.editor.titleLabel);
        title.focus();
        fireEvent.change(title, { target: { value: "Uus pealkiri" } });

        expect(document.activeElement).toBe(title);
    });
});

/**
 * One editor per type, rendered and edited. A `switch` over the union decides
 * what each editor offers, and none of it was ever mounted in a test — which
 * is how a "Maximum update depth exceeded" could appear in the console during
 * ordinary editing and leave nothing behind to reproduce it with.
 */
describe.each([
    "statement",
    "single_choice",
    "multi_choice",
    "dropdown",
    "short_text",
    "long_text",
    "opinion_scale",
    "nps",
    "matrix_single"
] as const)("the %s editor", type => {
    it("renders, and survives editing its title", () => {
        renderPanel(type);

        const titleLabel =
            type === "statement"
                ? copy.editor.statementLabel
                : copy.editor.titleLabel;
        const title = screen.getByLabelText(titleLabel) as HTMLInputElement;

        fireEvent.change(title, { target: { value: "Kui rahul oled?" } });
        expect(title.value).toBe("Kui rahul oled?");

        // The key follows the title until the owner overrides it (DECISIONS
        // 014), which is the one piece of derived state in the panel.
        expect(screen.getByText("kui_rahul_oled")).not.toBeNull();
    });
});

/**
 * Removing a choice from a question that has already been answered is silent
 * and permanent: the answer keeps the value it was given, `toCsvCells` keeps
 * writing it out, and no chart can draw it again (`aggregate`'s
 * `unshownCount`). It is also one small button beside a text field that the
 * author is typing in. So on a survey with answers it asks first — and on a
 * draft, where this list is edited most, it must not.
 */
describe("removing a choice", () => {
    const editor = MESSAGES.app.Builder.editor;
    const removeFirst = editor.removeOption.replaceAll("{index}", "1");
    const warning = editor.removeWarning;

    /**
     * A choice question is born with exactly the two options its schema
     * requires, so nothing is removable until a third exists — the control is
     * present but quiet (DESIGN §6). Adding one is therefore part of the
     * arrangement, not part of what is under test.
     */
    function withThreeOptions(
        type: CreatableElementType,
        collected: number
    ): void {
        renderPanel(type, undefined, collected);
        fireEvent.click(screen.getByRole("button", { name: editor.addOption }));
    }

    it("goes straight through on a survey that has collected nothing", () => {
        withThreeOptions("single_choice", 0);

        expect(screen.queryByDisplayValue("Valik 1")).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: removeFirst }));

        expect(screen.queryByDisplayValue("Valik 1")).toBeNull();
    });

    it("asks first once the survey has answers behind it", () => {
        withThreeOptions("single_choice", 30);

        fireEvent.click(screen.getByRole("button", { name: removeFirst }));

        // Nothing has gone yet, and the dialog names the option by its label.
        expect(screen.queryByDisplayValue("Valik 1")).not.toBeNull();
        expect(
            screen.getByText(warning.option.replaceAll("{label}", "Valik 1"))
        ).not.toBeNull();
    });

    it("removes the choice once the warning is accepted", () => {
        withThreeOptions("multi_choice", 30);

        fireEvent.click(screen.getByRole("button", { name: removeFirst }));
        fireEvent.click(screen.getByRole("button", { name: warning.confirm }));

        expect(screen.queryByDisplayValue("Valik 1")).toBeNull();
    });

    it("keeps the choice when the warning is declined", () => {
        withThreeOptions("dropdown", 30);

        fireEvent.click(screen.getByRole("button", { name: removeFirst }));
        fireEvent.click(screen.getByRole("button", { name: warning.cancel }));

        expect(screen.queryByDisplayValue("Valik 1")).not.toBeNull();
    });

    it("guards a matrix's rows and columns too, each by its own name", () => {
        renderPanel("matrix_single", undefined, 30);

        fireEvent.click(
            screen.getByRole("button", {
                name: editor.removeRow.replaceAll("{index}", "1")
            })
        );
        expect(
            screen.getByText(warning.row.replaceAll("{label}", "Rida 1"))
        ).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: warning.cancel }));

        fireEvent.click(
            screen.getByRole("button", {
                name: editor.removeColumn.replaceAll("{index}", "1")
            })
        );
        expect(
            screen.getByText(warning.column.replaceAll("{label}", "Veerg 1"))
        ).not.toBeNull();
    });
});

/**
 * The words the panel *writes* — the label that comes in with the "other"
 * toggle, the label a new option is born with — are survey content, so they
 * follow the language being edited. They used to follow the language the owner
 * was reading the app in, which put "Muu" into a Russian translation of a
 * survey written by someone using the app in Estonian. See docs/DECISIONS.md
 * 032.
 */
describe("the words the panel seeds", () => {
    const editor = MESSAGES.app.Builder.editor;

    const seedIn = (locale: SurveyLocale) =>
        renderWithIntl(
            <StatefulPanel
                initial={createElement("single_choice", defaults, [], KEYS)}
                locale={locale}
            />
        );

    it("carries in the other-label in the language being edited", () => {
        seedIn("ru");
        fireEvent.click(screen.getByLabelText(editor.allowOtherLabel));

        expect(
            screen.queryByDisplayValue(ruMessages.Builder.defaults.otherLabel)
        ).not.toBeNull();
    });

    it("still uses the survey's own language when nothing is being translated", () => {
        seedIn("et");
        fireEvent.click(screen.getByLabelText(editor.allowOtherLabel));

        expect(
            screen.queryByDisplayValue(copy.defaults.otherLabel)
        ).not.toBeNull();
    });

    it("names a new option in the language being edited", () => {
        seedIn("ru");
        fireEvent.click(screen.getByRole("button", { name: editor.addOption }));

        expect(
            screen.queryByDisplayValue(
                ruMessages.Builder.defaults.optionLabel.replace("{index}", "3")
            )
        ).not.toBeNull();
    });
});
