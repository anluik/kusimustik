import { z } from "zod";

import { unwrap } from "@/lib/db/errors";
import { TimestampSchema, parseRow } from "@/lib/db/parse";
import type { Db } from "@/lib/db/types";

/**
 * The public mirror of `auth.users`, maintained by a trigger. The application
 * only ever reads it, plus the owner's own display name.
 */

export const ProfileSchema = z.object({
    id: z.uuid(),
    email: z.email().nullable(),
    displayName: z.string().min(1).nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
export type Profile = z.infer<typeof ProfileSchema>;

export async function getProfile(db: Db, id: string): Promise<Profile | null> {
    const row = unwrap(
        `getProfile(${id})`,
        await db
            .from("profiles")
            .select("id, email, display_name, created_at, updated_at")
            .eq("id", id)
            .maybeSingle()
    );
    if (row === null) return null;

    return parseRow(
        ProfileSchema,
        {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        },
        `profile ${id}`
    );
}

export async function updateDisplayName(
    db: Db,
    id: string,
    displayName: string
): Promise<void> {
    unwrap(
        `updateDisplayName(${id})`,
        await db
            .from("profiles")
            .update({ display_name: displayName })
            .eq("id", id)
    );
}
