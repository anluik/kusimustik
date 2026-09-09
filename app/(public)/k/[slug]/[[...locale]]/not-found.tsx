import { RunnerNotice } from "@/components/runner/runner-notice";

/**
 * A slug that matches no published or closed survey. It is a segment-level
 * boundary rather than `app/global-not-found.tsx` because that page is the
 * owner's — it speaks the owner's cookie locale and offers a link into the
 * dashboard, neither of which means anything to a stranger holding a bad link.
 */
export default function RunnerNotFound() {
    return <RunnerNotice kind="notFound" />;
}
