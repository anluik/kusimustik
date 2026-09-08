import { describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db/types";
import { allowsWrite, clientIdentifier } from "@/lib/runner/throttle";

/**
 * What the limiter is keyed on, and what happens when it cannot answer.
 * The counting itself is Postgres's and is proved in `rate-limit.db.test.ts`.
 */

const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null
});

describe("clientIdentifier", () => {
    it("takes the leftmost forwarded address", () => {
        // Vercel rewrites the header, so the client is the first entry and the
        // proxies that follow are not.
        expect(
            clientIdentifier(
                headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })
            )
        ).toBe("203.0.113.7");
    });

    it("falls back to x-real-ip", () => {
        expect(clientIdentifier(headers({ "x-real-ip": "203.0.113.9" }))).toBe(
            "203.0.113.9"
        );
    });

    it("prefers the forwarded header when both are present", () => {
        expect(
            clientIdentifier(
                headers({
                    "x-forwarded-for": "203.0.113.7",
                    "x-real-ip": "10.0.0.1"
                })
            )
        ).toBe("203.0.113.7");
    });

    it("gives every headerless request one shared bucket", () => {
        // Local development and the e2e suite, where there is no proxy at all.
        // A constant is deliberate: throwing would take the runner down for the
        // want of a header nothing depends on.
        expect(clientIdentifier(headers({}))).toBe("unknown");
        expect(clientIdentifier(headers({ "x-forwarded-for": "  " }))).toBe(
            "unknown"
        );
    });

    it("truncates an over-long header rather than letting the database refuse it", () => {
        const identifier = clientIdentifier(
            headers({ "x-forwarded-for": "9".repeat(500) })
        );
        expect(identifier.length).toBeLessThanOrEqual(100);
    });
});

describe("allowsWrite", () => {
    const key = {
        bucket: "submit",
        scope: "rahulolu",
        client: "1.2.3.4"
    } as const;

    it("passes the limiter's verdict through", async () => {
        const db = {
            rpc: vi.fn().mockResolvedValue({ data: false, error: null })
        };
        await expect(allowsWrite(db as unknown as Db, key)).resolves.toBe(
            false
        );
        expect(db.rpc).toHaveBeenCalledWith("consume_rate_limit", {
            p_bucket: "submit",
            p_scope: "rahulolu",
            p_client: "1.2.3.4"
        });
    });

    it("fails open when the limiter itself is unavailable", async () => {
        // A limiter that is down must not be able to close a survey. The write
        // it lets through is still the RLS policies' to refuse.
        const db = {
            rpc: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "connection refused", code: "08006" }
            })
        };
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(allowsWrite(db as unknown as Db, key)).resolves.toBe(true);
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
    });
});
