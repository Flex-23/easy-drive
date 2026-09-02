"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Delete, ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { authenticateUserPin } from "@/app/actions/auth";
import type { StaffView } from "@/lib/queries/users";

export function SwitchUserView({ users }: { users: StaffView[] }) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<StaffView | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(fullPin: string) {
    if (!selected) return;
    start(async () => {
      const res = await authenticateUserPin({ userId: selected.id, pin: fullPin });
      if (res.ok) {
        router.push(`/${locale}`);
        router.refresh();
      } else {
        setError(res.error);
        setPin("");
      }
    });
  }

  function press(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) submit(next);
  }

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <h1 className="mb-1 text-xl font-bold text-text">{dict.switchUser.title}</h1>
        <p className="mb-6 text-sm text-text-muted">{dict.switchUser.selectUser}</p>
        <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setSelected(u);
                setPin("");
                setError(null);
              }}
              className="card-lift press flex w-40 flex-col items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5"
            >
              <span
                className="flex size-16 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{ backgroundColor: u.avatarColor }}
              >
                {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
              </span>
              <span className="text-center">
                <span className="block font-semibold text-text">{u.name}</span>
                <span className="block text-xs text-text-muted">{dict.roles[u.role]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <button
        onClick={() => {
          setSelected(null);
          setPin("");
          setError(null);
        }}
        className="press mb-4 flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {dict.switchUser.selectUser}
      </button>

      <span
        className="mb-3 flex size-16 items-center justify-center rounded-full text-xl font-bold text-white"
        style={{ backgroundColor: selected.avatarColor }}
      >
        {selected.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
      </span>
      <p className="mb-1 font-semibold text-text">{selected.name}</p>
      <p className="mb-5 text-sm text-text-muted">{dict.switchUser.enterPin}</p>

      <div className="mb-5 flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-4 rounded-full border-2 transition-colors ${
              pin.length > i ? "border-accent bg-accent" : "border-border-strong"
            }`}
          />
        ))}
      </div>

      {error ? (
        <p className="mb-3 text-sm font-semibold text-danger">
          {error === "tooManyAttempts" ? dict.switchUser.tooManyAttempts : dict.switchUser.wrongPin}
        </p>
      ) : null}

      <div className="grid w-64 grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            disabled={pending}
            className="press flex min-h-14 items-center justify-center rounded-[var(--radius-btn)] border border-border bg-surface text-xl font-semibold text-text tnum hover:border-border-strong hover:bg-surface-muted disabled:opacity-50"
          >
            {k}
          </button>
        ))}
        <span />
        <button
          onClick={() => press("0")}
          disabled={pending}
          className="press flex min-h-14 items-center justify-center rounded-[var(--radius-btn)] border border-border bg-surface text-xl font-semibold text-text tnum hover:border-border-strong hover:bg-surface-muted disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="press flex min-h-14 items-center justify-center rounded-[var(--radius-btn)] border border-border text-text-muted hover:bg-surface-muted"
          aria-label={dict.keypad.backspace}
        >
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  );
}
