import { clearSeededEvents } from "./support";

/**
 * Puts the seed back once, after every project has finished.
 *
 * It cannot be an `afterAll` in a spec: the two projects run in parallel, so
 * one spec's teardown would delete the events another spec is still asserting
 * on. See `e2e/support.ts` for why they have to go at all.
 */
export default async function globalTeardown(): Promise<void> {
    await clearSeededEvents();
}
