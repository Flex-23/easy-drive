"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { CredentialsLogin } from "@/components/ui/credentials-login";
import { panelLogin } from "@/app/actions/panel-auth";
import type { Dictionary } from "@/lib/i18n/types";

type MasterErrorKey = keyof Dictionary["master"]["errors"];

/** Sign-in for the Master panel; any active admin's e-mail and password opens it. */
export function PanelLoginForm() {
  const { dict } = useI18n();
  const router = useRouter();
  const t = dict.master.login;

  return (
    <CredentialsLogin
      title={t.title}
      subtitle={t.subtitle}
      enterLabel={t.enter}
      icon={<ShieldCheck className="size-5 text-accent" />}
      onSubmit={async (credentials) => {
        const res = await panelLogin(credentials);
        if (res.ok) {
          router.replace("/panel");
          router.refresh();
          return null;
        }
        return (
          dict.master.errors[res.error as MasterErrorKey] ?? dict.toast.genericError
        );
      }}
    />
  );
}
