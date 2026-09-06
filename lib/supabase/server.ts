import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/db/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/db/env";
import type { Db } from "@/lib/db/types";

/**
 * A request-scoped client carrying the caller's session, so every query runs
 * under their RLS policies. Never cache or share it across requests.
 *
 * Repository functions in `lib/db/` take this as their first argument; they
 * never build one themselves.
 */
export async function createServerDb(): Promise<Db> {
    const store = await cookies();

    return createServerClient<Database>(
        supabaseUrl(),
        supabasePublishableKey(),
        {
            cookies: {
                getAll: () => store.getAll(),
                setAll(cookiesToSet) {
                    try {
                        for (const { name, value, options } of cookiesToSet) {
                            store.set(name, value, options);
                        }
                    } catch {
                        // Server Components get a read-only cookie store. The
                        // proxy refreshes the session on every request and
                        // writes the rotated tokens there instead, so losing
                        // this write is not losing the session.
                    }
                }
            }
        }
    );
}
