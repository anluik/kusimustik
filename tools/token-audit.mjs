// The design token audit docs/DESIGN.md §1 requires: every value in
// app/globals.css, checked against the contrast and colour-vision floors the
// spec commits to. `pnpm check` runs it, so a token cannot be changed without
// the audit agreeing — which is the whole point of having one.
//
// Usage: node tools/token-audit.mjs [--css]
//   --css prints the two token blocks, snapped into sRGB, for pasting back.

import { readFileSync } from "node:fs";

/** Reads the `--name: value;` pairs out of one block of the stylesheet. */
function tokensOf(css, selector) {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`no ${selector} block in globals.css`);
    const body = css.slice(start, css.indexOf("\n}", start));
    const out = {};
    for (const [, k, v] of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        const value = v.trim();
        // Aliases (`var(--primary)`) and plain numbers are not colours.
        if (value.startsWith("oklch(")) out[k] = value;
    }
    return out;
}

const CSS = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8"
);
const L = tokensOf(CSS, ":root");
const D = tokensOf(CSS, ".dark");

const SNAPPED = [];

// -- oklch -> srgb -------------------------------------------------------------
function parse(s) {
    const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/.exec(s);
    if (!m) throw new Error(`not oklch: ${s}`);
    return { l: +m[1], c: +m[2], h: +m[3] };
}
function toLin({ l, c, h }) {
    const a = c * Math.cos((h * Math.PI) / 180);
    const b = c * Math.sin((h * Math.PI) / 180);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
    ];
}
const enc = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function hex(str) {
    const [r, g, b] = toLin(parse(str)).map(v =>
        Math.round(Math.min(1, Math.max(0, enc(v))) * 255)
    );
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function lum(str) {
    const [r, g, b] = toLin(parse(str)).map(v => Math.min(1, Math.max(0, v)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}
/** Holds L and h, lowers C to the sRGB boundary. Reported, never silent. */
function snap(str) {
    const { l, c, h } = parse(str);
    let cc = c;
    while (cc > 0 && !gamut(`oklch(${l} ${cc.toFixed(3)} ${h})`)) cc -= 0.001;
    const out = `oklch(${l.toFixed(3)} ${cc.toFixed(3)} ${h})`;
    if (cc < c - 0.0005) SNAPPED.push(`${str} -> ${out}`);
    return out;
}
function gamut(str) {
    return toLin(parse(str)).every(v => v > -0.0015 && v < 1.0015);
}

// -- the pairs the spec pins ---------------------------------------------------
const TEXT = [
    ["foreground", "background"],
    ["foreground", "card"],
    ["foreground", "muted"],
    ["card-foreground", "card"],
    ["popover-foreground", "popover"],
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["muted-foreground", "muted"],
    ["secondary-foreground", "secondary"],
    ["primary", "background"],
    ["primary", "card"],
    ["primary-foreground", "primary"],
    ["accent-foreground", "accent"],
    ["destructive", "background"],
    ["destructive", "card"],
    ["destructive-foreground", "destructive"],
    ["sidebar-foreground", "sidebar"],
    ["sidebar-accent-foreground", "sidebar-accent"],
    ["foreground", "sidebar-accent"]
];
// Non-text UI: 3:1. Input borders included (§10).
const UI = [
    ["input", "card"],
    ["input", "background"],
    ["ring", "background"],
    ["ring", "card"],
    ["primary", "muted"],
    ["destructive", "muted"]
];
const CHART = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];
const RAMP = [1, 2, 3, 4, 5, 6, 7].map(n => `ramp-${n}`);

function audit(name, T) {
    const out = [];
    let fails = 0;
    const row = (label, got, min) => {
        const ok = got >= min;
        if (!ok) fails++;
        out.push(
            `${ok ? "  ok " : "FAIL "}${label.padEnd(46)} ${got.toFixed(2)} (min ${min})`
        );
    };
    for (const [a, b] of TEXT) row(`text ${a} on ${b}`, ratio(T[a], T[b]), 4.5);
    for (const [a, b] of UI) row(`ui   ${a} on ${b}`, ratio(T[a], T[b]), 3);
    for (const k of CHART) row(`chart ${k} on card`, ratio(T[k], T.card), 3);
    // Ordinal ramp: monotone lightness, min step, light end readable, single hue.
    const ls = RAMP.map(k => parse(T[k]).l);
    const hs = new Set(RAMP.map(k => parse(T[k]).h));
    const asc = ls.every((v, i) => i === 0 || Math.abs(v - ls[i - 1]) >= 0.06);
    if (!asc) {
        fails++;
        out.push("FAIL ramp adjacent delta L >= 0.06");
    } else out.push("  ok ramp adjacent delta L >= 0.06");
    if (hs.size !== 1) {
        fails++;
        out.push(`FAIL ramp single hue (got ${[...hs].join(",")})`);
    } else out.push("  ok ramp single hue");
    const nearest = name === "light" ? T["ramp-1"] : T["ramp-1"];
    row("ramp end nearest surface on card", ratio(nearest, T.card), 2.0);
    // Where an in-bar value label flips from foreground to background.
    // Where a value label on the fill has to flip from ink to paper. The
    // stylesheet declares it as a token; this is the check that it is right.
    const flip =
        RAMP.findIndex(k => ratio(T.foreground, T[k]) < 4.5) + 1 ||
        RAMP.length + 1;
    if (DECLARED_FLIP[name] !== flip) {
        fails++;
        out.push(
            `FAIL --ramp-label-flip is ${DECLARED_FLIP[name]}, should be ${flip}`
        );
    } else out.push(`  ok --ramp-label-flip ${flip}`);
    for (const [k, v] of Object.entries(T))
        if (!gamut(v)) {
            fails++;
            out.push(`FAIL out of sRGB gamut: ${k} ${v}`);
        }
    console.log(`\n== ${name} ==`);
    console.log(out.join("\n"));
    console.log(
        `chart hexes (${name}): ${CHART.map(k => hex(T[k])).join(",")}`
    );
    console.log(`ramp hexes  (${name}): ${RAMP.map(k => hex(T[k])).join(",")}`);
    console.log(`surface     (${name}): ${hex(T.card)}`);
    return fails;
}

for (const T of [L, D]) for (const [k, v] of Object.entries(T)) T[k] = snap(v);

/** What the stylesheet claims the in-bar label flips at, per mode. */
const DECLARED_FLIP = {
    light: Number(/:root \{[\s\S]*?--ramp-label-flip:\s*(\d+)/.exec(CSS)?.[1]),
    dark: Number(/\.dark \{[\s\S]*?--ramp-label-flip:\s*(\d+)/.exec(CSS)?.[1])
};

const fails = audit("light", L) + audit("dark", D);
if (SNAPPED.length > 0)
    console.log(`\nsnapped into sRGB:\n  ${SNAPPED.join("\n  ")}`);
if (process.argv.includes("--css")) {
    const block = T =>
        Object.entries(T)
            .map(([k, v]) => `    --${k}: ${v};`)
            .join("\n");
    console.log(`\n:root {\n${block(L)}\n}\n\n.dark {\n${block(D)}\n}`);
}
console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURES`}`);
process.exit(fails === 0 ? 0 : 1);
