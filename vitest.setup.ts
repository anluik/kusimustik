import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmounts whatever the last test rendered.
 *
 * `@testing-library/react` registers this itself when a test runner exposes
 * its globals, and this project deliberately does not (`globals` is off, so
 * every `describe`/`it`/`expect` is imported). Without it each rendered tree
 * is left in the document and the next query finds two of everything.
 */
afterEach(cleanup);
