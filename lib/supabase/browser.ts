import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/db/env";
import type { Db } from "@/lib/db/types";

/**
 * The owner's client in the browser. Reads the same session cookies the server
 * client does, so a realtime subscription is authorised as the owner and the
 * RLS policy on the subscribed table is what decides which rows reach them.
 *
 * There is exactly one consumer: the live response count on the results page.
 * Everything else the owner does is a Server Component read or a Server Action
 * — a second data path into the same tables is how two screens start
 * disagreeing about what is in them.
 *
 * Memoised because `createBrowserClient` opens a websocket per instance, and a
 * re-rendered component that built its own would leak one each time.
 */
let client: Db | null = null;

export function createBrowserDb(): Db {
    client ??= createBrowserClient<Database>(
        supabaseUrl(),
        supabasePublishableKey()
    );
    return client;
}
