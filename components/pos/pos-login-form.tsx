"use client";

import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { PinLogin } from "@/components/ui/pin-login";
import { posLogin } from "@/app/actions/pos-auth";
import type { Dictionary } from "@/lib/i18n/types";

type LoginErrorKey = keyof Dictionary["login"]["errors"];

/** PIN pad for the till. Cashier accounts only — admins are turned away. */
export function PosLoginForm() {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const t = dict.login;

  return (
    <PinLogin
      title={t.title}
      subtitle={t.subtitle}
      pinLabel={t.pinLabel}
      enterLabel={t.enter}
      icon={<ShoppingBag className="size-5 text-accent" />}
      onSubmit={async (pin) => {
        const res = await posLogin(pin);
        if (res.ok) {
          router.replace(`/${locale}`);
          router.refresh();
          return null;
        }
        return t.errors[res.error as LoginErrorKey] ?? dict.toast.genericError;
      }}
    />
  );
}
