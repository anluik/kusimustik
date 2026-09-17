/**
 * DESIGN.md §6: an error is text-first and local to what failed — never a
 * toast for something the owner has to act on, and never a full-page error for
 * one dialog's failure. It sits inside the dialog that produced it, so the
 * inputs the owner needs to change are still on screen.
 *
 * Takes the sentence rather than a code, so every surface's error catalogue can
 * use it; `ActionError` is the survey list's wrapper.
 */
export function ErrorLine({ message }: { readonly message: string | null }) {
    if (message === null) return null;

    return (
        <p
            role="alert"
            className="flex items-start gap-1.5 text-xs leading-[1.35] text-destructive"
        >
            <span
                aria-hidden
                className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive"
            />
            {message}
        </p>
    );
}
