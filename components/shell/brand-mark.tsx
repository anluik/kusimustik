import { cn } from "@/lib/utils";

/**
 * The product's mark: a sheet with two written lines and a ticked third.
 *
 * Drawn rather than imported. It is the one piece of the interface that is not
 * a token or a primitive, it is needed at 20px in the sidebar and at 40px on
 * the sign-in page, and at those sizes an icon-library glyph either loses its
 * detail or brings a second stroke weight into the app (§11).
 *
 * The sheet is the current text colour and the marks are punched out of it in
 * the surface colour, so the mark inherits from wherever it sits and needs no
 * colour of its own.
 */
export function BrandMark({
    className,
    surface = "var(--primary-foreground)"
}: {
    readonly className?: string;
    /** The colour the marks are punched out in. */
    readonly surface?: string;
}) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden
            focusable="false"
            className={cn("size-5 shrink-0", className)}
        >
            <rect
                x="3.25"
                y="2.5"
                width="17.5"
                height="19"
                rx="5.5"
                fill="currentColor"
            />
            <path
                d="M8 9h8M8 13h4.5"
                stroke={surface}
                strokeWidth="1.6"
                strokeLinecap="round"
            />
            <path
                d="M8 17.1l1.9 1.9L14 15"
                stroke={surface}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
