"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/context";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { customerSchema } from "@/lib/validations/customer";
import { upsertCustomer } from "@/app/actions/customers";
import type { CustomerView } from "@/lib/queries/customers";
import type { Dictionary } from "@/lib/i18n/types";

type ValidationKey = keyof Dictionary["validation"];

export function CustomerFormModal({
  open,
  prefillPhone,
  onClose,
  onSaved,
}: {
  open: boolean;
  prefillPhone: string;
  onClose: () => void;
  onSaved: (c: CustomerView) => void;
}) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    phone: prefillPhone,
    email: "",
    street: "",
    houseNumber: "",
    postalCode: "",
    city: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const msg = (key: string) =>
    dict.validation[key as ValidationKey] ?? dict.validation.required;

  function submit() {
    const hasAddress =
      form.street || form.houseNumber || form.postalCode || form.city;
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      address: hasAddress
        ? {
            street: form.street,
            houseNumber: form.houseNumber,
            postalCode: form.postalCode,
            city: form.city,
          }
        : undefined,
    };
    const parsed = customerSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!fe[key]) fe[key] = issue.message;
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await upsertCustomer({ ...parsed.data, locale });
      if (res.ok) {
        toast(dict.toast.customerSaved, "success");
        onSaved(res.data);
      } else {
        setErrors(res.fieldErrors ?? {});
        toast(dict.toast.genericError, "error");
      }
    });
  }

  const field =
    "w-full rounded-[var(--radius-btn)] border bg-surface-muted px-3 py-2 text-sm text-text outline-none focus:border-accent";

  const renderField = (
    name: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    span = 1,
  ) => (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="mb-1 block text-xs font-semibold text-text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} ${errors[name] ? "border-danger" : "border-border"}`}
      />
      {errors[name] ? (
        <p className="mt-1 text-xs text-danger">{msg(errors[name])}</p>
      ) : null}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={dict.customer.addCustomer}
      footer={
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="press flex-1 rounded-[var(--radius-btn)] border border-border py-2.5 text-sm font-semibold text-text-muted hover:bg-surface-muted"
          >
            {dict.common.cancel}
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="press flex-[2] rounded-[var(--radius-btn)] bg-accent py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
          >
            {dict.customer.save}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {renderField("name", dict.customer.name, form.name, set("name"), 2)}
        {renderField("phone", dict.customer.phone, form.phone, set("phone"))}
        {renderField("email", dict.customer.email, form.email, set("email"))}
        {renderField("address.street", dict.customer.street, form.street, set("street"))}
        {renderField("address.houseNumber", dict.customer.houseNumber, form.houseNumber, set("houseNumber"))}
        {renderField("address.postalCode", dict.customer.postalCode, form.postalCode, set("postalCode"))}
        {renderField("address.city", dict.customer.city, form.city, set("city"))}
      </div>
    </Modal>
  );
}
