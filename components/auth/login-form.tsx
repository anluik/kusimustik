"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { BrandMark } from "@/components/shell/brand-mark";
import { DISPLAY } from "@/components/type";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type SignInResult } from "@/lib/auth/actions";
import type { SignInError } from "@/lib/auth/errors";
import { cn } from "@/lib/utils";

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
            <section className="flex w-full max-w-[400px] flex-col gap-4 rounded-xl border border-border/70 bg-card px-6 py-6 shadow-sm">
                <h1 className={cn(DISPLAY, "text-[22px]")}>
                    {t("sent.title")}
                </h1>
                <p className="text-[14px] leading-[1.5] text-pretty text-muted-foreground">
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
                        className="h-9 rounded-lg text-[13px]"
                        disabled={isPending}
                    >
                        {isPending ? t("submitting") : t("sent.again")}
                    </Button>
                </form>
            </section>
        );
    }

    return (
        <section className="flex w-full max-w-[400px] flex-col gap-4 rounded-xl border border-border/70 bg-card px-6 py-6 shadow-sm">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                    <BrandMark className="size-7 text-primary" />
                    <h1 className={cn(DISPLAY, "text-[22px]")}>
                        {meta("title")}
                    </h1>
                </div>
                <p className="text-[14px] leading-[1.5] text-pretty text-muted-foreground">
                    {t("subtitle")}
                </p>
            </div>

            <form action={formAction} className="flex flex-col gap-2.5">
                <input type="hidden" name="next" value={returnPath} />
                <div className="flex flex-col gap-2">
                    <Label htmlFor={emailId} className="text-[13px]">
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
                        className="h-10 rounded-lg text-[14px]"
                    />
                </div>

                {error !== null && (
                    // DESIGN §6: errors are text-first and local to what failed.
                    <p
                        id={errorId}
                        role="alert"
                        className="text-[13px] leading-[1.4] text-destructive"
                    >
                        {t(`errors.${error}`)}
                    </p>
                )}

                <Button
                    type="submit"
                    disabled={isPending}
                    className="h-10 rounded-lg text-[14px] shadow-xs"
                >
                    {isPending ? t("submitting") : t("submit")}
                </Button>
            </form>
        </section>
    );
}
