import { createClient } from "@supabase/supabase-js";

import { newQuestionId } from "@/domain/ids";
import { authorElements } from "@/domain/localize";
import type {
    AuthoredElement,
    NpsQuestion,
    OpinionScaleQuestion,
    ShortTextQuestion,
    SingleChoiceQuestion,
    StatementElement,
    SurveyElement
} from "@/domain/question";
import type { Database } from "@/lib/db/database.types";
import {
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseUrl
} from "@/lib/db/env";
import type { Db } from "@/lib/db/types";

/**
 * Fixtures for the `*.db.test.ts` integration tests. Not imported by
 * application code; it lives beside the repository rather than in a test folder
 * so `tsc` and ESLint cover it like anything else.
 */

const CLIENT_OPTIONS = {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
} as const;

/** Bypasses RLS entirely. Test setup and teardown only. */
export function serviceClient(): Db {
    return createClient<Database>(
        supabaseUrl(),
        supabaseSecretKey(),
        CLIENT_OPTIONS
    );
}

/** Exactly what a respondent arriving from a link gets. */
export function anonClient(): Db {
    return createClient<Database>(
        supabaseUrl(),
        supabasePublishableKey(),
        CLIENT_OPTIONS
    );
}

export type TestUser = {
    readonly id: string;
    readonly email: string;
    /** A publishable-key client carrying this user's session. */
    readonly db: Db;
};

export async function createTestUser(label: string): Promise<TestUser> {
    const email = `${label}-${crypto.randomUUID()}@kusimustik.test`;
    const password = `pw-${crypto.randomUUID()}`;

    const created = await serviceClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });
    if (created.error !== null || created.data.user === null) {
        throw new Error(
            `could not create ${email}: ${created.error?.message ?? "no user"}`
        );
    }

    const db = anonClient();
    const signedIn = await db.auth.signInWithPassword({ email, password });
    if (signedIn.error !== null) {
        throw new Error(
            `could not sign in ${email}: ${signedIn.error.message}`
        );
    }

    return { id: created.data.user.id, email, db };
}

/** Cascades through profiles to every survey, response and event they own. */
export async function deleteTestUser(user: TestUser): Promise<void> {
    await serviceClient().auth.admin.deleteUser(user.id);
}

export async function signIn(email: string, password: string): Promise<Db> {
    const db = anonClient();
    const signedIn = await db.auth.signInWithPassword({ email, password });
    if (signedIn.error !== null) {
        throw new Error(
            `could not sign in ${email}: ${signedIn.error.message}`
        );
    }
    return db;
}

/* Element builders. Fresh ids every call: question_id is a primary key across
   the whole table, so two surveys can never share one.

   They build the *resolved* shape — one language, plain strings — because that
   is what reads like a survey in a test. `stored()` is what turns a hand-built
   document into the shape `surveys.elements` actually holds. */

/** A hand-built document as it is stored: authored in Estonian, translated
    into nothing, which is every survey the migration touched. */
export function stored(elements: readonly SurveyElement[]): AuthoredElement[] {
    return authorElements(elements, "et");
}

export function statementElement(key: string): StatementElement {
    return {
        type: "statement",
        isAnswerable: false,
        id: newQuestionId(),
        key,
        title: `Statement ${key}`
    };
}

export function singleChoiceQuestion(key: string): SingleChoiceQuestion {
    return {
        type: "single_choice",
        isAnswerable: true,
        id: newQuestionId(),
        key,
        title: `Single choice ${key}`,
        required: true,
        allowOther: false,
        options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" }
        ]
    };
}

export function npsQuestion(key: string): NpsQuestion {
    return {
        type: "nps",
        isAnswerable: true,
        id: newQuestionId(),
        key,
        title: `NPS ${key}`,
        required: true
    };
}

export function shortTextQuestion(key: string): ShortTextQuestion {
    return {
        type: "short_text",
        isAnswerable: true,
        id: newQuestionId(),
        key,
        title: `Short text ${key}`,
        required: false
    };
}

export function opinionScaleQuestion(key: string): OpinionScaleQuestion {
    return {
        type: "opinion_scale",
        isAnswerable: true,
        id: newQuestionId(),
        key,
        title: `Opinion scale ${key}`,
        required: true,
        max: 5
    };
}

/** A slug that cannot collide with another test run's. */
export function testSlug(label: string): string {
    return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}
