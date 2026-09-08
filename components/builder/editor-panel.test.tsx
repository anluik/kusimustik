import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorPanel } from "@/components/builder/editor-panel";
import { MESSAGES, renderWithIntl } from "@/components/test-support";
import type { SurveyElement } from "@/domain/question";
import type { CreatableElementType } from "@/lib/builder/new-element";
import { createElement } from "@/lib/builder/new-element";

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

const defaults = {
    title: copy.defaults.questionTitle,
    statementTitle: copy.defaults.statementTitle,
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
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
    onDelete = () => {}
}: {
    readonly initial: SurveyElement;
    readonly onDelete?: () => void;
}) {
    const [element, setElement] = useState(initial);

    return (
        <EditorPanel
            selected={element}
            elements={[element]}
            keyPolicy="derive"
            onChange={setElement}
            onDuplicate={() => {}}
            onDelete={onDelete}
        />
    );
}

function renderPanel(type: CreatableElementType, onDelete?: () => void) {
    const element = createElement(type, defaults, []);
    return renderWithIntl(
        <StatefulPanel
            initial={element}
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
