import type { UiLocale } from "@/lib/i18n/locales";
import type { AppMessages, RunnerMessages } from "@/lib/i18n/messages";

/**
 * next-intl exposes exactly one global `Messages` type, but this app ships two
 * catalogues (docs/DECISIONS.md 011). Intersecting them gives owner and runner
 * components typed keys without a cast at the provider boundary; the price is
 * that the type system will not stop a runner component from naming an owner
 * key. `lib/i18n/messages.test.ts` keeps the two namespace sets disjoint, so
 * such a mistake fails as a missing message at runtime rather than silently
 * resolving. The bundle split — which is the point — is unaffected.
 */
declare module "next-intl" {
    interface AppConfig {
        Locale: UiLocale;
        Messages: AppMessages & RunnerMessages;
    }
}
