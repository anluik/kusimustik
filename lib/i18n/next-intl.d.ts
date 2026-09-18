import type { UiLocale } from "@/lib/i18n/locales";
import type {
    AppMessages,
    MarketingMessages,
    RunnerMessages
} from "@/lib/i18n/messages";

/**
 * next-intl exposes exactly one global `Messages` type, but this app ships
 * three catalogues (docs/DECISIONS.md 011 and 038). Intersecting them gives
 * owner, runner and landing components typed keys without a cast at the
 * provider boundary; the price is that the type system will not stop a runner
 * component from naming an owner key. `lib/i18n/messages.test.ts` keeps the
 * three namespace sets pairwise disjoint, so such a mistake fails as a missing
 * message at runtime rather than silently resolving. The bundle split — which
 * is the point — is unaffected.
 */
declare module "next-intl" {
    interface AppConfig {
        Locale: UiLocale;
        Messages: AppMessages & RunnerMessages & MarketingMessages;
    }
}
