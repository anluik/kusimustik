"use client";

import { useFormatter } from "next-intl";

/** What a wave is named from. */
export type NamedWave = {
    readonly waveLabel: string | null;
    readonly createdAt: string;
};

/**
 * A wave's name everywhere a comparison shows one: its label, or — when the
 * owner never gave it one — the day it was created. Never the survey title,
 * which every wave of a series usually shares, and never a word like
 * "unlabelled", which two such waves would share too.
 */
export function useWaveName(): (wave: NamedWave) => string {
    const format = useFormatter();
    return wave =>
        wave.waveLabel ??
        format.dateTime(new Date(wave.createdAt), { dateStyle: "medium" });
}
