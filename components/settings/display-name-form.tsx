"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DisplayNameSchema } from "@/domain/profile";
import { saveDisplayNameAction } from "@/lib/account/actions";
import type { AccountActionError } from "@/lib/account/errors";

/**
 * The owner's display name.
 *
 * A form rather than the static line it used to be: `updateDisplayName` and
 * its policy have existed since Phase 3, but nothing called them, so someone
 * who signed up with a magic link had no way to be called anything. A survey's
 * respondents never see this — it is the name the app itself uses.
 *
 * The schema is the domain's, so the same rule decides what this rejects and
 * what the action accepts. Saved state is local and quiet: a name is not a
 * publish, and DESIGN §6 keeps confirmation for the thing that failed.
 */
const FormSchema = z.object({ displayName: DisplayNameSchema });
type FormValues = z.infer<typeof FormSchema>;

export function DisplayNameForm({
    displayName
}: {
    readonly displayName: string | null;
}) {
    const t = useTranslations("Settings.account");
    const tErrors = useTranslations("Settings.account.errors");

    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<AccountActionError | null>(null);
    const [saved, setSaved] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: { displayName: displayName ?? "" }
    });

    function onSubmit(values: FormValues) {
        setError(null);
        setSaved(false);
        startTransition(async () => {
            const result = await saveDisplayNameAction(values);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            // Reset to what was saved, so the field is clean again and a
            // second press of Save is not offered for a change that is in.
            form.reset(values);
            setSaved(true);
        });
    }

    return (
        <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-1.5"
        >
            <Label
                htmlFor="account-display-name"
                className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
            >
                {t("name")}
            </Label>
            <div className="flex items-center gap-2">
                <Input
                    id="account-display-name"
                    autoComplete="name"
                    placeholder={t("namePlaceholder")}
                    aria-invalid={
                        form.formState.errors.displayName !== undefined
                    }
                    className="h-[30px] rounded text-xs"
                    {...form.register("displayName", {
                        onChange: () => setSaved(false)
                    })}
                />
                <Button
                    type="submit"
                    size="sm"
                    disabled={pending}
                    className="h-[30px] shrink-0 rounded text-xs"
                >
                    {t("save")}
                </Button>
            </div>

            {error !== null ? (
                <p
                    role="alert"
                    className="flex items-start gap-1.5 text-[11px] leading-[1.35] text-destructive"
                >
                    <span
                        aria-hidden
                        className="mt-1 size-1.5 shrink-0 rounded-4xl bg-destructive"
                    />
                    {tErrors(error)}
                </p>
            ) : (
                <p
                    aria-live="polite"
                    className="text-[11px] leading-[1.35] text-muted-foreground"
                >
                    {saved ? t("saved") : t("nameHelp")}
                </p>
            )}
        </form>
    );
}
