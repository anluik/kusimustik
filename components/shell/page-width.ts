/**
 * How wide an owner page's content is allowed to get.
 *
 * Nothing in the app constrained line length, so on a 3440px monitor the
 * survey list stretched to 3150px and reading a row meant tracking a title at
 * one edge against its status badge at the other. The bar and the content
 * below it share the constant so they stay in one column; the bar's own
 * background still spans the window.
 *
 * The builder is deliberately exempt: it is a three-panel workspace whose
 * panels are sized in `docs/DESIGN.md` §4, and its canvas already caps itself
 * at 640px — the runner's width, because that is what it is previewing.
 */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1280px]";
