"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type SignInResult } from "@/lib/auth/actions";
import type { SignInError } from "@/lib/auth/errors";

export function LoginForm({
    returnPath,
    initialError
}: {
    readonly returnPath: string;
    readonly initialError: SignInError | null;
}) {
    const t = useTranslations("Auth");
    const meta = useTranslations("Meta");
    const [state, formAction, isPending] = useActionState<
        SignInResult | null,
        FormData
    >(sendMagicLink, null);

    const emailId = useId();
    const errorId = useId();

    // The action's own failure supersedes the one the callback redirected with.
    const error: SignInError | null =
        state !== null && !state.ok ? state.error : (initialError ?? null);

    if (state !== null && state.ok) {
        return (
            <section className="flex w-full max-w-sm flex-col gap-3 rounded border bg-card px-3.5 py-4">
                <h1 className="text-[17px] leading-[1.3] font-semibold">
                    {t("sent.title")}
                </h1>
                <p className="text-[14px] leading-[1.35] text-muted-foreground">
                    {t("sent.body", { email: state.data.email })}
                </p>
                <form action={formAction} className="flex items-center gap-2">
                    <input
                        type="hidden"
                        name="email"
                        value={state.data.email}
                    />
                    <input type="hidden" name="next" value={returnPath} />
                    <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded text-xs"
                        disabled={isPending}
                    >
                        {isPending ? t("submitting") : t("sent.again")}
                    </Button>
                </form>
            </section>
        );
    }

    return (
        <section className="flex w-full max-w-sm flex-col gap-3 rounded border bg-card px-3.5 py-4">
            <div className="flex flex-col gap-1">
                <span
                    aria-hidden
                    className="mb-1 size-5 rounded-[3px] bg-primary"
                />
                <h1 className="text-[17px] leading-[1.3] font-semibold">
                    {meta("title")}
                </h1>
                <p className="text-[14px] leading-[1.35] text-muted-foreground">
                    {t("subtitle")}
                </p>
            </div>

            <form action={formAction} className="flex flex-col gap-2.5">
                <input type="hidden" name="next" value={returnPath} />
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={emailId} className="text-xs">
                        {t("emailLabel")}
                    </Label>
                    <Input
                        id={emailId}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder={t("emailPlaceholder")}
                        aria-invalid={error !== null}
                        aria-describedby={error === null ? undefined : errorId}
                        className="h-[30px] rounded text-xs"
                    />
                </div>

                {error !== null && (
                    // DESIGN §6: errors are text-first and local to what failed.
                    <p
                        id={errorId}
                        role="alert"
                        className="text-xs leading-[1.35] text-destructive"
                    >
                        {t(`errors.${error}`)}
                    </p>
                )}

                <Button
                    type="submit"
                    size="sm"
                    disabled={isPending}
                    className="h-[30px] rounded text-xs"
                >
                    {isPending ? t("submitting") : t("submit")}
                </Button>
            </form>
        </section>
    );
}
