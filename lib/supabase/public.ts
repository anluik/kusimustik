import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/db/env";
import type { Db } from "@/lib/db/types";

/**
 * The anonymous client the respondent runner reads and writes through. It
 * carries no session and touches no cookies, which is what keeps the runner's
 * render free of dynamic request APIs — DECISIONS 011 chose `survey.locale`
 * over a locale cookie for exactly that reason, and reading the *session*
 * cookie instead would have given the same property away.
 *
 * It also means a signed-in owner opening their own public link is treated as
 * a stranger, so the policies the runner exercises are the ones a respondent
 * gets rather than the owner's.
 */
export function createPublicDb(): Db {
    return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}
