import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// The owner app's request configuration. The runner does not use it — its
// locale comes from `survey.locale`; see docs/DECISIONS.md 011.
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
    // Supabase's local stack, and therefore `auth.site_url`, speak
    // 127.0.0.1 rather than localhost. Without this, `next dev` treats
    // requests from 127.0.0.1 as cross-origin and refuses to serve its own
    // chunks, so the page renders but never hydrates.
    allowedDevOrigins: ["127.0.0.1"],
    experimental: {
        // `app/(app)` and `app/(auth)` are separate root layouts (and the
        // runner will be a third), so there is no single layout for Next.js to
        // build a 404 from. `app/global-not-found.tsx` is that page.
        globalNotFound: true
    }
    // `/` used to redirect to `/surveys` because nothing rendered there. It is
    // the landing page now (docs/DECISIONS.md 038), and a redirect here would
    // win over the route: `redirects()` runs before routing, so the page would
    // never be reached and the cause would not be visible from `app/`.
};

export default withNextIntl(nextConfig);
