import { z } from "zod";

/**
 * The owner's own account, as far as the domain is concerned.
 *
 * Only the display name lives here: the email is Supabase's, the id is
 * Supabase's, and neither is ours to validate. Trimmed and bounded like every
 * other name in the product, so a display name of nothing but spaces is
 * rejected rather than stored and then rendered as a blank line.
 */
export const DisplayNameSchema = z.string().trim().min(1).max(120);
export type DisplayName = z.infer<typeof DisplayNameSchema>;
