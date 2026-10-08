"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ShieldCheck, User } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatNumber, formatDate } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffSchema } from "@/lib/validations/master";
import { saveStaff, deleteStaff } from "@/app/actions/staff";
import { EmptyState } from "@/components/ui/empty-state";
import type { StaffRow } from "@/lib/queries/master";
import type { Dictionary } from "@/lib/i18n/types";

type ValidationKey = keyof Dictionary["validation"];
type MasterErrorKey = keyof Dictionary["master"]["errors"];

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

/** Staff list plus the add/edit form — admins and cashiers with their sign-ins. */
export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = dict.master.staff;

  const [form, setForm] = useState<StaffRow | null | undefined>();
  const actionMsg = (key: string) =>
    dict.master.errors[key as MasterErrorKey] ?? dict.toast.genericError;

  function remove(row: StaffRow) {
    if (!window.confirm(t.deleteConfirm)) return;
    start(async () => {
      const res = await deleteStaff(row.id);
      if (res.ok) {
        toast(t.deleted, "success");
        router.refresh();
      } else toast(actionMsg(res.error), "error");
    });
  }

  return (
    <div className="p-5">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-bold text-text">{t.title}</h2>
          <button
            onClick={() => setForm(null)}
            className="press flex items-center gap-1 rounded-[var(--radius-btn)] bg-accent px-3 py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong"
          >
            <Plus className="size-4" />
            {t.add}
          </button>
        </header>

        {staff.length === 0 ? (
          <EmptyState icon={User}>{t.noStaff}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-faint">
                  <th className="px-4 py-2 text-start font-semibold">{t.name}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t.role}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t.active}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t.orders}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t.created}</th>
                  <th className="px-4 py-2 text-end font-semibold">{dict.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((row) => (
                  <tr key={row.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-muted/60">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 font-semibold text-text">
                        <span
                          className="size-6 shrink-0 rounded-full"
                          style={{ backgroundColor: row.avatarColor }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{row.name}</span>
                          <span className="block truncate text-xs font-normal text-text-faint" dir="ltr">
                            {row.email}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.role === "ADMIN"
                            ? "bg-accent-weak text-accent"
                            : "bg-surface-muted text-text-muted"
                        }`}
                      >
                        {row.role === "ADMIN" ? (
                          <ShieldCheck className="size-3.5" />
                        ) : (
                          <User className="size-3.5" />
                        )}
                        {dict.roles[row.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.isActive
                            ? "bg-success-weak text-success"
                            : "bg-surface-muted text-text-muted"
                        }`}
                      >
                        {row.isActive ? dict.common.yes : dict.common.no}
                      </span>
                    </td>
                    <td className="tnum px-4 py-2 text-end text-text-muted">
                      {formatNumber(row.orderCount, locale)}
                    </td>
                    <td className="tnum px-4 py-2 text-text-muted">
                      {formatDate(row.createdAt, locale)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setForm(row)}
                          aria-label={t.edit}
                          className="press rounded-md p-1.5 text-text-faint hover:text-text"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => remove(row)}
                          disabled={pending}
                          aria-label={dict.common.delete}
                          className="press rounded-md p-1.5 text-text-faint hover:text-danger disabled:opacity-40"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form !== undefined ? (
        <StaffFormModal
          staff={form}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            setForm(undefined);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function StaffFormModal({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { dict } = useI18n();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const t = dict.master.staff;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: staff?.name ?? "",
    email: staff?.email ?? "",
    role: staff?.role ?? ("CASHIER" as "ADMIN" | "CASHIER"),
    avatarColor: staff?.avatarColor ?? COLORS[0],
    isActive: staff?.isActive ?? true,
    password: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const msg = (key: string) =>
    dict.validation[key as ValidationKey] ?? dict.validation.required;
  const actionMsg = (key: string) =>
    dict.master.errors[key as MasterErrorKey] ?? dict.toast.genericError;

  function save() {
    const parsed = staffSchema.safeParse({
      ...(staff ? { id: staff.id } : {}),
      name: form.name,
      email: form.email,
      role: form.role,
      avatarColor: form.avatarColor,
      isActive: form.isActive,
      password: form.password,
    });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path.join(".");
        if (!fe[k]) fe[k] = i.message;
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await saveStaff(parsed.data);
      if (res.ok) {
        toast(t.saved, "success");
        onSaved();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast(actionMsg(res.error), "error");
      }
    });
  }

  const input =
    "w-full rounded-[var(--radius-btn)] border bg-surface-muted px-3 py-2 text-sm text-text outline-none focus:border-accent";
  const roles: ("ADMIN" | "CASHIER")[] = ["ADMIN", "CASHIER"];

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={dict.common.close}
      maxWidth="max-w-lg"
      title={staff ? t.edit : t.add}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="press rounded-[var(--radius-btn)] border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted"
          >
            {dict.common.cancel}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="press rounded-[var(--radius-btn)] bg-accent px-5 py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
          >
            {dict.common.save}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-text-muted">{t.name}</label>
          <input
            data-autofocus
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={`${input} ${errors.name ? "border-danger" : "border-border"}`}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{msg(errors.name)}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-text-muted">{t.email}</label>
          <input
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            className={`${input} ${errors.email ? "border-danger" : "border-border"}`}
          />
          {errors.email ? <p className="mt-1 text-xs text-danger">{msg(errors.email)}</p> : null}
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-text-muted">{t.role}</span>
          <div className="inline-flex overflow-hidden rounded-[var(--radius-btn)] border border-border">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => set("role", r)}
                className={`press px-4 py-2 text-sm font-semibold ${
                  form.role === r ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
                }`}
              >
                {dict.roles[r]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-text-muted">{t.password}</label>
          <input
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            type="password"
            autoComplete="new-password"
            dir="ltr"
            placeholder={t.passwordHint}
            className={`${input} ${errors.password ? "border-danger" : "border-border"}`}
          />
          <p className="mt-1 text-xs text-text-faint">{staff ? t.passwordKeep : t.passwordHint}</p>
          {errors.password ? <p className="mt-1 text-xs text-danger">{msg(errors.password)}</p> : null}
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-text-muted">{t.color}</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set("avatarColor", c)}
                aria-label={c}
                className={`press size-8 rounded-full border-2 ${
                  form.avatarColor === c ? "border-text" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-text">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {t.active}
        </label>
      </div>
    </Modal>
  );
}
