"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { PinLogin } from "@/components/ui/pin-login";
import { panelLogin } from "@/app/actions/panel-auth";
import type { Dictionary } from "@/lib/i18n/types";

type MasterErrorKey = keyof Dictionary["master"]["errors"];

/** PIN pad for the Master panel; any active admin's PIN opens it. */
export function PanelLoginForm() {
  const { dict } = useI18n();
  const router = useRouter();
  const t = dict.master.login;

  return (
    <PinLogin
      title={t.title}
      subtitle={t.subtitle}
      pinLabel={t.pinLabel}
      enterLabel={t.enter}
      icon={<ShieldCheck className="size-5 text-accent" />}
      onSubmit={async (pin) => {
        const res = await panelLogin(pin);
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
