import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

/**
 * Every repository function takes the client as its first argument rather than
 * building one: the same function then serves a Server Component, a Server
 * Action, the anonymous runner and a test, and the caller stays responsible for
 * which identity — and therefore which RLS policies — the query runs under.
 */
export type Db = SupabaseClient<Database>;

export type Row<T extends keyof Database["public"]["Tables"]> =
    Database["public"]["Tables"][T]["Row"];
