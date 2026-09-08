"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { DisplayNameSchema } from "@/domain/profile";
import { failed, ok, runAction } from "@/lib/actions/result";
import { requireSessionUser } from "@/lib/auth/session";
import type { AccountActionResult } from "@/lib/account/errors";
import { updateDisplayName } from "@/lib/db/profiles";
import { createServerDb } from "@/lib/supabase/server";

/**
 * The owner's own account.
 *
 * Like every other action here this is a public POST endpoint, so it re-checks
 * the session and re-parses its input. It never takes an id: the row it writes
 * is the caller's own, decided by `requireSessionUser`, and `profiles`' RLS
 * would refuse anything else anyway — the two together mean this cannot be
 * pointed at somebody else's name however it is called.
 */

const DisplayNameInputSchema = z.object({ displayName: DisplayNameSchema });
export type SaveDisplayNameInput = z.input<typeof DisplayNameInputSchema>;

export async function saveDisplayNameAction(
    input: SaveDisplayNameInput
): Promise<AccountActionResult> {
    return runAction("failed", async () => {
        const user = await requireSessionUser();
        const parsed = DisplayNameInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const db = await createServerDb();
        await updateDisplayName(db, user.id, parsed.data.displayName);

        // The sidebar's user menu reads the name from the session, so the
        // whole shell has to follow the save rather than the settings page
        // alone.
        refresh();
        return ok(undefined);
    });
}
